import crypto from 'crypto';
import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';

/**
 * Reuse chat AES-GCM key ring for demographics PHI envelopes.
 * Prefer CLIENT_PHI_ENCRYPTION_KEY_BASE64 when set (falls through to chat key via encryptChatText).
 */

function getPhiKeyMaterial() {
  const phi = process.env.CLIENT_PHI_ENCRYPTION_KEY_BASE64;
  if (phi) {
    try {
      let raw = String(phi).trim();
      if (
        (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2)
        || (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
      ) {
        raw = raw.slice(1, -1).trim();
      }
      const buf = Buffer.from(raw, 'base64');
      if (buf.length === 32) return buf;
    } catch {
      // fall through
    }
  }
  return null;
}

export function isDemographicsEncryptionConfigured() {
  return !!getPhiKeyMaterial() || isChatEncryptionConfigured();
}

export function encryptDemographicsPayload(obj) {
  const plaintext = JSON.stringify(obj || {});
  const phiKey = getPhiKeyMaterial();
  if (phiKey) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', phiKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertextB64: ciphertext.toString('base64'),
      ivB64: iv.toString('base64'),
      authTagB64: tag.toString('base64'),
      keyId: process.env.CLIENT_PHI_ENCRYPTION_KEY_ID || 'phi-v1'
    };
  }
  return encryptChatText(plaintext);
}

