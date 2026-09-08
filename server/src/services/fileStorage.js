const { decrypt } = require('./encryption');
const { getGoogleAccessToken } = require('./googleService');

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

function extractDriveFolderId(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  const folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  try {
    const url = new URL(input);
    return url.searchParams.get('id') || '';
  } catch (_) {
    return /^[a-zA-Z0-9_-]{10,}$/.test(input) ? input : '';
  }
}

function parseAttachmentPayload(body = {}) {
  const rawData = String(body.fileData || '');
  const match = rawData.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { ok: false, message: 'Please select a valid file before uploading.' };
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return { ok: false, message: 'Selected file is empty.' };
  if (buffer.length > MAX_ATTACHMENT_SIZE) return { ok: false, message: 'Attachment must be 5 MB or smaller.' };
  const originalName = String(body.originalName || 'attachment').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return {
    ok: true,
    buffer,
    mimeType: match[1] || 'application/octet-stream',
    originalName: originalName || 'attachment',
    category: ['proposal', 'contract', 'invoice', 'brief', 'screenshot', 'other'].includes(body.category) ? body.category : 'other',
    notes: String(body.notes || '').trim(),
  };
}

function driveStatus(company) {
  const folderId = extractDriveFolderId(company?.googleDriveFolderLink);
  const hasCredentials = Boolean(company?.googleDriveServiceAccountJsonEncrypted || company?.ga4ServiceAccountJsonEncrypted);
  return {
    provider: folderId && hasCredentials ? 'google_drive' : 'crm',
    ready: Boolean(folderId && hasCredentials),
    folderUrl: company?.googleDriveFolderLink || '',
    missing: [!folderId && 'Google Drive folder', !hasCredentials && 'Google service account'].filter(Boolean),
  };
}

function getServiceAccount(company) {
  let parsed;
  try {
    parsed = JSON.parse(decrypt(company.googleDriveServiceAccountJsonEncrypted || company.ga4ServiceAccountJsonEncrypted));
  } catch (_) {
    throw new Error('The saved Google service account could not be read. Save it again in Integrations.');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Google service account JSON must include client_email and private_key.');
  }
  return parsed;
}

async function googleRequest(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.GOOGLE_REQUEST_TIMEOUT_MS || 15000));
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Google Drive request failed (${response.status}).`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadToDrive(company, payload) {
  const serviceAccount = getServiceAccount(company);
  const accessToken = await getGoogleAccessToken(serviceAccount.client_email, serviceAccount.private_key, DRIVE_SCOPE);
  const boundary = `vandecrm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const metadata = Buffer.from(JSON.stringify({
    name: payload.originalName,
    parents: [extractDriveFolderId(company.googleDriveFolderLink)],
  }));
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    metadata,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${payload.mimeType}\r\n\r\n`),
    payload.buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await googleRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });
  return response.json();
}

async function storeAttachment(company, payload) {
  if (!driveStatus(company).ready) {
    return { storageProvider: 'crm', data: payload.buffer, externalFileId: '', externalUrl: '' };
  }
  const file = await uploadToDrive(company, payload);
  return {
    storageProvider: 'google_drive',
    data: null,
    externalFileId: file.id,
    externalUrl: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
  };
}

async function readAttachment(company, attachment) {
  if (attachment.storageProvider !== 'google_drive') {
    if (!attachment.data) throw new Error('This CRM file no longer has stored data.');
    return attachment.data;
  }
  if (!driveStatus(company).ready) {
    throw new Error('Reconnect Google Drive in Integrations to download this file.');
  }
  const serviceAccount = getServiceAccount(company);
  const accessToken = await getGoogleAccessToken(serviceAccount.client_email, serviceAccount.private_key, DRIVE_SCOPE);
  const response = await googleRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(attachment.externalFileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return Buffer.from(await response.arrayBuffer());
}

module.exports = { driveStatus, extractDriveFolderId, parseAttachmentPayload, readAttachment, storeAttachment };
