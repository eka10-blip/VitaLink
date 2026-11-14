"""Offline synthetic fixtures only; no simulated provider responses."""
import json
import tempfile
import unittest
from pathlib import Path

from livekit.agents.llm import ChatMessage
from transcripts import SessionTranscript


class TranscriptTests(unittest.TestCase):
    def test_flush_deduplicate_and_preserve_interruption(self):
        with tempfile.TemporaryDirectory() as temporary:
            writer = SessionTranscript(Path(temporary), 'test-room', 'agent', 'connector')
            item = ChatMessage(id='test-message', role='assistant',
                               content=['Synthetic test fixture.'], interrupted=True)
            writer.append(item)
            writer.append(item)
            # Read while writer is still open: committed content must already be on disk.
            rows = [json.loads(line) for line in (writer.path / 'transcript.jsonl').read_text().splitlines()]
            self.assertEqual(len(rows), 1)
            self.assertTrue(rows[0]['interrupted'])
            self.assertEqual(rows[0]['session_id'], writer.session_id)
            self.assertEqual((writer.path / 'transcript.jsonl').stat().st_mode & 0o777, 0o600)
            writer.close('stopped')
            handoff = json.loads((writer.path / 'handoff.json').read_text())
            self.assertEqual(handoff['turn_count'], 1)
            self.assertIsNotNone(handoff['ended_at'])
            self.assertIsNone(handoff['presage']['measurements'])

    def test_no_system_prompt_or_empty_turn_in_export(self):
        with tempfile.TemporaryDirectory() as temporary:
            writer = SessionTranscript(Path(temporary), 'test-room', 'agent', 'connector')
            writer.append(ChatMessage(role='system', content=['Private system prompt']))
            writer.append(ChatMessage(role='user', content=[]))
            writer.close('failed')
            self.assertEqual((writer.path / 'transcript.jsonl').read_text(), '')


if __name__ == '__main__':
    unittest.main()
