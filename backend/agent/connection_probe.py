"""Model-free connection test: outgoing quiet beeps, incoming audio energy.

No raw audio is saved. Hearing beeps on the iPhone verifies downstream media;
incoming nonzero RMS while speaking verifies upstream media, not transcription.
"""
import asyncio
import logging
import math
import signal
from array import array

from livekit import rtc
from config import room_token, settings

log = logging.getLogger('vitalink.probe')
RATE = 48000


async def send_tones(source: rtc.AudioSource) -> None:
    offset = 0
    while True:
        # 250 ms beep every 3 seconds, with short ramps to avoid clicks.
        values = []
        for i in range(480):
            t = ((offset + i) % (RATE * 3)) / RATE
            envelope = max(0.0, min(1.0, t / .01, (.25 - t) / .01))
            values.append(int(2500 * envelope * math.sin(2 * math.pi * 440 * t)))
        frame = rtc.AudioFrame(array('h', values).tobytes(), RATE, 1, 480)
        await source.capture_frame(frame)
        offset += 480


async def receive(track: rtc.RemoteAudioTrack) -> None:
    stream = rtc.AudioStream(track, sample_rate=RATE, num_channels=1)
    frames = 0
    peak_rms = 0.0
    try:
        async for event in stream:
            data = event.frame.data
            rms = math.sqrt(sum(int(x) ** 2 for x in data) / max(1, len(data)))
            peak_rms = max(peak_rms, rms)
            frames += 1
            if frames % 100 == 0:
                log.info('Caller audio: frames=%d peak_rms=%.1f', frames, peak_rms)
                peak_rms = 0.0
    finally:
        await stream.aclose()


async def main() -> None:
    cfg = settings()
    token = room_token(cfg['agent'], cfg['room'])
    room = rtc.Room()
    source = rtc.AudioSource(RATE, 1)
    tasks: set[asyncio.Task] = set()
    stop = asyncio.Event()

    def spawn(coro) -> None:
        task = asyncio.create_task(coro)
        tasks.add(task)
        def done(completed):
            tasks.discard(completed)
            if not completed.cancelled() and completed.exception():
                log.error('Media task failed: %s', type(completed.exception()).__name__)
                stop.set()
        task.add_done_callback(done)

    @room.on('track_subscribed')
    def subscribed(track, publication, participant):
        if participant.identity == cfg['connector'] and track.kind == rtc.TrackKind.KIND_AUDIO:
            log.info('Connector audio subscribed')
            spawn(receive(track))

    @room.on('disconnected')
    def disconnected(*_):
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    try:
        await asyncio.wait_for(room.connect(cfg['url'], token), timeout=30)
        track = rtc.LocalAudioTrack.create_audio_track('vitalink-probe', source)
        options = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
        await room.local_participant.publish_track(track, options)
        log.info('Connected: room=%s agent=%s. Listen for a beep every 3 seconds.',
                 cfg['room'], room.local_participant.identity)
        spawn(send_tones(source))
        await stop.wait()
    finally:
        pending = list(tasks)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        await room.disconnect()
        await source.aclose()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(main())
    except ValueError as exc:
        raise SystemExit(str(exc)) from None
