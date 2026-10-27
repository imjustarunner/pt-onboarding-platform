import pool from '../config/database.js';

export function isGrasshopperVoicemail({ from, subject = '', bodyText = '' }) {
  const email = String(from?.email || from || '').trim().toLowerCase();
  return /^[^@\s]+@(?:[a-z0-9-]+\.)*grasshopper\.com$/.test(email) && /voice\s*mail/i.test(subject + '\n' + bodyText);
}
export function grasshopperCaller({ from, subject = '', bodyText = '' }) {
  if (!isGrasshopperVoicemail({ from, subject, bodyText })) return null;
  // Only caller fields, never an arbitrary number in a signature or transcript.
  const phone = '(?:\\+?1[ .-]?)?\\(?[2-9]\\d{2}\\)?[ .-]?\\d{3}[ .-]?\\d{4}';
  const patterns = [new RegExp('voicemail(?: message)? from[^\\n\\d+]*((' + phone + '))', 'ig'),
    new RegExp('^(?:from|caller(?: id| number)?|phone number)\\s*:\\s*[^\\n\\d+]*((' + phone + '))', 'igm')];
  const numbers = new Set();
  for (const pattern of patterns) for (const match of (subject + '\n' + bodyText).matchAll(pattern)) {
    const digits = match[1].replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11 && digits.startsWith('1')) numbers.add(digits.slice(-10));
  }
  return numbers.size === 1 ? [...numbers][0] : null;
}

export async function voicemailClientCandidates(agencyId, message, db = pool) {
  const phone = grasshopperCaller({ from: message.from, subject: message.subject, bodyText: message.body_text });
  if (!phone) return { phone: null, clients: [], guardians: [] };
  // Normalize stored US numbers without ever crossing the receiving agency.
  const matches = field => `REGEXP_REPLACE(COALESCE(${field},''),'[^0-9]','') IN (?,?)`;
  const params = [phone, '1' + phone];
  const [clients] = await db.execute(`SELECT DISTINCT c.id,c.full_name,c.initials FROM clients c WHERE c.agency_id=? AND (
    ${matches('c.contact_phone')}
    OR EXISTS (SELECT 1 FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=c.id AND (${matches('u.phone_number')} OR ${matches('u.personal_phone')} OR ${matches('u.work_phone')}))
    OR EXISTS (SELECT 1 FROM agency_contacts ac WHERE ac.agency_id=c.agency_id AND ac.client_id=c.id AND ac.is_active=1 AND ${matches('ac.phone')})) ORDER BY c.id`, [agencyId, ...params, ...params, ...params, ...params, ...params]);
  const [guardians] = await db.execute(`SELECT DISTINCT u.id FROM users u JOIN client_guardians cg ON cg.guardian_user_id=u.id JOIN clients c ON c.id=cg.client_id WHERE c.agency_id=? AND (${matches('u.phone_number')} OR ${matches('u.personal_phone')} OR ${matches('u.work_phone')})`, [agencyId, ...params, ...params, ...params]);
  return { phone, clients, guardians };
}
