const nodemailer = require('nodemailer');
const { decrypt } = require('./encryption');

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function valueForToken(token, context) {
  const [scope, key] = String(token || '').split('.');
  if (!scope || !key) return '';
  const source = context[scope];
  if (!source) return '';
  const value = source[key];
  if (value === null || value === undefined) return '';
  return String(value);
}

function renderTemplate(content, context = {}) {
  return String(content || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, token) => valueForToken(token, context));
}

function textToHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function usesImplicitTls(port) {
  return [465, 2465].includes(Number(port));
}

function createTransport(account) {
  const password = decrypt(account.smtpPasswordEncrypted);
  const port = Number(account.smtpPort || 587);
  return nodemailer.createTransport({
    host: account.smtpHost,
    port,
    secure: account.smtpSecure || usesImplicitTls(port),
    requireTLS: !(account.smtpSecure || usesImplicitTls(port)),
    auth: {
      user: account.smtpUsername,
      pass: password
    },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000)
  });
}

async function verifyEmailAccount(account) {
  if (!account || !account.isActive) {
    throw new Error('Active email account is not configured.');
  }

  const transporter = createTransport(account);
  await transporter.verify();
}

async function sendEmail(account, message) {
  if (!account || !account.isActive) {
    throw new Error('Active email account is not configured.');
  }

  if (!isValidEmail(message.to)) {
    throw new Error('Recipient email address is invalid.');
  }

  const transporter = createTransport(account);
  const fromLabel = account.fromName ? `${account.fromName} <${account.fromEmail}>` : account.fromEmail;
  const isHtml = /<[a-z][\s\S]*>/i.test(message.body);
  return transporter.sendMail({
    from: fromLabel,
    to: message.to,
    replyTo: account.replyTo || account.fromEmail,
    subject: message.subject,
    text: isHtml ? message.body.replace(/<[^>]*>/g, '') : message.body,
    html: isHtml ? message.body : textToHtml(message.body)
  });
}

module.exports = { isValidEmail, renderTemplate, sendEmail, usesImplicitTls, verifyEmailAccount };
