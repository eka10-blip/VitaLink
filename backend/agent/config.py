"""Local configuration; never print keys or tokens."""
import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
from livekit import api

ROOT = Path(__file__).resolve().parent
# Load base .env first; .env.local (Chert + local secrets) always wins.
load_dotenv(ROOT / '.env')
load_dotenv(ROOT / '.env.local', override=True)


def required(name: str) -> str:
    value = os.getenv(name, '').strip()
    if not value or 'YOUR_PROJECT' in value:
        raise ValueError(f'Set {name} in backend/agent/.env')
    return value


def settings() -> dict[str, str]:
    result = {
        'url': required('LIVEKIT_URL'),
        'room': os.getenv('LIVEKIT_ROOM', 'vitalink-demo'),
        'agent': os.getenv('AGENT_IDENTITY', 'vitalink-agent'),
        'connector': os.getenv('CONNECTOR_IDENTITY', 'vitalink-facetime'),
    }
    if result['agent'] == result['connector']:
        raise ValueError('Agent and connector identities must differ')
    return result


def room_token(identity: str, room: str) -> str:
    return (
        api.AccessToken(required('LIVEKIT_API_KEY'), required('LIVEKIT_API_SECRET'))
        .with_identity(identity)
        .with_ttl(timedelta(minutes=30))
        .with_grants(api.VideoGrants(
            room_join=True, room=room, can_publish=True, can_subscribe=True,
        ))
        .to_jwt()
    )
