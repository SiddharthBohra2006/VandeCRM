const ipRequests = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRequests.entries()) {
    if (now > data.resetTime) {
      ipRequests.delete(ip);
    }
  }
}, 10 * 60 * 1000);

function getRateLimiter(limit = 15, windowMs = 60 * 1000) {
  return function (req, res, next) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    if (!ipRequests.has(ip)) {
      ipRequests.set(ip, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    const data = ipRequests.get(ip);

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
