const rateLimit = require('express-rate-limit');
const { MemoryStore } = require('express-rate-limit');
const env = require('./env');
const { getQueueConnection } = require('./queue');

class RedisWindowStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.windowMs = 60 * 1000;
    this.fallback = new MemoryStore();
    this.warned = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.fallback.init(options);
  }

  async increment(key) {
    if (!env.redisConfigured) return this.fallback.increment(key);
    try {
      const redis = getQueueConnection();
      const redisKey = `${env.queuePrefix || 'autobrand'}:ratelimit:${this.prefix}:${key}`;
      const results = await redis.multi().incr(redisKey).pttl(redisKey).exec();
      const totalHits = Number(results?.[0]?.[1] || 1);
      let ttl = Number(results?.[1]?.[1] || -1);
      if (ttl < 0) {
        await redis.pexpire(redisKey, this.windowMs);
        ttl = this.windowMs;
      }
      return { totalHits, resetTime: new Date(Date.now() + ttl) };
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        console.error(`Redis rate-limit store unavailable; using process-local fallback: ${error.message}`);
      }
      return this.fallback.increment(key);
    }
  }

  async decrement(key) {
    if (!env.redisConfigured) return this.fallback.decrement(key);
    try {
      const redis = getQueueConnection();
      await redis.decr(`${env.queuePrefix || 'autobrand'}:ratelimit:${this.prefix}:${key}`);
    } catch (_error) {
      await this.fallback.decrement(key);
    }
  }

  async resetKey(key) {
    if (!env.redisConfigured) return this.fallback.resetKey(key);
    try {
      const redis = getQueueConnection();
      await redis.del(`${env.queuePrefix || 'autobrand'}:ratelimit:${this.prefix}:${key}`);
    } catch (_error) {
      await this.fallback.resetKey(key);
    }
  }
}

function createRateLimiter({ prefix, windowMs, limit, message, keyGenerator, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new RedisWindowStore(prefix),
    keyGenerator,
    skipSuccessfulRequests,
    message: message || { error: 'Too many requests. Try again later.' }
  });
}

module.exports = { createRateLimiter, RedisWindowStore };
