import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Storage } from '@google-cloud/storage';
import { KeyManagementServiceClient } from '@google-cloud/kms';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);
const storage = new Storage();
const kmsClient = new KeyManagementServiceClient();

const app = express();
app.use(express.json({ type: ['application/json', 'application/cloudevents+json'] }));

const QUARANTINE_PREFIX = 'referrals_quarantine/';

function resolveEventPayload(req) {
  if (!req?.body) return {};
  return req.body.data || req.body;
}

function resolveStorageObject(payload) {
  return {
    bucket: payload.bucket || payload.bucketName || payload.bucketId || payload.bucket_id,
    name: payload.name || payload.object || payload.objectId || payload.object_id
  };
}

async function decryptBuffer({ encryptedBuffer, metadata }) {
  const wrappedKey = metadata?.encryptionWrappedKey;
  const ivB64 = metadata?.encryptionIv;
  const authTagB64 = metadata?.encryptionAuthTag;
  const keyId = metadata?.encryptionKeyId;
  const aad = metadata?.encryptionAad;

  if (!wrappedKey || !ivB64 || !authTagB64 || !keyId) {
    throw new Error('Missing encryption metadata for decryption');
  }

  const [decryptResponse] = await kmsClient.decrypt({
    name: keyId,
    ciphertext: Buffer.from(String(wrappedKey), 'base64')
  });

  const dataKey = decryptResponse.plaintext;
  const iv = Buffer.from(String(ivB64), 'base64');
  const authTag = Buffer.from(String(authTagB64), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, iv);
  if (aad) {
    decipher.setAAD(Buffer.from(String(aad)));
  }
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}

async function scanWithClamav(buffer) {
  const tmpPath = path.join('/tmp', `referral-scan-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  await fs.writeFile(tmpPath, buffer);
  try {
    const { stdout } = await execFileAsync('clamscan', ['-i', '--no-summary', tmpPath], {
      timeout: 120000
    });
    return { status: 'clean', details: stdout?.trim() || null };
  } catch (error) {
    const code = Number(error?.code);
    if (code === 1) {
      const details = String(error?.stdout || '').trim() || 'Threat detected';
      return { status: 'infected', details };
    }
    const details = String(error?.stderr || error?.message || 'Scan failed').trim();
    return { status: 'error', details };
  } finally {
    await fs.rm(tmpPath, { force: true });
  }
}

async function postScanResult({ storagePath, scanStatus, scanResult }) {
  const backendUrl = process.env.BACKEND_URL;
  const token = process.env.REFERRAL_SCAN_TOKEN;
  if (!backendUrl || !token) {
    throw new Error('BACKEND_URL and REFERRAL_SCAN_TOKEN must be configured');
  }
  const response = await fetch(`${backendUrl.replace(/\/$/, '')}/api/referrals/scan-result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-referral-scan-token': token
    },
    body: JSON.stringify({
      storagePath,
      scanStatus,
      scanResult
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to post scan result (${response.status}): ${text}`);
  }
}

app.post('/', async (req, res) => {
  try {
    const payload = resolveEventPayload(req);
    const { bucket, name } = resolveStorageObject(payload);
    if (!bucket || !name) {
      return res.status(200).json({ ok: true, ignored: true, reason: 'Missing bucket or name' });
    }
    if (!name.startsWith(QUARANTINE_PREFIX)) {
      return res.status(200).json({ ok: true, ignored: true, reason: 'Not a quarantine object' });
    }

    const file = storage.bucket(bucket).file(name);
    const [metadata] = await file.getMetadata();
    const userMetadata = metadata?.metadata || {};
    const [encryptedBuffer] = await file.download();
    const buffer = userMetadata.isEncrypted === 'true'
      ? await decryptBuffer({ encryptedBuffer, metadata: userMetadata })
      : encryptedBuffer;

    const scanResult = await scanWithClamav(buffer);
    await postScanResult({
      storagePath: name,
      scanStatus: scanResult.status,
      scanResult: scanResult.details
    });

    res.json({ ok: true, scanned: true, status: scanResult.status });
  } catch (error) {
    console.error('Scan handler error:', error);
    res.status(500).json({ ok: false, error: error?.message || 'Scan failed' });
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`Referral scanner listening on ${port}`);
});
