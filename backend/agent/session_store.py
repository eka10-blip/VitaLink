"""Filesystem session/vitals/report helpers for teammate HTTP integration."""
from __future__ import annotations

import json
import os
from pathlib import Path

from config import ROOT
from transcripts import utc_now

SESSIONS = ROOT / 'sessions'
CONTEXT_PATH = ROOT / 'patient_context.json'


def ensure_dirs() -> None:
    SESSIONS.mkdir(parents=True, exist_ok=True)


def list_sessions() -> list[dict]:
    ensure_dirs()
    rows = []
    for path in sorted(SESSIONS.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        handoff = path / 'handoff.json'
        if path.is_dir() and handoff.exists():
            rows.append(json.loads(handoff.read_text(encoding='utf-8')))
    return rows


def session_dir(session_id: str) -> Path:
    path = SESSIONS / session_id
    if not path.is_dir() or not (path / 'handoff.json').exists():
        raise FileNotFoundError(session_id)
    return path


def read_handoff(session_id: str) -> dict:
    return json.loads((session_dir(session_id) / 'handoff.json').read_text(encoding='utf-8'))


def write_handoff(session_id: str, manifest: dict) -> dict:
    path = session_dir(session_id)
    temporary = path / 'handoff.json.tmp'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        json.dump(manifest, output, indent=2, ensure_ascii=False)
        output.flush()
        os.fsync(output.fileno())
    temporary.replace(path / 'handoff.json')
    return manifest


def read_transcript(session_id: str) -> list[dict]:
    path = session_dir(session_id) / 'transcript.jsonl'
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding='utf-8').splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def put_vitals(session_id: str, payload: dict) -> dict:
    manifest = read_handoff(session_id)
    measurements = payload.get('measurements', payload)
    manifest['presage'] = {
        'status': payload.get('status', 'received'),
        'measurements': measurements,
        'updated_at': utc_now(),
        'source': payload.get('source', 'teammate'),
    }
    return write_handoff(session_id, manifest)


def put_caregiver_report(session_id: str, payload: dict) -> dict:
    manifest = read_handoff(session_id)
    manifest['caregiver_report'] = {
        'updated_at': utc_now(),
        'summary': payload.get('summary'),
        'highlights': payload.get('highlights', []),
        'family_instructions': payload.get('family_instructions'),
        'raw': payload,
    }
    return write_handoff(session_id, manifest)


def get_patient_context() -> dict:
    if not CONTEXT_PATH.exists():
        return {
            'patient_id': os.getenv('PATIENT_ID', 'synthetic-demo-patient'),
            'history': [],
            'previous_checkins': [],
            'family_care_instructions': '',
            'updated_at': None,
        }
    return json.loads(CONTEXT_PATH.read_text(encoding='utf-8'))


def put_patient_context(payload: dict) -> dict:
    current = get_patient_context()
    current.update({k: v for k, v in payload.items() if v is not None})
    current['updated_at'] = utc_now()
    fd = os.open(CONTEXT_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        json.dump(current, output, indent=2, ensure_ascii=False)
        output.flush()
        os.fsync(output.fileno())
    return current


def context_instructions() -> str:
    ctx = get_patient_context()
    history = ctx.get('history') or []
    checkins = ctx.get('previous_checkins') or []
    family = ctx.get('family_care_instructions') or ''
    latest = ctx.get('latest_presage_vitals') or {}
    vitals_line = ''
    if isinstance(latest, dict) and (latest.get('hr_bpm') is not None or latest.get('rr_bpm') is not None):
        vitals_line = (
            f"Latest wellness camera estimates from the VitaLink app (not a medical device): "
            f"heart rate ≈ {latest.get('hr_bpm')} bpm, breathing ≈ {latest.get('rr_bpm')} /min "
            f"(measured_at={latest.get('measured_at')}). You may acknowledge these gently as "
            f"app estimates only — never diagnose or treat.\n"
        )
    return (
        f"\nSynthetic patient_id: {ctx.get('patient_id')}.\n"
        f"Known history (demo): {json.dumps(history, ensure_ascii=False)[:800]}\n"
        f"Previous check-ins (demo): {json.dumps(checkins, ensure_ascii=False)[:800]}\n"
        f"Family care instructions (demo): {str(family)[:500]}\n"
        f"{vitals_line}"
        'Use this only for warm, non-diagnostic check-in conversation.'
    )
