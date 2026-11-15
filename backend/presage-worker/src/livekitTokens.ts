import { AccessToken } from 'livekit-server-sdk';
import { appConfig, assertLiveKitConfigured } from './config.js';

export async function mintParticipantToken(options: {
  identity: string;
  roomName: string;
  canPublish: boolean;
  canSubscribe: boolean;
  ttl?: string;
}): Promise<string> {
  assertLiveKitConfigured();
  const at = new AccessToken(appConfig.livekitApiKey, appConfig.livekitApiSecret, {
    identity: options.identity,
    ttl: options.ttl ?? '30m',
  });
  at.addGrant({
    roomJoin: true,
    room: options.roomName,
    canPublish: options.canPublish,
    canSubscribe: options.canSubscribe,
    canPublishData: true,
  });
  return at.toJwt();
}
