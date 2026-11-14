"""Managed Chert named worker. Default probe mode requires only LiveKit keys.

Documented contract: chert guide agent, beta.21; LiveKit Agents 1.8.12.
"""
import asyncio
import json
import logging
import os

import aiohttp
from livekit import agents, rtc
from livekit.agents import Agent, AgentServer, llm, room_io

from agent import INSTRUCTIONS, build_session
from config import ROOT, required
from connection_probe import receive, send_tones
from session_store import get_patient_context
from transcripts import SessionTranscript

log = logging.getLogger('vitalink.chert')
server = AgentServer()


def bridge_ready(metadata: str) -> bool:
    try:
        data = json.loads(metadata or '{}')
        return isinstance(data, dict) and data.get('chert_bridge_ready') is True
    except (ValueError, TypeError):
        return False


@server.rtc_session(agent_name=os.getenv('AGENT_NAME', 'vitalink-caregiver'))
async def entrypoint(ctx: agents.JobContext):
    mode = os.getenv('VITALINK_MODE', 'probe')
    if mode not in ('probe', 'conversation'):
        raise ValueError('VITALINK_MODE must be probe or conversation')
    stop, ready, caller_available = asyncio.Event(), asyncio.Event(), asyncio.Event()
    caller_identity = None
    tasks = []
    transcript = None
    session = None
    source = None
    status = 'stopped'
    observed_tracks = {}

    def observe(participant, publication):
        if not participant.identity.startswith('chert-bridge-'):
            return
        observed_tracks[publication.sid] = {
            'sid': publication.sid, 'participant_identity': participant.identity,
            'kind': 'video' if publication.kind == rtc.TrackKind.KIND_VIDEO else 'audio',
            'muted': publication.muted,
        }
        log.info('Chert caller published %s track (muted=%s)',
                 observed_tracks[publication.sid]['kind'], publication.muted)

    @ctx.room.on('track_published')
    def published(publication, participant):
        observe(participant, publication)

    @ctx.room.on('participant_connected')
    def participant_connected(participant):
        nonlocal caller_identity
        if participant.identity.startswith('chert-bridge-'):
            caller_identity = participant.identity
            caller_available.set()

    @ctx.room.on('participant_disconnected')
    def participant_left(participant):
        if participant.identity == caller_identity:
            stop.set()

    @ctx.room.on('room_metadata_changed')
    def metadata_changed(*_):
        if bridge_ready(ctx.room.metadata):
            ready.set()

    @ctx.room.on('disconnected')
    def disconnected(*_):
        stop.set()

    async def shutdown():
        stop.set()

    ctx.add_shutdown_callback(shutdown)
    await ctx.connect()
    for participant in ctx.room.remote_participants.values():
        participant_connected(participant)
        for publication in participant.track_publications.values():
            observe(participant, publication)
    metadata_changed()

    async def wait_or_stop(event):
        waiting = asyncio.create_task(event.wait())
        stopping = asyncio.create_task(stop.wait())
        try:
            await asyncio.wait((waiting, stopping), return_when=asyncio.FIRST_COMPLETED)
            return not stop.is_set()
        finally:
            waiting.cancel()
            stopping.cancel()
            await asyncio.gather(waiting, stopping, return_exceptions=True)

    if not await wait_or_stop(caller_available):
        return
    transcript = SessionTranscript(ROOT / 'sessions', ctx.room.name,
                                   ctx.room.local_participant.identity, caller_identity)
    transcript.manifest['mode'] = mode
    transcript.manifest['agent_name'] = os.getenv('AGENT_NAME', 'vitalink-caregiver')
    transcript.manifest['patient_id'] = get_patient_context().get(
        'patient_id', os.getenv('PATIENT_ID', 'synthetic-demo-patient'))
    transcript.mark('waiting_for_bridge')
    log.info('Session %s; waiting for Chert bridge readiness', transcript.session_id)

    async with aiohttp.ClientSession() as http:
        try:
            # Probe audio can publish early; paid Gemini/ElevenLabs open only after
            # chert_bridge_ready (chert guide agent).
            if mode == 'probe':
                source = rtc.AudioSource(48000, 1)
                track = rtc.LocalAudioTrack.create_audio_track('vitalink-probe', source)
                await ctx.room.local_participant.publish_track(
                    track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))

                listening = set()
                @ctx.room.on('track_subscribed')
                def subscribed(track, publication, participant):
                    if (participant.identity == caller_identity
                            and track.kind == rtc.TrackKind.KIND_AUDIO
                            and publication.sid not in listening):
                        listening.add(publication.sid)
                        tasks.append(asyncio.create_task(receive(track)))

                participant = ctx.room.remote_participants.get(caller_identity)
                if participant:
                    for publication in participant.track_publications.values():
                        if publication.track:
                            subscribed(publication.track, publication, participant)

            if not await wait_or_stop(ready):
                return
            transcript.mark('active')
            if mode == 'conversation':
                session = build_session(http)

                @session.on('conversation_item_added')
                def on_item(event):
                    nonlocal status
                    if isinstance(event.item, llm.ChatMessage):
                        try:
                            transcript.append(event.item)
                        except OSError:
                            status = 'transcript_error'
                            stop.set()

                @session.on('close')
                def closed(*_):
                    stop.set()

                @session.on('error')
                def error(event):
                    nonlocal status
                    if not event.error.recoverable:
                        status = 'provider_error'
                        stop.set()

                await session.start(agent=Agent(instructions=INSTRUCTIONS()), room=ctx.room,
                                    record=False, session_host=False,
                                    room_options=room_io.RoomOptions(
                                        participant_identity=caller_identity,
                                        text_input=False, video_input=False, text_output=False))
                session.say('Hi, I am VitaLink, your AI check-in companion. This demo saves '
                            'a conversation transcript. How are you feeling today?')
            else:
                log.info('FaceTime bridge ready: sending quiet test beeps')
                tasks.append(asyncio.create_task(send_tones(source)))
            await stop.wait()
        except Exception:
            status = 'failed'
            raise
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            try:
                if session:
                    await session.aclose()
                if source:
                    await source.aclose()
            finally:
                transcript.manifest['observed_caller_tracks'] = list(observed_tracks.values())
                transcript.manifest['caller_video_track_observed'] = any(
                    track['kind'] == 'video' for track in observed_tracks.values())
                transcript.close(status)


if __name__ == '__main__':
    for name in ('LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'):
        required(name)
    agents.cli.run_app(server)
