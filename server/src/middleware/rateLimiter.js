const ipRequests = new Map();

// Automatic garbage collection every 10 minutes to prevent memory leaks
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
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
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
      return res.status(429).render('auth/login', {
        title: req.path.includes('admin-recovery') ? 'Admin recovery' : req.path.includes('forgot-password') ? 'Forgot password' : req.path.includes('reset-password') ? 'Reset password' : 'Sign in',
        mode: req.path.includes('admin-recovery') ? 'recovery' : (req.path.includes('signup') ? 'signup' : (req.path.includes('forgot-password') ? 'forgot' : (req.path.includes('reset-password') ? 'reset' : 'login'))),
        token: req.body?.token || '',
        adminRecoveryEnabled: String(process.env.ALLOW_ADMIN_RECOVERY || '').trim().replace(/^['"]|['"]$/g, '').toLowerCase() === 'true' && Boolean(String(process.env.ADMIN_RECOVERY_KEY || '').trim().replace(/^['"]|['"]$/g, '')),
        error: 'Too many login attempts. Please try again in a minute.'
      });
    }

    next();
  };
}

module.exports = getRateLimiter;
