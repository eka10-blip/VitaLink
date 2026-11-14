"""Minimal HTTP API for frontend / Presage teammates. No secrets in responses."""
from __future__ import annotations

import json
import logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from session_store import (
    get_patient_context,
    list_sessions,
    put_caregiver_report,
    put_patient_context,
    put_vitals,
    read_handoff,
    read_transcript,
)

log = logging.getLogger('vitalink.api')
HOST = '127.0.0.1'
PORT = 8787


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        log.info('%s - %s', self.address_string(), fmt % args)

    def _json(self, code: int, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        data = json.loads(raw.decode('utf-8'))
        if not isinstance(data, dict):
            raise ValueError('JSON object required')
        return data

    def do_OPTIONS(self):
        self._json(204, {})

    def do_GET(self):
        path = urlparse(self.path).path.rstrip('/') or '/'
        try:
            if path == '/health':
                return self._json(200, {'ok': True, 'service': 'vitalink-agent-api'})
            if path == '/v1/sessions':
                return self._json(200, {'sessions': list_sessions()})
            if path == '/v1/patient-context':
                return self._json(200, get_patient_context())
            if path.startswith('/v1/sessions/'):
                parts = path.split('/')
                # /v1/sessions/{id}[/transcript|vitals|caregiver-report]
                if len(parts) == 4:
                    return self._json(200, read_handoff(parts[3]))
                if len(parts) == 5 and parts[4] == 'transcript':
                    return self._json(200, {
                        'session_id': parts[3],
                        'turns': read_transcript(parts[3]),
                    })
                if len(parts) == 5 and parts[4] == 'vitals':
                    return self._json(200, read_handoff(parts[3]).get('presage'))
                if len(parts) == 5 and parts[4] == 'caregiver-report':
                    handoff = read_handoff(parts[3])
                    return self._json(200, handoff.get('caregiver_report') or {
                        'summary': None, 'highlights': [], 'family_instructions': None,
                    })
            return self._json(404, {'error': 'not_found', 'path': path})
        except FileNotFoundError:
            return self._json(404, {'error': 'session_not_found'})
        except Exception as exc:
            return self._json(500, {'error': 'server_error', 'detail': type(exc).__name__})

    def do_PUT(self):
        path = urlparse(self.path).path.rstrip('/') or '/'
        try:
            payload = self._read_json()
            if path == '/v1/patient-context':
                return self._json(200, put_patient_context(payload))
            if path.startswith('/v1/sessions/'):
                parts = path.split('/')
                if len(parts) == 5 and parts[4] == 'vitals':
                    return self._json(200, put_vitals(parts[3], payload))
                if len(parts) == 5 and parts[4] == 'caregiver-report':
                    return self._json(200, put_caregiver_report(parts[3], payload))
            return self._json(404, {'error': 'not_found', 'path': path})
        except FileNotFoundError:
            return self._json(404, {'error': 'session_not_found'})
        except ValueError as exc:
            return self._json(400, {'error': 'bad_request', 'detail': str(exc)})
        except Exception as exc:
            return self._json(500, {'error': 'server_error', 'detail': type(exc).__name__})


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    log.info('VitaLink teammate API on http://%s:%s', HOST, PORT)
    server.serve_forever()


if __name__ == '__main__':
    main()
