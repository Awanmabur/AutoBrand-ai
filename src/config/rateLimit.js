const rateLimit = require('express-rate-limit');
const { MemoryStore } = require('express-rate-limit');
const env = require('./env');
const { getQueueConnection } = require('./queue');
const RateLimitBucket = require('../models/RateLimitBucket');

function bucketKey(prefix, key) {
  return `${env.queuePrefix || 'autobrand'}:ratelimit:${prefix}:${key}`;
}

class MongoWindowStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.windowMs = 60 * 1000;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const now = new Date();
    const nextReset = new Date(now.getTime() + this.windowMs);
    const fullKey = bucketKey(this.prefix, key);

    const doc = await RateLimitBucket.findOneAndUpdate(
      { key: fullKey },
      [
        {
          $set: {
            key: { $literal: fullKey },
            totalHits: {
              $cond: [
                { $gt: ['$resetAt', now] },
                { $add: [{ $ifNull: ['$totalHits', 0] }, 1] },
                1
              ]
            },
            resetAt: {
              $cond: [
                { $gt: ['$resetAt', now] },
                '$resetAt',
                nextReset
              ]
            },
            updatedAt: now,
            createdAt: { $ifNull: ['$createdAt', now] }
          }
        }
      ],
      { upsert: true, new: true }
    ).lean();

    return {
      totalHits: Number(doc?.totalHits || 1),
      resetTime: new Date(doc?.resetAt || nextReset)
    };
  }

  async decrement(key) {
    const fullKey = bucketKey(this.prefix, key);
    await RateLimitBucket.updateOne(
      { key: fullKey, totalHits: { $gt: 0 } },
      { $inc: { totalHits: -1 } }
    );
  }

  async resetKey(key) {
    await RateLimitBucket.deleteOne({ key: bucketKey(this.prefix, key) });
  }
}

class DistributedWindowStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.windowMs = 60 * 1000;
    this.mongo = new MongoWindowStore(prefix);
    this.developmentFallback = new MemoryStore();
    this.redisWarningAt = 0;
    this.mongoWarningAt = 0;
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.mongo.init(options);
    this.developmentFallback.init(options);
  }

  warn(kind, error) {
    const field = kind === 'redis' ? 'redisWarningAt' : 'mongoWarningAt';
    const now = Date.now();
    if (now - this[field] < 60_000) return;
    this[field] = now;
    console.error(`[rate-limit] ${kind} store unavailable`, { message: error?.message || String(error) });
  }

  async increment(key) {
    if (env.redisConfigured) {
      try {
        const redis = getQueueConnection();
        const redisKey = bucketKey(this.prefix, key);
        const results = await redis.multi().incr(redisKey).pttl(redisKey).exec();
        const totalHits = Number(results?.[0]?.[1] || 1);
        let ttl = Number(results?.[1]?.[1] || -1);
        if (ttl < 0) {
          await redis.pexpire(redisKey, this.windowMs);
          ttl = this.windowMs;
        }
        return { totalHits, resetTime: new Date(Date.now() + ttl) };
      } catch (error) {
        this.warn('redis', error);
      }
    }

    try {
      return await this.mongo.increment(key);
    } catch (error) {
      this.warn('mongo', error);
      if (env.nodeEnv === 'production') {
        error.code = error.code || 'ERATELIMITSTORE';
        throw error;
      }
      return this.developmentFallback.increment(key);
    }
  }

  async decrement(key) {
    if (env.redisConfigured) {
      try {
        const redis = getQueueConnection();
        await redis.decr(bucketKey(this.prefix, key));
        return;
      } catch (error) {
        this.warn('redis', error);
      }
    }

    try {
      await this.mongo.decrement(key);
    } catch (error) {
      this.warn('mongo', error);
      if (env.nodeEnv === 'production') {
        error.code = error.code || 'ERATELIMITSTORE';
        throw error;
      }
      await this.developmentFallback.decrement(key);
    }
  }

  async resetKey(key) {
    if (env.redisConfigured) {
      try {
        const redis = getQueueConnection();
        await redis.del(bucketKey(this.prefix, key));
        return;
      } catch (error) {
        this.warn('redis', error);
      }
    }

    try {
      await this.mongo.resetKey(key);
    } catch (error) {
      this.warn('mongo', error);
      if (env.nodeEnv === 'production') {
        error.code = error.code || 'ERATELIMITSTORE';
        throw error;
      }
      await this.developmentFallback.resetKey(key);
    }
  }
}

function createRateLimiter({ prefix, windowMs, limit, message, keyGenerator, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new DistributedWindowStore(prefix),
    keyGenerator,
    skipSuccessfulRequests,
    passOnStoreError: false,
    message: message || { error: 'Too many requests. Try again later.' }
  });
}

module.exports = { createRateLimiter, DistributedWindowStore, MongoWindowStore };
