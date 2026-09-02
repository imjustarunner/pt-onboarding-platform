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
  const glued = s.match(/^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})Age:/i);
  if (glued) return parseDateLoose(glued[1]);
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

function looksLikePhone(line) {
  return /^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(String(line || '').trim());
}

function looksLikeEmail(line) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(String(line || '').trim());
}

function normalizeLabel(line) {
  return String(line || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[:\s]+$/, '');
}

/** TherapyNotes-style label lines in pasted demographics exports. */
const LABEL_ALIASES = {
  'legal name': 'fullName',
  'date of birth': 'dateOfBirth',
  address: 'address',
  'time zone': 'timezone',
  timezone: 'timezone',
  'mobile phone': 'mobilePhone',
  phone: 'mobilePhone',
  email: 'email',
  'appt reminders': 'appointmentReminderType',
  'appointment reminders': 'appointmentReminderType',
  'appointment reminder type': 'appointmentReminderType',
  'administrative sex': 'administrativeSex'
};

const STOP_AFTER = new Set([
  'gender identity',
  'sexual orientation',
  'race',
  'ethnicity',
  'languages',
  'smoking status',
  'marital status',
  'employment',
  'religious affiliation',
  'hipaa',
  'pcp release'
]);

function labelKeyForLine(line) {
  const norm = normalizeLabel(line);
  if (LABEL_ALIASES[norm]) return LABEL_ALIASES[norm];
  if (norm.startsWith('email appointment reminders')) return null;
  return null;
}

function isStopLabel(line) {
  const norm = normalizeLabel(line);
  return STOP_AFTER.has(norm);
}

function sanitizeAdministrativeSex(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  const norm = normalizeLabel(v);
  if (
    STOP_AFTER.has(norm)
    || norm === 'administrative sex'
    || norm === 'sex'
    || norm === 'gender'
  ) {
    return null;
  }
  return v;
}

function collectBlock(lines, startIndex) {
  const values = [];
  let i = startIndex;
  while (i < lines.length) {
    const line = String(lines[i] || '').trim();
    if (!line) {
      if (values.length) break;
      i += 1;
      continue;
    }
    if (labelKeyForLine(line) || isStopLabel(line)) break;
    if (/^email appointment reminders are recommended/i.test(line)) break;
    values.push(line);
    i += 1;
    if (values.length >= 4) break;
  }
  return { values, nextIndex: i };
}

/**
 * Parse Note Aid demographics paste into structured fields.
 * Handles labeled TherapyNotes-style exports (Legal Name / Date of Birth / Address / …).
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

  const lines = raw.split('\n').map((l) => String(l || '').trim());
  const result = { ...empty };
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i += 1;
      continue;
    }

    const field = labelKeyForLine(line);
    if (!field) {
      // Unlabeled paste: first non-empty line may be name
      if (!result.fullName && !looksLikePhone(line) && !looksLikeEmail(line) && !parseDateLoose(line)) {
        result.fullName = line;
      }
      i += 1;
      continue;
    }

    i += 1;
    while (i < lines.length && !lines[i]) i += 1;
    if (i >= lines.length) break;

    if (field === 'fullName') {
      // Never treat the next label (e.g. "Date of Birth") as the legal name value.
      if (labelKeyForLine(lines[i]) || isStopLabel(lines[i])) {
        continue;
      }
      result.fullName = lines[i];
      i += 1;
      continue;
    }

    if (field === 'dateOfBirth') {
      if (labelKeyForLine(lines[i]) || isStopLabel(lines[i])) {
        continue;
      }
      result.dateOfBirth = parseDateLoose(lines[i]);
      i += 1;
      while (i < lines.length && /^age\s*:/i.test(lines[i])) i += 1;
      continue;
    }

    if (field === 'address') {
      const { values, nextIndex } = collectBlock(lines, i);
      const addr = parseAddressBlock(values);
      result.addressStreet = addr.street;
      result.addressCity = addr.city;
      result.addressState = addr.state;
      result.addressZip = addr.zip;
      i = nextIndex;
      continue;
    }

    if (field === 'timezone') {
      result.timezone = lines[i];
      i += 1;
      continue;
    }

    if (field === 'mobilePhone') {
      if (looksLikePhone(lines[i])) {
        result.contactPhone = lines[i].match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] || lines[i];
        i += 1;
      }
      while (i < lines.length && /text messages?\s*ok/i.test(lines[i])) {
        result.textMessagesOk = true;
        i += 1;
      }
      if (result.textMessagesOk == null && result.contactPhone) result.textMessagesOk = false;
      continue;
    }

    if (field === 'email') {
      if (looksLikeEmail(lines[i])) {
        result.email = lines[i];
        i += 1;
      }
      continue;
    }

    if (field === 'appointmentReminderType') {
      result.appointmentReminderType = lines[i];
      i += 1;
      continue;
    }

    if (field === 'administrativeSex') {
      result.administrativeSex = sanitizeAdministrativeSex(lines[i]);
      i += 1;
      continue;
    }
  }

  // Fallback: scan for phone/email if labels were missing
  if (!result.contactPhone) {
    for (const line of lines) {
      if (looksLikePhone(line)) {
        result.contactPhone = line.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] || line;
        break;
      }
    }
  }
  if (!result.email) {
    for (const line of lines) {
      if (looksLikeEmail(line)) {
        result.email = line;
        break;
      }
    }
  }
  if (!result.dateOfBirth) {
    for (const line of lines) {
      const d = parseDateLoose(line);
      if (d) {
        result.dateOfBirth = d;
        break;
      }
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
  if (p.administrativeSex) {
    const gender = sanitizeAdministrativeSex(p.administrativeSex);
    if (gender) patch.gender = gender;
  }
  if (p.textMessagesOk === true) patch.session_sms_opt_in = 1;
  if (p.textMessagesOk === false) patch.session_sms_opt_in = 0;
  return patch;
}

/** True when the paste/review payload has chart-worthy demographics (not labels-only). */
export function demographicsImportHasContent(parsed) {
  const p = parsed || {};
  return !!(
    p.dateOfBirth
    || p.contactPhone
    || p.email
    || p.addressStreet
    || p.addressCity
    || p.addressZip
    || (p.fullName && !/^(date of birth|address|phone|email|legal name)$/i.test(String(p.fullName).trim()))
  );
}

export function clientHasDemographicsOnFile(client) {
  if (!client) return false;
  const enc = client.demographics_phi_enc ?? client.demographicsPhiEnc;
  if (enc && enc !== false && enc !== 'false' && enc !== 'null') return true;
  const hasDob = !!(client.date_of_birth || client.dateOfBirth);
  const hasContact = !!(
    client.contact_phone
    || client.contactPhone
    || client.email
    || client.address_street
    || client.addressStreet
  );
  return hasDob && hasContact;
}
