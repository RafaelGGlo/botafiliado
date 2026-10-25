"""Read-only verification of the five authorized Story test receipts."""
import contextlib
import hashlib
import json
import logging
import sqlite3
from urllib.parse import urlparse
from publisher import STATE, authenticated, configured, security_error, link_matches


def inspect_raw(value, story_id, expected_url):
    if isinstance(value, dict):
        if str(value.get('pk') or value.get('id', '')).split('_')[0] == story_id:
            links = value.get('story_link_stickers') or []
            return {'rawStoryFound': True, 'nativeLinkCount': len(links),
                'nativeLinkMatches': any((x.get('story_link') or {}).get('url') == expected_url for x in links)}
        for child in value.values():
            result = inspect_raw(child, story_id, expected_url)
            if result:
                return result
    elif isinstance(value, list):
        for child in value:
            result = inspect_raw(child, story_id, expected_url)
            if result:
                return result
    return None


def main():
    session = configured()
    if (STATE / 'account-blocked.json').exists():
        return [{'status': 'blocked'}]
    client = authenticated(session)
    offer = json.loads((STATE / 'live-offer.json').read_text(encoding='utf8'))
    expected = offer['affiliateUrl']
    own_stories = {str(story.pk): story for story in client.user_stories_v1(client.user_id)}
    results = []
    with contextlib.closing(sqlite3.connect(STATE / 'receipts.sqlite')) as db:
        for n in range(1, 6):
            key = hashlib.sha256(f'authorized-instagrapi-live-test-{n}'.encode()).hexdigest()
            row = db.execute('SELECT result FROM receipts WHERE key=?', (key,)).fetchone()
            result = json.loads(row[0]) if row else {'status': 'not_attempted'}
            summary = {'label': f'TESTE {n}/5', **result}
            if result.get('storyId'):
                try:
                    story = own_stories.get(result['storyId'])
                    if story is None:
                        story = client.story_info(result['storyId'], use_cache=False)
                    summary['readBackPublished'] = str(story.pk) == result['storyId']
                    summary['linkCount'] = len(story.links)
                    summary['linkVerified'] = any(link_matches(str(x.webUri), expected) for x in story.links)
                    summary['expectedLinkHost'] = urlparse(expected).hostname
                    summary['returnedLinkHosts'] = [urlparse(str(x.webUri)).hostname for x in story.links]
                except Exception as exc:
                    summary['readBackError'] = type(exc).__name__
                    if security_error(exc):
                        (STATE / 'account-blocked.json').write_text('{"blocked":true}', encoding='utf8')
                        results.append(summary)
                        break
                summary.update(inspect_raw(client.last_json, result['storyId'], expected) or {})
            results.append(summary)
    (STATE / 'live-tests/verification.json').write_text(json.dumps(results, indent=2), encoding='utf8')
    return results


if __name__ == '__main__':
    logging.disable(logging.CRITICAL)
    try:
        print(json.dumps(main()))
    except Exception as exc:
        print(json.dumps({'error': type(exc).__name__}))
