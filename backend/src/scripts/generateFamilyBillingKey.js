#!/usr/bin/env node
/** Writes a NEW key to a private file; never prints it or replaces an existing key. */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = mkdtempSync(join(tmpdir(), 'family-billing-key-'));
const file = join(directory, 'key.txt');
writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
console.log(`New key saved privately to: ${file}`);
console.log('Import that file into Secret Manager. Do not paste the contents into chat, commit it, or replace an existing key used by encrypted records.');
console.log('Use FAMILY_BILLING_ENCRYPTION_KEY_ID=v1 for a first-time key. Preserve all existing intake/chat/document keys.');