export function decryptDemographicsPayload(envelope) {
  if (!envelope) return null;
  const env = typeof envelope === 'string' ? JSON.parse(envelope) : envelope;
  const phiKey = getPhiKeyMaterial();
  if (phiKey && env?.ciphertextB64) {
    try {
      const iv = Buffer.from(String(env.ivB64 || ''), 'base64');
      const tag = Buffer.from(String(env.authTagB64 || ''), 'base64');
      const ciphertext = Buffer.from(String(env.ciphertextB64 || ''), 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', phiKey, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(plaintext.toString('utf8'));
    } catch {
      // fall through to chat key ring
    }
  }
  const text = decryptChatText(env);
  return JSON.parse(text);
}

function parseDateLoose(text) {
  const s = String(text || '').trim();
  const mdY = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2}|19\d{2})\b/);
  if (mdY) {
    const mm = String(mdY[1]).padStart(2, '0');
    const dd = String(mdY[2]).padStart(2, '0');
    return `${mdY[3]}-${mm}-${dd}`;
  }
  const iso = s.match(/^(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function parseAddressBlock(lines) {
  const out = { street: null, city: null, state: null, zip: null };
  if (!lines.length) return out;
  out.street = lines[0];
  const cityLine = lines[1] || '';
  const m = cityLine.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i);
  if (m) {
    out.city = m[1].trim();
    out.state = m[2].toUpperCase();
    out.zip = m[3];
  } else if (cityLine) {
    out.city = cityLine;
  }
  return out;
}

const STOP_LABELS = [
  'Administrative Sex',
  'Gender Identity',
  'Sexual Orientation',
  'Race',
  'Ethnicity',
  'Languages',
  'Smoking Status',
  'Marital Status',
  'Employment',
  'Religious Affiliation',
  'HIPAA',
  'PCP Release'
];

function looksLikePhone(line) {
  return /^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(String(line || '').trim());
}

function looksLikeEmail(line) {
  return /@/.test(String(line || ''));
}

/**
 * Parse Note Aid demographics paste into structured fields.
 */
export function parseDemographicsPaste(rawText) {
  const raw = String(rawText || '').replace(/\r\n/g, '\n').trim();
  const empty = {
    fullName: null,
    dateOfBirth: null,
    addressStreet: null,
    addressCity: null,
    addressState: null,
    addressZip: null,
    timezone: null,
    contactPhone: null,
    textMessagesOk: null,
    email: null,
    appointmentReminderType: null,
    administrativeSex: null
  };
  if (!raw) return empty;

  const lines = raw.split('\n').map((l) => l.trim());

  let i = 0;
  const result = { ...empty };

  // Legal Name header
  if (/^legal\s+name$/i.test(lines[i] || '')) i += 1;
  if (lines[i] && !parseDateLoose(lines[i]) && !looksLikePhone(lines[i]) && !looksLikeEmail(lines[i])) {
    result.fullName = lines[i];
    i += 1;
  }

  // DOB (+ optional Age glued or on next line)
  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i += 1;
      continue;
    }
    if (/^age\s*:/i.test(line)) {
      i += 1;
      continue;
    }
    const dobInline = line.match(/^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s*(?:Age:.*)?$/i);
    if (dobInline) {
      result.dateOfBirth = parseDateLoose(dobInline[1]);
      i += 1;
      break;
    }
    // "7/17/2014Age: 12y…" with no space before Age
    const glued = line.match(/^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})Age:/i);
    if (glued) {
      result.dateOfBirth = parseDateLoose(glued[1]);
      i += 1;
      break;
    }
    const dob = parseDateLoose(line);
    if (dob) {
      result.dateOfBirth = dob;
      i += 1;
      break;
    }
    break;
  }

  while (i < lines.length && !lines[i]) i += 1;

  // Address block until timezone / phone / email / stop labels
  const addrLines = [];
  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i += 1;
      if (addrLines.length) break;
      continue;
    }
    if (/UTC|Mountain Time|Pacific Time|Central Time|Eastern Time|\bMT\s*-|\bPT\s*-|\bCT\s*-|\bET\s*-/i.test(line)) break;
    if (looksLikePhone(line) || looksLikeEmail(line)) break;
    if (STOP_LABELS.some((l) => line.toLowerCase() === l.toLowerCase())) break;
    addrLines.push(line);
    i += 1;
    if (addrLines.length >= 3) break;
  }
  const addr = parseAddressBlock(addrLines);
  result.addressStreet = addr.street;
  result.addressCity = addr.city;
  result.addressState = addr.state;
  result.addressZip = addr.zip;

  while (i < lines.length && !lines[i]) i += 1;

  // Timezone
  if (lines[i] && /UTC|Time|\bMT\b|\bPT\b|\bCT\b|\bET\b/i.test(lines[i])) {
    result.timezone = lines[i];
    i += 1;
  }

  while (i < lines.length && !lines[i]) i += 1;

  // Phone + optional (Text messages OK)
  if (lines[i] && looksLikePhone(lines[i])) {
    result.contactPhone = lines[i].match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] || lines[i];
    i += 1;
  }
  if (lines[i] && /text messages?\s*ok/i.test(lines[i])) {
    result.textMessagesOk = true;
    i += 1;
  } else if (result.contactPhone) {
    result.textMessagesOk = false;
  }

  while (i < lines.length && !lines[i]) i += 1;

  // Email
  if (lines[i] && looksLikeEmail(lines[i])) {
    result.email = lines[i];
    i += 1;
  }

  while (i < lines.length && !lines[i]) i += 1;

  // Reminder type — until recommendation blurb or Administrative Sex
  if (
    lines[i]
    && !/^administrative\s+sex$/i.test(lines[i])
    && !/^email appointment reminders/i.test(lines[i])
  ) {
    result.appointmentReminderType = lines[i];
    i += 1;
  }

  while (i < lines.length) {
    if (/^administrative\s+sex$/i.test(lines[i])) break;
    i += 1;
  }

  if (/^administrative\s+sex$/i.test(lines[i] || '')) {
    i += 1;
    while (i < lines.length && !lines[i]) i += 1;
    if (
      lines[i]
      && !STOP_LABELS.slice(1).some((l) => lines[i].toLowerCase() === l.toLowerCase())
    ) {
      result.administrativeSex = lines[i];
      i += 1;
    }
  }

  return result;
}

export function demographicsToClientPatch(parsed) {
  const p = parsed || {};
  const patch = {};
  if (p.fullName) patch.full_name = p.fullName;
  if (p.dateOfBirth) patch.date_of_birth = p.dateOfBirth;
  if (p.addressStreet) patch.address_street = p.addressStreet;
  if (p.addressCity) patch.address_city = p.addressCity;
  if (p.addressState) patch.address_state = p.addressState;
  if (p.addressZip) patch.address_zip = p.addressZip;
  if (p.timezone) patch.timezone = p.timezone;
  if (p.contactPhone) patch.contact_phone = p.contactPhone;
  if (p.email) patch.email = p.email;
  if (p.appointmentReminderType) patch.appointment_reminder_type = p.appointmentReminderType;
  if (p.administrativeSex) patch.gender = p.administrativeSex;
  if (p.textMessagesOk === true) patch.session_sms_opt_in = 1;
  if (p.textMessagesOk === false) patch.session_sms_opt_in = 0;
  return patch;
}
