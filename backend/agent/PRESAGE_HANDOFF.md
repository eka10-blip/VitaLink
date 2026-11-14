# Session contract for Presage teammate (proposed, not a live integration)

The Python agent writes `sessions/<session_id>/handoff.json` and `transcript.jsonl`.
These files are ignored by Git and owner-readable/writable. No session data exists
until the agent starts. No fake conversation or provider responses are included.

`handoff.json` schema version 1 includes:
- `session_id`: generated UUID for this agent run.
- `room_name`, `agent_identity`, `connector_identity`: LiveKit correlation fields.
- `started_at`, `ended_at`: ISO-8601 UTC timestamps; ended_at is null while running.
- `status`: starting, waiting_for_connector, active, stopped, connector_timeout,
  provider_error, transcript_error, or failed. None means a clinically completed assessment.
- `transcript_file`: relative path to newline-delimited JSON.
- `turn_count`: count of persisted conversation messages.
- `presage`: `{ "status": "not_connected", "measurements": null }` until real integration.

Each transcript line contains `schema_version`, `session_id`, `sequence`, `item_id`,
`role` (user/assistant), `text`, `interrupted`, `message_at`, `captured_at`, and `source`.
Only committed LiveKit ChatMessages are stored; interim transcription is excluded.
An interrupted assistant message is not proof the whole utterance was heard.
Message timestamps are not sample-aligned audio or video measurement timestamps.
Records are flushed/fsynced per message; the manifest is replaced atomically.
After a crash, JSONL is authoritative: its last row may be ahead of manifest turn_count.

Agree on session-ID propagation with the mobile/backend teammate before implementation.
Presage must acquire its own supported sensor/video input and attach actual measurements
to the agreed session, preserving measurement timestamps and source. The current Chert
browser audio bridge does not establish a caller-camera feed for Presage. Managed Chert
caller-camera capability must also be confirmed separately.

No webhook endpoint, Presage SDK call, vital sign, risk score, diagnosis, notification,
or caregiver alert is implemented or inferred from conversation text.
Next: agree on the receiving API/storage contract and video capture ownership.
