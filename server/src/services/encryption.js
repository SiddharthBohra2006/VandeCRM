const crypto = require('crypto');

function getEncryptionKey() {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY environment variable is not configured. Decryption/Encryption aborted.');
  }
  // Hash the secret to ensure it is exactly 32 bytes (256 bits) for AES-256
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text) {
  if (!text) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 12-byte IV for GCM mode
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  
  // Format: ivHex:encryptedHex:tagHex
  return `${iv.toString('hex')}:${encrypted}:${tag}`;
}

function decrypt(encryptedText) {
  if (!encryptedText) return '';
  if (!encryptedText.includes(':')) {
    throw new Error('Invalid encrypted format. Expected iv:ciphertext:tag');
  }
  
  const key = getEncryptionKey();
  const [ivHex, encryptedHex, tagHex] = encryptedText.split(':');
  
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };
