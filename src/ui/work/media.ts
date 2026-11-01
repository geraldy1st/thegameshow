/**
 * Video or still picture (ARCHITECTURE-LOT4 §6, GS-V5-52):
 * useStill = reduced motion (system, or the game setting 'on') || Save-Data ||
 * effectiveType ∈ {slow-2g, 2g, 3g} || (no navigator.connection && game setting 'on').
 * The game setting 'off' overrides the system preference (lot 1 rule).
 */
export interface MediaEnv {
  systemReduced: boolean;
  setting: 'auto' | 'on' | 'off';
  /** undefined when navigator.connection is missing (Safari). */
  connection?: { saveData?: boolean; effectiveType?: string };
}

const SLOW = ['slow-2g', '2g', '3g'];

export function shouldUseStill(e: MediaEnv): boolean {
  const reduced = e.setting === 'on' || (e.setting === 'auto' && e.systemReduced);
  if (reduced) return true;
  if (!e.connection) return false; // the game setting is not 'on' here
  return e.connection.saveData === true || SLOW.includes(e.connection.effectiveType ?? '');
}

/** Test-harness override of the media environment (null in production: never set). */
export interface MediaOverride {
  systemReduced?: boolean;
  connection?: { saveData?: boolean; effectiveType?: string } | null;
}
let override: MediaOverride | null = null;
const listeners = new Set<() => void>();
export function setMediaOverride(o: MediaOverride | null): void {
  override = o;
  listeners.forEach((l) => l());
}
export function onMediaOverride(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

type NavConnection = { saveData?: boolean; effectiveType?: string };
export function readMediaEnv(setting: MediaEnv['setting']): MediaEnv {
  const sys =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { connection?: NavConnection }).connection
      : undefined;
  const conn = override && 'connection' in override ? (override.connection ?? undefined) : nav;
  return {
    systemReduced: override?.systemReduced ?? sys,
    setting,
    connection: conn ? { saveData: conn.saveData, effectiveType: conn.effectiveType } : undefined,
  };
}
