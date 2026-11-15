import { registerRootComponent } from 'expo';
import App from './App';

// LiveKit native module exists only in iOS/Android dev clients built with the Expo plugin.
// Keep Person 4 demo usable in Expo Go / web when the native module is absent.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const livekit = require('@livekit/react-native');
  if (livekit?.registerGlobals) {
    livekit.registerGlobals();
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn('[vitalink] LiveKit unavailable in this build; Person 2 sensing disabled.', message);
}

registerRootComponent(App);
