const crypto = require('crypto');

function csrfProtection(req, res, next) {
  // 1. Verify session exists
  if (!req.session) {
    return next();
  }

  // 2. Generate cryptographically secure token if not present
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }

  res.locals.csrfToken = req.session.csrfToken;

  // 3. Response interceptor: automatically inject hidden _csrf input in HTML POST forms
  const originalSend = res.send;
  res.send = function (body) {
    if (typeof body === 'string' && res.locals.csrfToken) {
      body = body.replace(
        /(<form[^>]*method=["']POST["'][^>]*>)/gi,
        `$1\n<input type="hidden" name="_csrf" value="${res.locals.csrfToken}">`
      );
    }
    return originalSend.call(this, body);
  };

  // 4. Safe methods bypass validation
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // 5. Inbound API & Webhook web receiver bypass
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/')) {
    return next();
  }

  // 6. Validate token
  const token = req.body?._csrf || req.headers['x-csrf-token'];
  const validToken = Array.isArray(token) ? token.includes(req.session.csrfToken) : token === req.session.csrfToken;
  if (!validToken) {
    const err = new Error('Forbidden: Invalid or missing CSRF token.');
    err.status = 403;
    return next(err);
  }

  next();
}

module.exports = csrfProtection;
