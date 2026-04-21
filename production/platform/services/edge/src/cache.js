class SegmentedEntry {
  constructor(value, ttlMs, isGhost = false) {
    this.value = value;
    this.createdAt = Date.now();
    this.expiresAt = this.createdAt + ttlMs;
    this.hits = 0;
    this.lastAccessAt = this.createdAt;
    this.isGhost = isGhost;
  }

  touch() {
    this.hits += 1;
    this.lastAccessAt = Date.now();
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }
}

class SegmentedCache {
  constructor(options = {}) {
    this.maxEntries = Number(options.maxEntries || 200);
    this.ttlMs = Number(options.ttlMs || 10 * 60 * 1000);
    this.segments = {
      fresh: new Map(),
      popular: new Map(),
      missAware: new Map()
    };
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      stores: 0
    };
  }

  setPolicy({ maxEntries, ttlMs }) {
    if (maxEntries !== undefined) this.maxEntries = Number(maxEntries);
    if (ttlMs !== undefined) this.ttlMs = Number(ttlMs);
    this.clear();
  }

  getCaps() {
    const total = Math.max(3, this.maxEntries);
    const freshCap = Math.max(1, Math.floor(total * 0.35));
    const popularCap = Math.max(1, Math.floor(total * 0.60));
    const missAwareCap = Math.max(1, total - freshCap - popularCap);
    return { freshCap, popularCap, missAwareCap };
  }

  pruneExpired() {
    for (const segment of Object.values(this.segments)) {
      for (const [key, entry] of segment.entries()) {
        if (entry.isExpired()) {
          segment.delete(key);
        }
      }
    }
  }

  evictOldest(segment) {
    const oldest = segment.keys().next().value;
    if (oldest !== undefined) {
      segment.delete(oldest);
      this.stats.evictions += 1;
    }
  }

  writeMissAwareKey(key) {
    const { missAwareCap } = this.getCaps();
    const missAware = this.segments.missAware;
    if (missAware.has(key)) {
      missAware.delete(key);
    }
    while (missAware.size >= missAwareCap) {
      this.evictOldest(missAware);
    }
    missAware.set(key, new SegmentedEntry('', this.ttlMs, true));
  }

  promoteToPopular(key, entry) {
    const { popularCap } = this.getCaps();
    const popular = this.segments.popular;

    if (popular.has(key)) {
      popular.delete(key);
    }
    while (popular.size >= popularCap) {
      this.evictOldest(popular);
    }

    popular.set(key, entry);
  }

  get(key) {
    this.pruneExpired();

    const popularEntry = this.segments.popular.get(key);
    if (popularEntry && !popularEntry.isGhost) {
      this.segments.popular.delete(key);
      popularEntry.touch();
      this.promoteToPopular(key, popularEntry);
      this.stats.hits += 1;
      return popularEntry.value;
    }

    const freshEntry = this.segments.fresh.get(key);
    if (freshEntry && !freshEntry.isGhost) {
      this.segments.fresh.delete(key);
      freshEntry.touch();
      this.promoteToPopular(key, freshEntry);
      this.stats.hits += 1;
      return freshEntry.value;
    }

    this.stats.misses += 1;
    this.writeMissAwareKey(key);
    return null;
  }

  set(key, value) {
    this.pruneExpired();

    this.segments.fresh.delete(key);
    this.segments.popular.delete(key);
    this.segments.missAware.delete(key);

    const { freshCap } = this.getCaps();
    while (this.segments.fresh.size >= freshCap) {
      this.evictOldest(this.segments.fresh);
    }

    this.segments.fresh.set(key, new SegmentedEntry(value, this.ttlMs, false));
    this.stats.stores += 1;
  }

  delete(key) {
    this.pruneExpired();

    const removedFresh = this.segments.fresh.delete(key);
    const removedPopular = this.segments.popular.delete(key);
    const removedMissAware = this.segments.missAware.delete(key);
    return removedFresh || removedPopular || removedMissAware;
  }

  clear() {
    this.segments.fresh.clear();
    this.segments.popular.clear();
    this.segments.missAware.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0, stores: 0 };
  }

  snapshot() {
    this.pruneExpired();
    const reqCount = this.stats.hits + this.stats.misses;
    return {
      policy: 'SEGMENTED',
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
      entries: this.segments.fresh.size + this.segments.popular.size,
      segmentSizes: {
        fresh: this.segments.fresh.size,
        popular: this.segments.popular.size,
        missAware: this.segments.missAware.size
      },
      stats: {
        ...this.stats,
        hitRatio: reqCount === 0 ? 0 : this.stats.hits / reqCount
      }
    };
  }
}

module.exports = { SegmentedCache };
