"""Local immediate Story publisher. stdout is a secret-free JSON protocol."""
import contextlib
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import sys
from urllib.parse import urlparse, parse_qsl, parse_qs

ROOT = Path(__file__).resolve().parent
STATE = ROOT / 'state'
LINK_LAYOUT = json.loads((ROOT / 'story-layout.json').read_text(encoding='utf8'))


class SecurityStop(Exception):
    pass


def configured():
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env', override=False)
    session = Path(os.environ.get('INSTAGRAPI_SESSION_FILE') or STATE / 'session.json')
    return session


def security_error(exc):
    return isinstance(exc, SecurityStop) or any(word in type(exc).__name__.lower() for word in
        ('challenge', 'checkpoint', 'twofactor', 'loginrequired', 'badpassword', 'sentry', 'feedback', 'pleasewait', 'ratelimit', 'throttled', 'consent'))


def transient(exc):
    return type(exc).__name__ in {'ClientConnectionError', 'ClientRequestTimeout', 'ConnectTimeout',
        'ReadTimeout', 'ConnectionError', 'Timeout', 'ClientUnknownError'}


def authenticated(session):
    from instagrapi import Client

    class SafeClient(Client):
        def challenge_resolve(self, *args, **kwargs):
            raise SecurityStop('Complete verification in the official Instagram app')

    client = SafeClient()
    default_request_pause = client.request_timeout
    def configure_requests():
        # request_timeout is a pause between calls in instagrapi, not its socket timeout.
        # Keep the library's default pace and stop on rate limits instead of retrying 429.
        client.set_retry_config(request_timeout=default_request_pause,
            session_retry_total=0, public_request_retries_count=0)
    client.challenge_code_handler = lambda *args, **kwargs: (_ for _ in ()).throw(SecurityStop())
    if session.is_file():
        client.load_settings(session)
        configure_requests()
        client.get_timeline_feed()  # Validate the saved session without password relogin.
    else:
        username, password = os.getenv('INSTAGRAPI_USERNAME'), os.getenv('INSTAGRAPI_PASSWORD')
        if not username or not password:
            raise ValueError('local_credentials_missing')
        configure_requests()
        client.login(username, password)
    # Persist only locally; never log credentials or raw API exceptions.
    session.parent.mkdir(parents=True, exist_ok=True)
    temporary = session.with_suffix('.tmp')
    client.dump_settings(temporary)
    os.chmod(temporary, 0o600)
    os.replace(temporary, session)
    return client


def link_matches(returned, expected):
    actual = urlparse(str(returned))
    wanted = urlparse(expected)
    if actual.hostname == 'l.instagram.com':
        targets = parse_qs(actual.query).get('u', [])
        if len(targets) != 1:
            return False
        actual = urlparse(targets[0])
    if (actual.scheme, actual.netloc, actual.path, actual.fragment) != (wanted.scheme, wanted.netloc, wanted.path, wanted.fragment):
        return False
    expected_query = parse_qsl(wanted.query, keep_blank_values=True)
    actual_query = parse_qsl(actual.query, keep_blank_values=True)
    # Instagram may add its own click attribution; preserve every original affiliate parameter.
    if not any(key == 'fbclid' for key, _ in expected_query):
        actual_query = [(key, value) for key, value in actual_query if key != 'fbclid']
    return actual_query == expected_query


def verify(client, story_id, url, state=STATE):
    try:
        story = client.story_info(story_id, use_cache=False)
        urls = [str(link.webUri) for link in story.links]
        urls += [str(sticker.story_link.url) for sticker in story.stickers if sticker.story_link]
        return any(link_matches(returned, url) for returned in urls)
    except Exception as exc:
        if security_error(exc):
            (state / 'account-blocked.json').write_text('{"blocked":true}', encoding='utf8')
        return False


