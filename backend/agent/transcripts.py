"""Durable local transcript and Presage handoff; no provider calls."""
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SessionTranscript:
    def __init__(self, root: Path, room: str, agent: str, connector: str):
        self.session_id = str(uuid.uuid4())
        self.path = root / self.session_id
        self.path.mkdir(parents=True, mode=0o700)
        self.seen: set[str] = set()
        self.manifest = {
            'schema_version': 1, 'session_id': self.session_id,
            'patient_id': os.getenv('PATIENT_ID', 'synthetic-demo-patient'),
            'room_name': room, 'agent_identity': agent, 'connector_identity': connector,
            'started_at': utc_now(), 'ended_at': None, 'status': 'starting',
            'transcript_file': 'transcript.jsonl', 'turn_count': 0,
            'presage': {'status': 'not_connected', 'measurements': None},
            'caregiver_report': None,
            'timing': 'UTC message/event times; not sample-aligned audio timestamps',
        }
        fd = os.open(self.path / 'transcript.jsonl', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        self._output = os.fdopen(fd, 'w', encoding='utf-8')
        self._save()

    def _save(self) -> None:
        temporary = self.path / 'handoff.json.tmp'
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as output:
            json.dump(self.manifest, output, indent=2, ensure_ascii=False)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(self.path / 'handoff.json')

    def mark(self, status: str) -> None:
        self.manifest['status'] = status
        self._save()

    def append(self, item) -> None:
        if item.role not in ('user', 'assistant') or not item.text_content or item.id in self.seen:
            return
        row = {
            'schema_version': 1, 'session_id': self.session_id,
            'sequence': self.manifest['turn_count'] + 1,
            'item_id': item.id, 'role': item.role, 'text': item.text_content,
            'interrupted': item.interrupted,
            'message_at': datetime.fromtimestamp(item.created_at, timezone.utc).isoformat(),
            'captured_at': utc_now(), 'source': 'livekit.conversation_item_added',
        }
        self._output.write(json.dumps(row, ensure_ascii=False) + '\n')
        self._output.flush()
        os.fsync(self._output.fileno())
        self.seen.add(item.id)
        self.manifest['turn_count'] += 1
        self._save()

    def close(self, status: str) -> None:
        if self._output.closed:
            return
        self.manifest['status'] = status
        self.manifest['ended_at'] = utc_now()
        self._output.close()
        self._save()
