/**
 * Cache layer.
 *
 * Uses Redis when REDIS_URL is set (production / anyone running a Redis server),
 * and falls back to an in-process TTL + LRU store otherwise so the app still
 * runs fast on a plain local machine with nothing extra installed.
 *
 * Both backends expose the same tiny async API: get / set / delPrefix / flush.
 */

const MAX_MEMORY_ENTRIES = 500;

/* ------------------------------------------------------------------ *
 * In-process fallback: Map preserves insertion order, so the first key
 * is always the least recently used once we re-insert on every read.
 * ------------------------------------------------------------------ */
class MemoryCache {
    constructor(maxEntries = MAX_MEMORY_ENTRIES) {
        this.store = new Map();
        this.maxEntries = maxEntries;
        this.hits = 0;
        this.misses = 0;
    }

    async get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            this.misses++;
            return null;
        }
        if (entry.expiresAt <= Date.now()) {
            this.store.delete(key);
            this.misses++;
            return null;
        }
        // Refresh recency.
        this.store.delete(key);
        this.store.set(key, entry);
        this.hits++;
        return entry.value;
    }

    async set(key, value, ttlSeconds) {
        if (this.store.size >= this.maxEntries && !this.store.has(key)) {
            const oldest = this.store.keys().next().value;
            if (oldest !== undefined) this.store.delete(oldest);
        }
        this.store.delete(key);
        this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    }

    async delPrefix(prefix) {
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) this.store.delete(key);
        }
    }

    async flush() {
        this.store.clear();
    }

    stats() {
        return { driver: 'memory', entries: this.store.size, hits: this.hits, misses: this.misses };
    }
}

/* ------------------------------------------------------------------ *
 * Redis backend
 * ------------------------------------------------------------------ */
class RedisCache {
    constructor(client, namespace = 'ksjadu') {
        this.client = client;
        this.ns = namespace;
        this.hits = 0;
        this.misses = 0;
    }

    key(k) {
        return `${this.ns}:${k}`;
    }

    async get(key) {
        try {
            const raw = await this.client.get(this.key(key));
            if (raw === null) {
                this.misses++;
                return null;
            }
            this.hits++;
            return JSON.parse(raw);
        } catch (err) {
            console.error('[cache] redis get failed:', err.message);
            return null;
        }
    }

    async set(key, value, ttlSeconds) {
        try {
            await this.client.set(this.key(key), JSON.stringify(value), 'EX', ttlSeconds);
        } catch (err) {
            console.error('[cache] redis set failed:', err.message);
        }
    }

    async delPrefix(prefix) {
        try {
            const pattern = `${this.key(prefix)}*`;
            let cursor = '0';
            do {
                const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
                cursor = next;
                if (keys.length) await this.client.del(...keys);
            } while (cursor !== '0');
        } catch (err) {
            console.error('[cache] redis delPrefix failed:', err.message);
        }
    }

    async flush() {
        await this.delPrefix('');
    }

    stats() {
        return { driver: 'redis', hits: this.hits, misses: this.misses };
    }
}

/* ------------------------------------------------------------------ *
 * Driver selection
 * ------------------------------------------------------------------ */
let cache;

if (process.env.REDIS_URL) {
    try {
        const Redis = require('ioredis');
        const client = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 2,
            enableOfflineQueue: false,
            lazyConnect: false,
        });
        client.on('error', (err) => console.error('[cache] redis error:', err.message));
        client.on('connect', () => console.log('[cache] Redis connected'));
        cache = new RedisCache(client);
    } catch (err) {
        console.error('[cache] Redis unavailable, using in-memory cache:', err.message);
        cache = new MemoryCache();
    }
} else {
    console.log('[cache] REDIS_URL not set - using in-memory cache');
    cache = new MemoryCache();
}

/**
 * Express middleware that caches a GET response body.
 *
 * @param {string} prefix     invalidation namespace, e.g. 'products'
 * @param {number} ttlSeconds how long a cached entry stays fresh
 */
const cacheRoute = (prefix, ttlSeconds = 60) => async (req, res, next) => {
    if (req.method !== 'GET') return next();

    const key = `${prefix}:${req.originalUrl}`;

    try {
        const hit = await cache.get(key);
        if (hit) {
            res.set('X-Cache', 'HIT');
            res.set('Cache-Control', `public, max-age=${ttlSeconds}`);
            if (hit.etag) {
                res.set('ETag', hit.etag);
                if (req.headers['if-none-match'] === hit.etag) return res.status(304).end();
            }
            return res.json(hit.body);
        }
    } catch (err) {
        console.error('[cache] read failed:', err.message);
    }

    res.set('X-Cache', 'MISS');

    // Intercept res.json so we can store whatever the route produces.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            const etag = `W/"${require('crypto')
                .createHash('sha1')
                .update(JSON.stringify(body))
                .digest('base64')}"`;
            res.set('ETag', etag);
            res.set('Cache-Control', `public, max-age=${ttlSeconds}`);
            cache.set(key, { body, etag }, ttlSeconds).catch(() => { });
        }
        return originalJson(body);
    };

    next();
};

/** Drop every cached entry under one or more namespaces. */
const invalidate = async (...prefixes) => {
    await Promise.all(prefixes.map((p) => cache.delPrefix(`${p}:`)));
};

module.exports = { cache, cacheRoute, invalidate };