def publish(payload, client_factory=authenticated, session=None, state=None):
    from instagrapi.types import StoryLink
    from PIL import Image
    state = state or STATE
    state.mkdir(parents=True, exist_ok=True)
    key = payload.get('key', '')
    if not re.fullmatch(r'[a-f0-9]{64}', key):
        return {'status': 'failed', 'error': 'invalid_key'}
    url = payload['affiliateUrl']
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        return {'status': 'failed', 'error': 'invalid_affiliate_url'}
    image = Path(payload['imagePath']).resolve(strict=True)
    with Image.open(image) as photo:
        if photo.size != (1080, 1920):
            return {'status': 'failed', 'error': 'image_must_be_1080x1920'}
    # One account process at a time, even if the Node application is restarted.
    with contextlib.closing(sqlite3.connect(state / 'receipts.sqlite', timeout=190)) as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS receipts (key TEXT PRIMARY KEY, result TEXT NOT NULL)')
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT result FROM receipts WHERE key=?', (key,)).fetchone()
        if row:
            result = json.loads(row[0])
            if result['status'] != 'retryable':
                return result
        if (state / 'account-blocked.json').exists():
            return {'status': 'blocked', 'error': 'official_app_verification_or_rate_limit_required'}
        try:
            client = client_factory(session or state / 'session.json')
        except Exception as exc:
            if security_error(exc):
                (state / 'account-blocked.json').write_text('{"blocked":true}', encoding='utf8')
                result = {'status': 'blocked', 'error': 'complete_official_app_verification_then_recheck_session'}
            else:
                safe_retry = transient(exc) or str(exc) == 'local_credentials_missing'
                result = {'status': 'retryable' if safe_retry else 'failed', 'error': 'authentication_' + type(exc).__name__}
            db.execute('INSERT OR REPLACE INTO receipts VALUES(?,?)', (key, json.dumps(result)))
            db.commit()
            return result
        # Commit the uncertain receipt BEFORE the first upload request. Never blindly repeat it.
        result = {'status': 'uncertain', 'error': 'upload_started_without_confirmed_receipt'}
        db.execute('INSERT OR REPLACE INTO receipts VALUES(?,?)', (key, json.dumps(result)))
        db.commit()
        db.execute('BEGIN IMMEDIATE')
        try:
            story = client.photo_upload_to_story(image, caption=payload.get('caption', ''),
                links=[StoryLink(webUri=url, **LINK_LAYOUT)])
            result = {'status': 'published', 'storyId': str(story.pk), 'linkVerified': False,
                'linkMetadataVerified': False, 'linkVerificationScope': 'metadata_only',
                'stickerVisibleVerified': None, 'tapVerified': None}
            # Save the published ID before doing any read-back request.
            db.execute('UPDATE receipts SET result=? WHERE key=?', (json.dumps(result), key))
            db.commit()
            result['linkVerified'] = verify(client, story.pk, url, state=state)
            result['linkMetadataVerified'] = result['linkVerified']
        except Exception as exc:
            if security_error(exc):
                (state / 'account-blocked.json').write_text('{"blocked":true}', encoding='utf8')
            result = {'status': 'uncertain', 'error': 'upload_' + type(exc).__name__}
        db.execute('UPDATE receipts SET result=? WHERE key=?', (json.dumps(result), key))
        db.commit()
        return result


def main():
    session = configured()
    command = sys.argv[1] if len(sys.argv) > 1 else 'check'
    if command == 'check':
        return {'credentialsConfigured': bool(os.getenv('INSTAGRAPI_USERNAME') and os.getenv('INSTAGRAPI_PASSWORD')),
            'savedSessionPresent': session.is_file(), 'accountBlocked': (STATE / 'account-blocked.json').exists()}
    if command == 'login':
        authenticated(session)
        return {'status': 'session_saved'}
    if command == 'publish':
        return publish(json.load(sys.stdin), session=session)
    raise ValueError('invalid_command')


if __name__ == '__main__':
    logging.disable(logging.CRITICAL)
    try:
        with contextlib.redirect_stdout(sys.stderr):
            response = main()
    except Exception as exc:
        status = 'blocked' if security_error(exc) else ('retryable' if isinstance(exc, ModuleNotFoundError) else 'failed')
        response = {'status': status, 'error': type(exc).__name__}
    print(json.dumps(response))
