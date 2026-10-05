// Bounded development storage. Cloud adapters supply the same asynchronous interface.
export function memoryResourcesState(now = Date.now) {
  const sessions = new Map(), attempts = new Map();
  const prune = map => { for (const [key, item] of map) if (item.expires <= now()) map.delete(key); };
  return {
    async attempt(key) {
      prune(attempts);
      const item = attempts.get(key) || {count: 0, expires: now() + 900_000};
      if ((!attempts.has(key) && attempts.size >= 2048) || item.count >= 10) return false;
      item.count++; attempts.set(key, item); return true;
    },
    async clearAttempts(key) { attempts.delete(key); },
    async rotate(oldKey, key, expires) {
      prune(sessions);
      if (sessions.size >= 2048) throw new Error('Session capacity');
      sessions.delete(oldKey); sessions.set(key, {expires});
    },
    async revoke(key) { sessions.delete(key); },
    async get(key) { prune(sessions); return sessions.get(key); },
  };
}
