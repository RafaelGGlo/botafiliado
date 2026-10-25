from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from urllib.parse import quote
from PIL import Image
import publisher


class PublisherTests(unittest.TestCase):
    def test_instagram_redirect_preserves_affiliate_url_and_original_parameters(self):
        expected = 'https://shope.ee/example?campaign=a&campaign=b'
        wrapped = 'https://l.instagram.com/?u=' + quote(expected + '&fbclid=instagram-click', safe='')
        self.assertTrue(publisher.link_matches(wrapped, expected))
        self.assertFalse(publisher.link_matches(wrapped, expected.replace('campaign=b', 'campaign=c')))
        self.assertFalse(publisher.link_matches('https://other.example/?u=' + quote(expected, safe=''), expected))
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.state = Path(self.temporary.name)
        self.image = self.state / 'story.jpg'
        Image.new('RGB', (1080, 1920), 'white').save(self.image)
        self.payload = dict(key='a' * 64, imagePath=str(self.image),
            affiliateUrl='https://shope.ee/example', caption='Produto R$ 19,90')
        self.uploads = []

    def client(self, _session):
        def upload(image, **kwargs):
            self.uploads.append(kwargs)
            return SimpleNamespace(pk='123')
        return SimpleNamespace(photo_upload_to_story=upload,
            story_info=lambda *args, **kwargs: SimpleNamespace(
                links=[SimpleNamespace(webUri=self.payload['affiliateUrl'])], stickers=[]))

    def test_native_link_and_persisted_duplicate_protection(self):
        first = publisher.publish(self.payload, self.client, state=self.state)
        second = publisher.publish(self.payload, self.client, state=self.state)
        self.assertEqual(first, second)
        self.assertEqual(first['status'], 'published')
        self.assertTrue(first['linkVerified'])
        self.assertTrue(first['linkMetadataVerified'])
        self.assertEqual(first['linkVerificationScope'], 'metadata_only')
        self.assertIsNone(first['stickerVisibleVerified'])
        self.assertIsNone(first['tapVerified'])
        self.assertEqual(len(self.uploads), 1)
        link = self.uploads[0]['links'][0]
        self.assertEqual(str(link.webUri), self.payload['affiliateUrl'])
        self.assertEqual((link.x, link.y), (.5, .88))
        self.assertEqual((link.width, link.height), (.52, .05))

    def test_ambiguous_upload_is_never_repeated(self):
        def factory(session):
            client = self.client(session)
            def timeout(*args, **kwargs):
                self.uploads.append('attempted')
                raise TimeoutError()
            client.photo_upload_to_story = timeout
            return client
        for _ in range(2):
            self.assertEqual(publisher.publish(self.payload, factory, state=self.state)['status'], 'uncertain')
        self.assertEqual(len(self.uploads), 1)

    def test_security_stop_blocks_other_offers_without_upload(self):
        calls = []
        def blocked(session):
            calls.append(1)
            raise publisher.SecurityStop()
        self.assertEqual(publisher.publish(self.payload, blocked, state=self.state)['status'], 'blocked')
        self.payload['key'] = 'b' * 64
        self.assertEqual(publisher.publish(self.payload, blocked, state=self.state)['status'], 'blocked')
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(self.uploads), 0)

    def test_pre_upload_connection_failure_can_retry(self):
        class ClientConnectionError(Exception):
            pass
        def unavailable(session):
            raise ClientConnectionError()
        self.assertEqual(publisher.publish(self.payload, unavailable, state=self.state)['status'], 'retryable')
        self.assertEqual(publisher.publish(self.payload, self.client, state=self.state)['status'], 'published')
        self.assertEqual(len(self.uploads), 1)


if __name__ == '__main__':
    unittest.main()
