// Coordinación de logout entre pestañas via BroadcastChannel.
//
// Por qué: el access token vive en memoria de cada pestaña; un logout en una
// no limpia las demás automáticamente. Cuando una pestaña cierra sesión,
// envía un mensaje por el canal `heyday-auth`; el resto de pestañas lo recibe
// y limpia + redirige a /login.
//
// BroadcastChannel está soportado en todos los navegadores modernos; en SSR
// (Node) `globalThis.BroadcastChannel` puede no existir → guards.

const CHANNEL_NAME = 'heyday-auth';

export type AuthBroadcastMessage = { type: 'logout' } | { type: 'session-expired' };

let cachedChannel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof globalThis.BroadcastChannel === 'undefined') return null;
  if (cachedChannel) return cachedChannel;
  cachedChannel = new BroadcastChannel(CHANNEL_NAME);
  return cachedChannel;
}

export function broadcastLogout(): void {
  getChannel()?.postMessage({ type: 'logout' } satisfies AuthBroadcastMessage);
}

export function broadcastSessionExpired(): void {
  getChannel()?.postMessage({ type: 'session-expired' } satisfies AuthBroadcastMessage);
}

/** Resetea el canal cacheado. Sólo para tests — el módulo cachea por proceso. */
export function __resetChannelForTests(): void {
  cachedChannel?.close();
  cachedChannel = null;
}

export function onAuthBroadcast(handler: (msg: AuthBroadcastMessage) => void): () => void {
  const channel = getChannel();
  if (!channel) return () => {};
  const listener = (event: MessageEvent<AuthBroadcastMessage>): void => {
    handler(event.data);
  };
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}
