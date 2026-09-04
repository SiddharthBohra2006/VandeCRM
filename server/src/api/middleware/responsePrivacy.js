const { hasPermission } = require('../../config/roles');

// Replacer runs after Mongoose toJSON, including on nested populated and lean data.
function responseReplacer(user) {
  return (key, value) => {
    if (['passwordHash', 'passwordResetTokenHash', 'passwordResetExpiresAt', 'apiKeyHistory'].includes(key) || key.endsWith('Encrypted')) return undefined;
    if (key === 'apiKey' && !hasPermission(user, 'integrations.update')) return undefined;
    return value;
  };
}
function responsePrivacy(req, res, next) {
  const json = res.json;
  res.json = function(body) {
    if (body === undefined) return json.call(this, body);
    return json.call(this, JSON.parse(JSON.stringify(body, responseReplacer(req.user))));
  };
  next();
}
module.exports = { responsePrivacy, responseReplacer };
