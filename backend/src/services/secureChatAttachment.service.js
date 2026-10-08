import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import StorageService from './storage.service.js';
import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';

const localRoot = new URL('../../uploads/', import.meta.url);
const validPath = /^secure-messages\/\d+\/\d+\/[a-f0-9]{48}\.enc$/;

export async function saveSecureChatAttachment({ threadId, userId, buffer }) {
  if (!isChatEncryptionConfigured()) throw Object.assign(new Error('Secure attachment encryption is unavailable'), { status: 503 });
  const filePath = `secure-messages/${Number(threadId)}/${Number(userId)}/${crypto.randomBytes(24).toString('hex')}.enc`;
  const encrypted = Buffer.from(JSON.stringify(encryptChatText(buffer.toString('base64'))));
  if (process.env.PTONBOARDFILES) {
    const bucket = await StorageService.getGCSBucket();
    await bucket.file(`uploads/${filePath}`).save(encrypted, { contentType: 'application/octet-stream', resumable: false });
  } else {
    const file = new URL(filePath, localRoot);
    await fs.mkdir(fileURLToPath(new URL('.', file)), { recursive: true });
    await fs.writeFile(file, encrypted, { mode: 0o600 });
  }
  return { relativePath: filePath };
}

export function assertSecureAttachmentPath(filePath, threadId, userId) {
  if (!validPath.test(filePath) || !filePath.startsWith(`secure-messages/${Number(threadId)}/${Number(userId)}/`)) {
    throw Object.assign(new Error('Upload this attachment in the secure conversation before sending'), { status: 400 });
  }
}

export async function readSecureChatAttachment(filePath) {
  if (!validPath.test(filePath)) throw Object.assign(new Error('Attachment not found'), { status: 404 });
  const encrypted = process.env.PTONBOARDFILES
    ? await StorageService.readObjectBuffer(`uploads/${filePath}`)
    : await fs.readFile(new URL(filePath, localRoot));
  return Buffer.from(decryptChatText(JSON.parse(encrypted.toString())), 'base64');
}
