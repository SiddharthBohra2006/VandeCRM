const buckets = new Map();

// Each limiter instance gets its own memory-bucketed key so different rate
// limited endpoints (login, mail send, csv import/export, ...) never stomp on
// each other. Without the instance-scoped key, one teammate's bulk export could
// exhaust the shared per-IP bucket and lock everyone else out of login.
let limiterCounter = 0;

setInterval(() => {
  const now = Date.now();
  for (const [key, data] of buckets.entries()) {
    if (now > data.resetTime) {
      buckets.delete(key);
    }
  }
}, 10 * 60 * 1000);

function getRateLimiter(limit = 15, windowMs = 60 * 1000, name) {
  const scope = name || `limiter-${++limiterCounter}`;
  return function (req, res, next) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const bucketKey = `${scope}:${ip}`;
    const now = Date.now();

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    const data = buckets.get(bucketKey);

    if (now > data.resetTime) {
      data.count = 1;
      data.resetTime = now + windowMs;
      return next();
    }

    data.count++;

    if (data.count > limit) {
      return res.status(429).json({
        ok: false,
        error: 'Too many requests. Please try again in a minute.'
      });
    }

    next();
  };
}

module.exports = getRateLimiter;