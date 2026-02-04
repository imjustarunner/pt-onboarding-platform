import crypto from 'crypto';
import StorageService from './storage.service.js';
import { SpeechClient } from '@google-cloud/speech';

let speechClient = null;

function getSpeechClient() {
  if (!speechClient) {
    speechClient = new SpeechClient();
  }
  return speechClient;
}

function resolveAudioBucketName() {
  const direct = String(process.env.CLINICAL_AUDIO_BUCKET || '').trim();
  if (direct) return direct;
  const fallback = String(process.env.PTONBOARDFILES || '').trim();
  return fallback || '';
}

function mimeToEncoding(mimeType) {
  const mt = String(mimeType || '').toLowerCase();
  if (mt.includes('webm')) return 'WEBM_OPUS';
  if (mt.includes('ogg')) return 'OGG_OPUS';
  if (mt.includes('wav')) return 'LINEAR16';
  if (mt.includes('mpeg') || mt.includes('mp3')) return 'MP3';
  if (mt.includes('mp4') || mt.includes('m4a')) return 'MP4';
  return null;
}

async function uploadTempAudio({ buffer, mimeType, userId }) {
  const bucketName = resolveAudioBucketName();
  if (!bucketName) {
    const err = new Error('CLINICAL_AUDIO_BUCKET or PTONBOARDFILES is not configured');
    err.status = 503;
    throw err;
  }

  const storage = await StorageService.getGCSStorage();
  const bucket = storage.bucket(bucketName);
  const id = crypto.randomBytes(12).toString('hex');
  const safeUser = Number.isInteger(Number(userId)) ? String(userId) : 'unknown';
  const key = `clinical_audio/${safeUser}/${Date.now()}-${id}`;
  const file = bucket.file(key);

  await file.save(buffer, {
    contentType: mimeType || 'application/octet-stream',
    resumable: false,
    metadata: {
      uploadedAt: new Date().toISOString()
    }
  });

  return { bucketName, key };
}

export async function transcribeLongAudio({ buffer, mimeType, languageCode = 'en-US', userId }) {
  if (!buffer || !(buffer instanceof Buffer) || buffer.length === 0) {
    const err = new Error('Audio buffer is empty');
    err.status = 400;
    throw err;
  }

  const { bucketName, key } = await uploadTempAudio({ buffer, mimeType, userId });
  const gcsUri = `gs://${bucketName}/${key}`;

  try {
    const client = getSpeechClient();
    const encoding = mimeToEncoding(mimeType);
    const request = {
      audio: { uri: gcsUri },
      config: {
        languageCode: String(languageCode || 'en-US'),
        enableAutomaticPunctuation: true,
        model: 'latest_long',
        ...(encoding ? { encoding } : null)
      }
    };

    const [operation] = await client.longRunningRecognize(request);
    const [response] = await operation.promise();
    const results = response?.results || [];
    const transcript = results
      .map((r) => r?.alternatives?.[0]?.transcript || '')
      .filter(Boolean)
      .join(' ')
      .trim();

    return transcript;
  } finally {
    try {
      const storage = await StorageService.getGCSStorage();
      const bucket = storage.bucket(bucketName);
      await bucket.file(key).delete({ ignoreNotFound: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
