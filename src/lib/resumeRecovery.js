// A brief tab or window switch keeps the realtime socket open, so a full
// session refresh, reload and resubscribe on every focus only repeats requests.
// Recover after a real absence, a network return or a broken realtime channel.
export const RESUME_RECOVERY_AWAY_MS = 60_000

export function shouldRecoverOnResume({ eventType, awayMs, realtimeHealthy }) {
  if (eventType === 'online') return true
  if (!realtimeHealthy) return true
  return awayMs >= RESUME_RECOVERY_AWAY_MS
}
