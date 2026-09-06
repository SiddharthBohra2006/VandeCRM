function securityHeaders(req, res, next) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Content-Security-Policy: the API returns JSON only, so a conservative,
  // remote-origin-free policy is safe. The SPA static build served in production
  // must NOT get this header — its own script/style/image origins would be
  // blocked.
  if (req.path.startsWith('/api/')) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
    );
  }

  // Enforce HSTS in production to force HTTPS connection
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

module.exports = securityHeaders;
