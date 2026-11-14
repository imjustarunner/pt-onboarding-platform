import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptChatContent, encryptChatText, decryptChatContent, decryptChatText, readChatMessageContent } from '../chatEncryption.service.js';

const row = encrypted => ({ body: null, body_ciphertext: encrypted.ciphertextB64, body_iv: encrypted.ivB64,
  body_auth_tag: encrypted.authTagB64, encryption_key_id: encrypted.keyId });
beforeEach(() => { vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64')); });
afterEach(() => vi.unstubAllEnvs());

describe('versioned secure message subjects', () => {
  it('encrypts body and subject together while body-only consumers remain compatible', () => {
    const original = { subject: 'Fictional session preparation', body: 'Fictional private update 🔒' };
    const encrypted = encryptChatContent(original);
    for (const text of Object.values(original)) expect(JSON.stringify(encrypted)).not.toContain(text);
    expect(decryptChatContent(encrypted)).toEqual(original);
    expect(decryptChatText(encrypted)).toBe(original.body);
    expect(readChatMessageContent({ ...row(encrypted), subject: 'untrusted plaintext' })).toEqual(original);
  });
  it('keeps old encrypted and plaintext messages readable without interpreting their body as an envelope', () => {
    const body = JSON.stringify({ version: 1, type: 'secure_message', body: 'literal JSON', subject: 'literal title' });
    expect(readChatMessageContent({ ...row(encryptChatText(body)), subject: 'Legacy title' })).toEqual({ body, subject: 'Legacy title' });
    expect(readChatMessageContent({ body: 'Old plaintext', subject: 'Old title' })).toEqual({ body: 'Old plaintext', subject: 'Old title' });
  });
  it('does not use plaintext fallback for a new envelope with no subject or broken authentication', () => {
    expect(readChatMessageContent({ ...row(encryptChatContent({ body: 'No title' })), subject: 'Do not use' })).toEqual({ body: 'No title', subject: null });
    const encrypted = encryptChatContent({ body: 'Private body', subject: 'Private title' });
    expect(() => readChatMessageContent({ ...row(encrypted), body_auth_tag: Buffer.alloc(16, 0).toString('base64'), subject: 'Do not use' })).toThrow();
  });
  it('uses key rotation for the structured format and keeps ciphertext randomized', () => {
    const original = { body: 'Same body', subject: 'Same title' };
    const first = encryptChatContent(original), second = encryptChatContent(original);
    expect(first.ciphertextB64).not.toBe(second.ciphertextB64);
    vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEYS_JSON', JSON.stringify({ v1: Buffer.alloc(32, 7).toString('base64') }));
    vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 9).toString('base64'));
    expect(decryptChatContent(first)).toEqual(original);
  });
});
