"""Single-call agent: joins the same room as the Chert connector directly."""
import asyncio
import logging
import os
import signal

import aiohttp
from livekit import rtc
from livekit.agents import Agent, AgentSession, llm, room_io
from livekit.plugins import elevenlabs, google, silero

from config import ROOT, required, room_token, settings
from session_store import context_instructions
from transcripts import SessionTranscript

log = logging.getLogger('vitalink.agent')
BASE_INSTRUCTIONS = '''You are VitaLink, a friendly AI check-in companion for a hackathon demo.
Use warm, brief spoken responses and ask one question at a time. Ask how the person
is feeling and listen carefully. Be transparent that you are AI. You are not a clinician.
Do not diagnose, prescribe, change medication doses, or invent vital signs.
If patient context includes latest_presage_vitals from the VitaLink camera scan, you may
acknowledge those app estimates warmly as wellness numbers only — never claim you measured
them live on FaceTime, and never treat them as a medical diagnosis.
You have no emergency dispatch or caregiver messaging
tools. Never claim you contacted anyone. If someone describes an urgent emergency,
encourage them to contact local emergency services or a nearby trusted person now.
Do not pretend a conversation transcript is a physiological measurement.'''


def INSTRUCTIONS() -> str:
    return BASE_INSTRUCTIONS + context_instructions()


def build_session(http: aiohttp.ClientSession) -> AgentSession:
    # scribe_v1/v2 REST confirmed on this key; pair non-realtime STT with Silero VAD.
    # scribe_v2_realtime needs a live websocket path and is not required for MVP.
    stt_model = os.getenv('ELEVEN_STT_MODEL', 'scribe_v2').strip() or 'scribe_v2'
    return AgentSession(
        stt=elevenlabs.STT(api_key=required('ELEVEN_API_KEY'),
                           model=stt_model, http_session=http),
        llm=google.LLM(api_key=required('GOOGLE_API_KEY'),
                       model=os.getenv('GEMINI_MODEL', 'gemini-3.5-flash-lite')),
        tts=elevenlabs.TTS(api_key=required('ELEVEN_API_KEY'),
                           voice_id=required('ELEVEN_VOICE_ID'),
                           model=os.getenv('ELEVEN_TTS_MODEL', 'eleven_turbo_v2_5'),
                           http_session=http),
        vad=silero.VAD.load(),
    )


async def main() -> None:
    cfg = settings()
    for key in ('LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'GOOGLE_API_KEY',
                'ELEVEN_API_KEY', 'ELEVEN_VOICE_ID'):
        required(key)
    token = room_token(cfg['agent'], cfg['room'])
    room = rtc.Room()
    stop = asyncio.Event()
    media_ready = asyncio.Event()
    status = 'stopped'
    transcript = SessionTranscript(ROOT / 'sessions', cfg['room'], cfg['agent'], cfg['connector'])
    log.info('Session %s; local handoff: %s', transcript.session_id, transcript.path)

    @room.on('track_subscribed')
    def subscribed(track, publication, participant):
        if participant.identity == cfg['connector'] and track.kind == rtc.TrackKind.KIND_AUDIO:
            media_ready.set()

    @room.on('disconnected')
    def disconnected(*_):
        stop.set()

    @room.on('participant_disconnected')
    def participant_left(participant):
        if participant.identity == cfg['connector']:
            stop.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        asyncio.get_running_loop().add_signal_handler(sig, stop.set)

    session = None
    async with aiohttp.ClientSession() as http:
        try:
            session = build_session(http)

            @session.on('conversation_item_added')
            def conversation(event):
                nonlocal status
                if isinstance(event.item, llm.ChatMessage):
                    try:
                        transcript.append(event.item)
                    except OSError:
                        status = 'transcript_error'
                        log.error('Cannot persist transcript; stopping call agent')
                        stop.set()

            @session.on('error')
            def error(event):
                nonlocal status
                log.error('Agent provider error (details omitted from application logs)')
                if not event.error.recoverable:
                    status = 'provider_error'
                    stop.set()

            @session.on('close')
            def closed(*_):
                stop.set()

            await asyncio.wait_for(room.connect(cfg['url'], token), timeout=30)
            transcript.mark('waiting_for_connector')
            log.info('Room joined as %s; waiting for Chert audio', cfg['agent'])
            ready_task = asyncio.create_task(media_ready.wait())
            stop_task = asyncio.create_task(stop.wait())
            try:
                done, _ = await asyncio.wait((ready_task, stop_task),
                                            timeout=600, return_when=asyncio.FIRST_COMPLETED)
                if not done:
                    status = 'connector_timeout'
                    return
                if stop.is_set():
                    return
            finally:
                ready_task.cancel()
                stop_task.cancel()
                await asyncio.gather(ready_task, stop_task, return_exceptions=True)
            await session.start(
                agent=Agent(instructions=INSTRUCTIONS()), room=room, record=False,
                session_host=False,
                room_options=room_io.RoomOptions(participant_identity=cfg['connector'],
                                                text_input=False, video_input=False),
            )
            transcript.mark('active')
            session.say('Hi, I am VitaLink, an AI check-in companion. This demo saves a '
                        'conversation transcript. How are you feeling today?')
            await stop.wait()
        except Exception:
            status = 'failed'
            raise
        finally:
            try:
                if session is not None:
                    await session.aclose()
            finally:
                try:
                    await room.disconnect()
                finally:
                    transcript.close(status)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(main())
    except ValueError as exc:
        raise SystemExit(str(exc)) from None
