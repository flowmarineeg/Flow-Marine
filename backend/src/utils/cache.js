'use strict';

/**
 * Lightweight in-memory TTL cache
 * Sprint020 — PERF-001, PERF-002
 *
 * Replaces 2-3 DB queries per request for user + permission lookups.
 * No external dependency — pure Node.js Map.
 * Production upgrade path: swap the Map for a Redis client behind the same API.
 *
 * API:
 *   cache.get(key)              → value | undefined
 *   cache.set(key, value, ttl)  → void   (ttl in ms, default 60s)
 *   cache.del(key)              → void
 *   cache.delByPrefix(prefix)   → void   (deletes all keys starting with prefix)
 *   cache.flush()               → void   (clear everything — useful in tests)
 *   cache.size()                → number
 */

class TtlCache {
  constructor() {
    this._store = new Map(); // key → { value, expiresAt }
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs = 60_000) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  del(key) {
    this._store.delete(key);
  }

  /**
   * Delete all keys whose name starts with `prefix`.
   * Used to invalidate all permission entries for a role:
   *   cache.delByPrefix(`perm:${roleId}:`)
   */
  delByPrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }

  flush() {
    this._store.clear();
  }

  size() {
    return this._store.size;
  }
}

// Export a single shared instance — all middleware share one cache
module.exports = new TtlCache();
