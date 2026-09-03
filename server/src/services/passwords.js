const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, hash] = storedHash.split(':');
  const key = await scrypt(password, salt, 64);
  const storedBuffer = Buffer.from(hash, 'hex');
  return storedBuffer.length === key.length && crypto.timingSafeEqual(storedBuffer, key);
}

module.exports = { hashPassword, verifyPassword };
