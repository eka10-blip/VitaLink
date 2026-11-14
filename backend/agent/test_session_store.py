"""Offline teammate API store tests; no provider calls."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import session_store
from transcripts import SessionTranscript


class SessionStoreTests(unittest.TestCase):
    def test_vitals_report_and_context(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            sessions = root / 'sessions'
            context = root / 'patient_context.json'
            with patch.object(session_store, 'SESSIONS', sessions), \
                 patch.object(session_store, 'CONTEXT_PATH', context), \
                 patch.object(session_store, 'ROOT', root):
                writer = SessionTranscript(sessions, 'room', 'agent', 'connector')
                session_id = writer.session_id
                writer.close('stopped')

                updated = session_store.put_vitals(session_id, {
                    'status': 'received',
                    'measurements': {'hr_bpm': 72, 'note': 'synthetic'},
                    'source': 'presage-teammate',
                })
                self.assertEqual(updated['presage']['measurements']['hr_bpm'], 72)

                report = session_store.put_caregiver_report(session_id, {
                    'summary': 'Synthetic check-in complete',
                    'highlights': ['patient reported tiredness'],
                    'family_instructions': 'Call back this evening',
                })
                self.assertEqual(report['caregiver_report']['summary'],
                                 'Synthetic check-in complete')

                ctx = session_store.put_patient_context({
                    'patient_id': 'synthetic-demo-patient',
                    'history': [{'condition': 'demo hypertension'}],
                    'previous_checkins': [{'mood': 'ok'}],
                    'family_care_instructions': 'Encourage hydration',
                })
                self.assertEqual(ctx['patient_id'], 'synthetic-demo-patient')
                self.assertIn('Encourage hydration', session_store.context_instructions())
                self.assertEqual(len(session_store.list_sessions()), 1)
                self.assertEqual(len(session_store.read_transcript(session_id)), 0)
                handoff = session_store.read_handoff(session_id)
                self.assertEqual(handoff['patient_id'], 'synthetic-demo-patient')


if __name__ == '__main__':
    unittest.main()
