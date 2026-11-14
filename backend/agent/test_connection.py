"""Offline checks for connector access boundaries; never call providers."""
import os
import unittest
from unittest.mock import patch

import jwt
from config import room_token, settings


class ConnectionConfigTests(unittest.TestCase):
    def test_connector_token_is_room_scoped_and_short_lived(self):
        secret = 'test-only-signing-key-not-a-real-secret-123456'
        with patch.dict(os.environ, {'LIVEKIT_API_KEY': 'test-key',
                                    'LIVEKIT_API_SECRET': secret}, clear=True):
            token = room_token('connector', 'test-room')
        claims = jwt.decode(token, secret, algorithms=['HS256'])
        self.assertEqual(claims['sub'], 'connector')
        self.assertEqual(claims['video']['room'], 'test-room')
        for grant in ('roomJoin', 'canPublish', 'canSubscribe'):
            self.assertTrue(claims['video'][grant])
        self.assertFalse(claims['video'].get('roomAdmin', False))
        self.assertLessEqual(claims['exp'] - claims['nbf'], 1800)

    def test_identity_collision_rejected(self):
        with patch.dict(os.environ, {'LIVEKIT_URL': 'wss://example.invalid',
                                    'AGENT_IDENTITY': 'same',
                                    'CONNECTOR_IDENTITY': 'same'}, clear=True):
            with self.assertRaisesRegex(ValueError, 'must differ'):
                settings()

    def test_missing_credentials_fail_before_connection(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'LIVEKIT_API_KEY'):
                room_token('connector', 'test-room')


if __name__ == '__main__':
    unittest.main()
