/**
 * Encrypt supervision session artifacts at rest (transcript, summary, workspace).
 * Reuses CLIENT_CHAT_ENCRYPTION_KEY_BASE64 like chat / video activity.
 */
import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';

export function isSupervisionArtifactEncryptionConfigured() {
  return isChatEncryptionConfigured();
}

export function packSensitiveArtifactFields({
  transcriptUrl = null,
  transcriptText = null,
  summaryText = null,
  focusTitle = null,
  goals = null,
  actionItems = null,
  privateNotesText = null
} = {}) {
  return {
    transcriptUrl: transcriptUrl || null,
    transcriptText: transcriptText || null,
    summaryText: summaryText || null,
    focusTitle: focusTitle || null,
    goals: Array.isArray(goals) ? goals : (goals || null),
    actionItems: Array.isArray(actionItems) ? actionItems : (actionItems || null),
    privateNotesText: privateNotesText || null
  };
}

export function encryptSensitiveArtifact(fields) {
  if (!isSupervisionArtifactEncryptionConfigured()) return null;
  try {
    return encryptChatText(JSON.stringify(packSensitiveArtifactFields(fields)));
  } catch {
    return null;
  }
}

export function decryptSensitiveArtifact(row) {
  const ciphertext = row?.sensitive_ciphertext ?? row?.sensitiveCiphertext;
  const iv = row?.sensitive_iv ?? row?.sensitiveIv;
  const tag = row?.sensitive_auth_tag ?? row?.sensitiveAuthTag;
  const keyId = row?.encryption_key_id ?? row?.encryptionKeyId;

  if (!ciphertext || !iv || !tag) return null;
  if (!isSupervisionArtifactEncryptionConfigured()) return null;

  try {
    const plaintext = decryptChatText({
      ciphertextB64: ciphertext,
      ivB64: iv,
      authTagB64: tag,
      keyId
    });
    const parsed = JSON.parse(plaintext || '{}');
    return packSensitiveArtifactFields(parsed);
  } catch {
    return null;
  }
}

/** Merge encrypted payload over plaintext legacy columns for API consumers. */
export function resolveArtifactPlainFields(row) {
  const decrypted = decryptSensitiveArtifact(row);
  const parseJson = (value, fallback = []) => {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(String(value)); } catch { return fallback; }
  };

  if (decrypted) {
    return {
      transcriptUrl: decrypted.transcriptUrl,
      transcriptText: decrypted.transcriptText,
      summaryText: decrypted.summaryText,
      focusTitle: decrypted.focusTitle,
      goals: Array.isArray(decrypted.goals) ? decrypted.goals : [],
      actionItems: Array.isArray(decrypted.actionItems) ? decrypted.actionItems : [],
      privateNotesText: decrypted.privateNotesText,
      isEncrypted: true
    };
  }

  return {
    transcriptUrl: row?.transcript_url ?? null,
    transcriptText: row?.transcript_text ?? null,
    summaryText: row?.summary_text ?? null,
    focusTitle: row?.focus_title ?? null,
    goals: parseJson(row?.goals_json, []),
    actionItems: parseJson(row?.action_items_json, []),
    privateNotesText: row?.private_notes_text ?? null,
    isEncrypted: false
  };
}
