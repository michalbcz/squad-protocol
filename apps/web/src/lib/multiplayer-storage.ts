import { hostUrl, parseClientMessage, type Credential } from '@sp/net';

export interface SavedCredential extends Credential { host: string; version: 1 }
const KEY = 'sp.multiplayer';
export function savedCredential(): SavedCredential | null {
  try {
    const input = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as SavedCredential | null;
    if (!input) return null;
    parseClientMessage({ version: input.version, kind: 'resume', room: input.room, token: input.token });
    return { version: 1, host: hostUrl(input.host), room: input.room, token: input.token };
  } catch { return null; }
}
export function saveCredential(value: SavedCredential): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Play still works without refresh recovery. */ }
}
export function clearCredential(): void { try { sessionStorage.removeItem(KEY); } catch { /* Storage may be unavailable. */ } }
