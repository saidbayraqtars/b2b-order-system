import type { Principal } from "./security";

// A very short-lived cache in front of the per-request account lookup.
//
// Read this before changing anything here: **this caches an authorization
// input.** Every millisecond an entry lives is a millisecond in which a
// deactivated account could still be served. That is why the design is
// conservative in three specific ways, and why the TTL is seconds rather than
// minutes.
//
//  1. **The cache never says "allowed".** It only stores the account row. The
//     decision — is this session's tokenVersion current, is the account active,
//     what role does it have — is still made on every request by
//     `checkPrincipal`, against whatever the cache handed back.
//
//  2. **Anything that changes authority evicts.** Password change, role change,
//     deactivation and deletion all go through `revokeSessions` or the user
//     admin service, and both drop the entry before returning. So a revocation
//     is visible on the *next* request, not TTL seconds later.
//
//  3. **A miss is the safe direction.** An empty cache costs a query; a stale
//     one costs correctness. Anything unexpected — a write we did not
//     anticipate, a process restart — leaves it empty rather than stale.
//
// The remaining exposure is deliberate and bounded: if the app runs as several
// processes, an eviction in one does not reach the others, so a revocation can
// take up to the TTL to be seen by an instance that did not perform it. At a
// few seconds that is an acceptable trade for one query per request; if this
// ever runs behind a load balancer with sessions that matter more than that,
// the eviction needs to become a shared signal (Redis pub/sub) rather than the
// TTL being raised.

const TTL_MS = 5_000;
/** Bounded so a spike of unique users cannot grow it without limit. */
const MAX_ENTRIES = 5_000;

interface Entry {
  principal: Principal | null;
  expiresAt: number;
}

const cache = new Map<string, Entry>();

export interface PrincipalCacheStats {
  size: number;
  ttlMs: number;
  hits: number;
  misses: number;
}

let hits = 0;
let misses = 0;

/** Cached row, or null when there is nothing fresh — never a stale one. */
export function getCachedPrincipal(userId: string): Entry["principal"] | undefined {
  const entry = cache.get(userId);
  if (!entry) {
    misses += 1;
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    cache.delete(userId);
    misses += 1;
    return undefined;
  }
  hits += 1;
  return entry.principal;
}

export function setCachedPrincipal(
  userId: string,
  principal: Principal | null,
): void {
  if (cache.size >= MAX_ENTRIES) {
    // Oldest insertion first — Map preserves insertion order. Crude, but the
    // entries live seconds, so a smarter policy would buy nothing.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(userId, { principal, expiresAt: Date.now() + TTL_MS });
}

/**
 * Drop an account's entry. Called by every write that changes what the account
 * may do — this is what makes a revocation take effect immediately rather than
 * at the end of the TTL.
 */
export function evictPrincipal(userId: string): void {
  cache.delete(userId);
}

/** Drop everything. For tests, and for an administrator who wants certainty. */
export function clearPrincipalCache(): void {
  cache.clear();
  hits = 0;
  misses = 0;
}

export function principalCacheStats(): PrincipalCacheStats {
  return { size: cache.size, ttlMs: TTL_MS, hits, misses };
}
