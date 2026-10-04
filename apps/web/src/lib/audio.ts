/** Media time can be NaN/Infinity while metadata is loading or after a failure. */
export function formatAudioTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  return (hours ? `${hours}:${String(minutes).padStart(2, '0')}` : String(minutes))
    + ':' + String(total % 60).padStart(2, '0');
}

export function clampAudioTime(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(duration, Math.max(0, seconds));
}

/** Keep previously published recordings readable until an editor chooses a type. */
export function recordingLabel(type?: string, customLabel?: string): string {
  if (type === 'breathing') return 'GUIDED BREATHING';
  if (type === 'other') return customLabel?.trim().toUpperCase() || 'GUIDED PRACTICE';
  return 'GUIDED MEDITATION';
}
