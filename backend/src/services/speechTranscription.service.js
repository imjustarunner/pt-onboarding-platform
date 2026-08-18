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

/** Map Google diarization tag (1-based) to human labels for dyadic sessions. */
export function resolveSpeakerDisplayLabel(
  speakerTag,
  { providerLabel = 'Speaker 1', clientLabel = 'Speaker 2', extraSpeakerPrefix = 'Speaker' } = {}
) {
  const tag = Number(speakerTag);
  if (!Number.isFinite(tag) || tag < 1) return extraSpeakerPrefix;
  if (tag === 1) return providerLabel;
  if (tag === 2) return clientLabel;
  return `${extraSpeakerPrefix} ${tag}`;
}

/** Build a labeled transcript from Speech-to-Text word-level diarization. */
export function formatDiarizedTranscriptFromWords(
  words,
  { providerLabel = 'Speaker 1', clientLabel = 'Speaker 2' } = {}
) {
  const labelOpts = { providerLabel, clientLabel };
  const segments = [];
  let currentSpeaker = null;
  let buf = [];
  for (const w of words || []) {
    const tag = w.speakerTag != null ? Number(w.speakerTag) : 0;
    const word = String(w.word || '').trim();
    if (!word) continue;
    if (currentSpeaker == null) currentSpeaker = tag;
    if (tag !== currentSpeaker) {
      if (buf.length) {
        segments.push(
          `[${resolveSpeakerDisplayLabel(currentSpeaker, labelOpts)}] ${buf.join(' ')}`
        );
      }
      currentSpeaker = tag;
      buf = [word];
    } else {
      buf.push(word);
    }
  }
  if (buf.length) {
    segments.push(`[${resolveSpeakerDisplayLabel(currentSpeaker, labelOpts)}] ${buf.join(' ')}`);
  }
  return segments.join('\n').trim();
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

export async function transcribeLongAudio({
  buffer,
  mimeType,
  languageCode = 'en-US',
  userId,
  enableSpeakerDiarization = false,
  diarizationSpeakerCount = 2,
  providerLabel = 'Speaker 1',
  clientLabel = 'Speaker 2'
} = {}) {
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
    const speakerCount = Math.min(6, Math.max(2, Number(diarizationSpeakerCount) || 2));
    const request = {
      audio: { uri: gcsUri },
      config: {
        languageCode: String(languageCode || 'en-US'),
        enableAutomaticPunctuation: true,
        model: 'latest_long',
        ...(encoding ? { encoding } : null),
        ...(enableSpeakerDiarization
          ? {
              diarizationConfig: {
                enableSpeakerDiarization: true,
                minSpeakerCount: 2,
                maxSpeakerCount: speakerCount
              }
            }
          : null)
      }
    };

    const [operation] = await client.longRunningRecognize(request);
    const [response] = await operation.promise();
    const results = response?.results || [];

    if (enableSpeakerDiarization) {
      const last = results[results.length - 1];
      const words = last?.alternatives?.[0]?.words || [];
      const diarized = formatDiarizedTranscriptFromWords(words, { providerLabel, clientLabel });
      if (diarized) return diarized;
    }

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
