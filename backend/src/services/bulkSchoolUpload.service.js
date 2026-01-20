import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pool from '../config/database.js';

const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const normalizeEmail = (v) => {
  const s = String(v || '').trim().toLowerCase();
  return s.includes('@') ? s : '';
};

const normalizeState = (v) => {
  const s = String(v || '').trim();
  if (!s) return '';
  // Prefer 2-letter state when it looks like one.
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return s;
};

const normalizePostalCode = (v) => {
  const s = String(v || '').trim();
  if (!s) return '';
  // Best-effort: keep 5 or 5-4 when present.
  const m = s.match(/\b\d{5}(?:-\d{4})?\b/);
  return m ? m[0] : s;
};

const looksLikePhone = (v) => {
  const s = String(v || '').trim();
  if (!s) return false;
  // Count digits; US phone numbers usually have 10 digits.
  const digits = (s.match(/\d/g) || []).length;
  if (digits < 10) return false;
  // Avoid mistaking long IDs for phones (very rough).
  if (digits > 15) return false;
  return true;
};

const parseAddressParts = (full) => {
  const s = String(full || '').trim();
  if (!s) return { street: '', city: '', state: '', postal: '' };

  // Handle multi-line forms by collapsing.
  const compact = s.replace(/\r?\n/g, ', ').replace(/\s+/g, ' ').trim();

  // "123 Main St, City, ST 12345"
  const m = compact.match(/^(.*?),\s*([^,]+?),\s*([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?\s*$/);
  if (m) {
    return {
      street: String(m[1] || '').trim(),
      city: String(m[2] || '').trim(),
      state: normalizeState(m[3] || ''),
      postal: normalizePostalCode(m[4] || '')
    };
  }

  return { street: s, city: '', state: '', postal: '' };
};

const extractEmails = (text) => {
  const s = String(text || '');
  const matches = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((m) => String(m).trim().toLowerCase()).filter(Boolean)));
};

const splitMulti = (text) => {
  const s = String(text || '').trim();
  if (!s) return [];
  // Split on newlines, semicolons, and common separators.
  const parts = s
    .split(/\r?\n|;|\|/g)
    .map((p) => String(p || '').trim())
    .filter(Boolean);

  // If the cell is one long comma-separated list, avoid over-splitting names like "Last, First".
  if (parts.length === 1) {
    const maybe = parts[0]
      .split(/\s{2,}|(?:\s+\/\s+)|(?:\s+&\s+)/g)
      .map((p) => String(p || '').trim())
      .filter(Boolean);
    return maybe.length ? maybe : parts;
  }
  return parts;
};

const parseAlsoSchools = (text) => {
  const s = String(text || '');
  const out = [];

  // (also Skyway) or (Also: Skyway, Other)
  const paren = s.match(/\(([^)]*)\)/g) || [];
  for (const p of paren) {
    const inner = p.replace(/^\(|\)$/g, '');
    const m = inner.match(/\balso\b\s*:?\s*(.+)$/i);
    if (!m) continue;
    const list = String(m[1] || '')
      .split(/,|\/|&|\band\b/gi)
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    for (const n of list) out.push(n);
  }

  // "also Skyway" without parentheses
  const alsoInline = s.match(/\balso\b\s*:?\s*([A-Za-z0-9 .'-]+)/i);
  if (alsoInline?.[1]) out.push(String(alsoInline[1]).trim());

  return Array.from(new Set(out)).filter(Boolean);
};

const stripAlsoParen = (text) => {
  const s = String(text || '');
  // Remove parentheticals mentioning "also ..."
  return s.replace(/\([^)]*\balso\b[^)]*\)/gi, '').trim();
};

function safeJsonParseLoose(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const jsonText = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(jsonText);
}

async function parseContactWithGemini({ text, hintSchoolName = '' }) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) return null;

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = [
    `You clean and structure messy school contact strings for a directory import.`,
    `Return ONLY valid JSON with this shape:`,
    `{"fullName": string|null, "roleTitle": string|null, "notes": string|null, "emails": string[], "alsoSchools": string[]}`,
    ``,
    `Rules:`,
    `- "emails" must contain any emails present in the text (lowercase).`,
    `- If the text says "(also <School>)" then alsoSchools should include that school name.`,
    `- Prefer roleTitle like "Social Worker" (strip district codes like "D12" into notes).`,
    `- If fullName is unknown, set it to null.`,
    ``,
    `Context school (if relevant): ${hintSchoolName || ''}`,
    `Input:`,
    String(text || '')
  ].join('\n');

  const result = await model.generateContent(prompt);
  const raw = result?.response?.text?.() || '';
  const parsed = safeJsonParseLoose(raw);
  if (!parsed || typeof parsed !== 'object') return null;

  const emails = Array.isArray(parsed.emails) ? parsed.emails.map(normalizeEmail).filter(Boolean) : [];
  const alsoSchools = Array.isArray(parsed.alsoSchools)
    ? parsed.alsoSchools.map((v) => String(v || '').trim()).filter(Boolean)
    : [];

  return {
    fullName: parsed.fullName ? String(parsed.fullName).trim() : null,
    roleTitle: parsed.roleTitle ? String(parsed.roleTitle).trim() : null,
    notes: parsed.notes ? String(parsed.notes).trim() : null,
    emails: Array.from(new Set(emails)),
    alsoSchools: Array.from(new Set(alsoSchools))
  };
}

function heuristicParseContact({ text, emailHint = '' }) {
  const raw = String(text || '').trim();
  if (!raw && !emailHint) return null;

  const alsoSchools = parseAlsoSchools(raw);
  const stripped = stripAlsoParen(raw);

  const emails = Array.from(new Set([normalizeEmail(emailHint), ...extractEmails(raw)].filter(Boolean)));

  // Remove emails from the text for name/role parsing.
  let withoutEmails = stripped;
  for (const e of emails) {
    withoutEmails = withoutEmails.replace(new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  }
  withoutEmails = withoutEmails.replace(/\s+/g, ' ').trim();

  // Try common pattern: "Name, D12 Social Worker"
  const commaParts = withoutEmails.split(',').map((p) => p.trim()).filter(Boolean);
  const fullName = commaParts[0] ? commaParts[0].trim() : null;
  const remainder = commaParts.slice(1).join(', ').trim();

  let roleTitle = null;
  let notes = null;

  if (remainder) {
    // If starts with a short code like D12, keep as notes and treat the rest as role.
    const m = remainder.match(/^([A-Za-z]{0,2}\d{1,3})\s+(.*)$/);
    if (m) {
      notes = String(m[1]).trim();
      roleTitle = String(m[2]).trim();
    } else {
      // Try dash separation: "Name - Role"
      const dashParts = remainder.split(/\s*[-–—]\s*/g).map((p) => p.trim()).filter(Boolean);
      roleTitle = dashParts[0] ? dashParts[0] : remainder;
    }
  } else if (commaParts.length >= 2) {
    roleTitle = commaParts.slice(1).join(', ');
  }

  const cleanName = fullName && fullName.length <= 255 ? fullName : (fullName ? fullName.slice(0, 255) : null);
  const cleanRole = roleTitle ? roleTitle.replace(/\s+/g, ' ').trim() : null;

  return {
    fullName: cleanName || null,
    email: emails[0] || '',
    roleTitle: cleanRole || null,
    notes: notes ? String(notes).trim() : null,
    rawSourceText: raw || null,
    alsoSchools
  };
}

async function parseContactSmart({ text, emailHint = '', hintSchoolName = '' }) {
  const heuristic = heuristicParseContact({ text, emailHint });
  const raw = String(text || '').trim();

  // If it's clean enough, keep heuristics (avoid Gemini cost).
  const hasAlso = /\balso\b/i.test(raw);
  const hasComma = raw.includes(',');
  const looksMessy = hasAlso || (hasComma && raw.length > 25);

  if (!looksMessy) return heuristic;

  const gem = await parseContactWithGemini({ text: raw, hintSchoolName });
  if (!gem) return heuristic;

  return {
    fullName: gem.fullName || heuristic?.fullName || null,
    email: gem.emails?.[0] || normalizeEmail(emailHint) || heuristic?.email || '',
    roleTitle: gem.roleTitle || heuristic?.roleTitle || null,
    notes: gem.notes || heuristic?.notes || null,
    rawSourceText: raw || null,
    alsoSchools: (gem.alsoSchools && gem.alsoSchools.length) ? gem.alsoSchools : (heuristic?.alsoSchools || [])
  };
}

async function findOrCreateSchool(connection, { agencyId, schoolName, districtName }) {
  const name = String(schoolName || '').trim();
  if (!name) throw new Error('School / Location is required');
  const slug = slugify(name);

  const [existing] = await connection.execute(
    `SELECT id FROM agencies WHERE organization_type = 'school' AND (name = ? OR slug = ?) LIMIT 1`,
    [name, slug]
  );
  let schoolId = existing[0]?.id || null;
  let created = false;

  if (!schoolId) {
    const [result] = await connection.execute(
      `INSERT INTO agencies (name, slug, logo_url, color_palette, terminology_settings, is_active, organization_type)
       VALUES (?, ?, NULL, NULL, NULL, TRUE, 'school')`,
      [name, slug || crypto.randomBytes(8).toString('hex')]
    );
    schoolId = result.insertId;
    created = true;
  }

  // Link to parent agency via organization_affiliations
  await connection.execute(
    `INSERT INTO organization_affiliations (agency_id, organization_id, is_active)
     VALUES (?, ?, TRUE)
     ON DUPLICATE KEY UPDATE is_active = TRUE`,
    [agencyId, schoolId]
  );

  // Ensure school_profiles exists and set district if given.
  await connection.execute(
    `INSERT INTO school_profiles (school_organization_id, district_name)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE district_name = COALESCE(VALUES(district_name), district_name)`,
    [schoolId, districtName && String(districtName).trim() ? String(districtName).trim() : null]
  );

  return { schoolId, created };
}

async function upsertSchoolProfile(connection, { schoolId, updates }) {
  const {
    districtName = null,
    schoolNumber = null,
    itscoEmail = null,
    schoolDaysTimes = null,
    schoolAddress = null,
    locationLabel = null,
    primaryContactName = null,
    primaryContactEmail = null,
    primaryContactRole = null,
    secondaryContactText = null
  } = updates || {};

  // Prefer writing secondary_contact_text when the column exists (migration 207).
  // Fall back gracefully if the column isn't present yet.
  try {
    await connection.execute(
      `INSERT INTO school_profiles
        (school_organization_id, district_name, school_number, itsco_email, school_days_times, school_address, location_label,
         primary_contact_name, primary_contact_email, primary_contact_role, secondary_contact_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         district_name = COALESCE(VALUES(district_name), district_name),
         school_number = COALESCE(VALUES(school_number), school_number),
         itsco_email = COALESCE(VALUES(itsco_email), itsco_email),
         school_days_times = COALESCE(VALUES(school_days_times), school_days_times),
         school_address = COALESCE(VALUES(school_address), school_address),
         location_label = COALESCE(VALUES(location_label), location_label),
         primary_contact_name = COALESCE(VALUES(primary_contact_name), primary_contact_name),
         primary_contact_email = COALESCE(VALUES(primary_contact_email), primary_contact_email),
         primary_contact_role = COALESCE(VALUES(primary_contact_role), primary_contact_role),
         secondary_contact_text = COALESCE(VALUES(secondary_contact_text), secondary_contact_text)`,
      [
        schoolId,
        districtName && String(districtName).trim() ? String(districtName).trim() : null,
        schoolNumber && String(schoolNumber).trim() ? String(schoolNumber).trim() : null,
        itscoEmail && normalizeEmail(itscoEmail) ? normalizeEmail(itscoEmail) : (itscoEmail && String(itscoEmail).trim() ? String(itscoEmail).trim() : null),
        schoolDaysTimes && String(schoolDaysTimes).trim() ? String(schoolDaysTimes).trim() : null,
        schoolAddress && String(schoolAddress).trim() ? String(schoolAddress).trim() : null,
        locationLabel && String(locationLabel).trim() ? String(locationLabel).trim() : null,
        primaryContactName && String(primaryContactName).trim() ? String(primaryContactName).trim() : null,
        primaryContactEmail && normalizeEmail(primaryContactEmail) ? normalizeEmail(primaryContactEmail) : null,
        primaryContactRole && String(primaryContactRole).trim() ? String(primaryContactRole).trim() : null,
        secondaryContactText && String(secondaryContactText).trim() ? String(secondaryContactText).trim() : null
      ]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    await connection.execute(
      `INSERT INTO school_profiles
        (school_organization_id, district_name, school_number, itsco_email, school_days_times, school_address, location_label,
         primary_contact_name, primary_contact_email, primary_contact_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         district_name = COALESCE(VALUES(district_name), district_name),
         school_number = COALESCE(VALUES(school_number), school_number),
         itsco_email = COALESCE(VALUES(itsco_email), itsco_email),
         school_days_times = COALESCE(VALUES(school_days_times), school_days_times),
         school_address = COALESCE(VALUES(school_address), school_address),
         location_label = COALESCE(VALUES(location_label), location_label),
         primary_contact_name = COALESCE(VALUES(primary_contact_name), primary_contact_name),
         primary_contact_email = COALESCE(VALUES(primary_contact_email), primary_contact_email),
         primary_contact_role = COALESCE(VALUES(primary_contact_role), primary_contact_role)`,
      [
        schoolId,
        districtName && String(districtName).trim() ? String(districtName).trim() : null,
        schoolNumber && String(schoolNumber).trim() ? String(schoolNumber).trim() : null,
        itscoEmail && normalizeEmail(itscoEmail) ? normalizeEmail(itscoEmail) : (itscoEmail && String(itscoEmail).trim() ? String(itscoEmail).trim() : null),
        schoolDaysTimes && String(schoolDaysTimes).trim() ? String(schoolDaysTimes).trim() : null,
        schoolAddress && String(schoolAddress).trim() ? String(schoolAddress).trim() : null,
        locationLabel && String(locationLabel).trim() ? String(locationLabel).trim() : null,
        primaryContactName && String(primaryContactName).trim() ? String(primaryContactName).trim() : null,
        primaryContactEmail && normalizeEmail(primaryContactEmail) ? normalizeEmail(primaryContactEmail) : null,
        primaryContactRole && String(primaryContactRole).trim() ? String(primaryContactRole).trim() : null
      ]
    );
  }
}

async function setPrimaryFlagForSchool(connection, schoolId, email) {
  await connection.execute(`UPDATE school_contacts SET is_primary = FALSE WHERE school_organization_id = ?`, [schoolId]);
  if (!email) return;
  await connection.execute(
    `UPDATE school_contacts
     SET is_primary = TRUE
     WHERE school_organization_id = ? AND LOWER(email) = LOWER(?)`,
    [schoolId, email]
  );
}

async function upsertSchoolContact(connection, schoolId, contact, { isPrimary = false } = {}) {
  const fullName = contact?.fullName ? String(contact.fullName).trim() : null;
  const email = contact?.email ? normalizeEmail(contact.email) : '';
  const roleTitle = contact?.roleTitle ? String(contact.roleTitle).trim() : null;
  const notes = contact?.notes ? String(contact.notes).trim() : null;
  const rawSourceText = contact?.rawSourceText ? String(contact.rawSourceText).trim() : null;

  if (email) {
    await connection.execute(
      `INSERT INTO school_contacts
        (school_organization_id, full_name, email, role_title, notes, raw_source_text, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         full_name = COALESCE(VALUES(full_name), full_name),
         role_title = COALESCE(VALUES(role_title), role_title),
         notes = COALESCE(VALUES(notes), notes),
         raw_source_text = COALESCE(VALUES(raw_source_text), raw_source_text),
         is_primary = (is_primary OR VALUES(is_primary)),
         updated_at = CURRENT_TIMESTAMP`,
      [schoolId, fullName, email, roleTitle, notes, rawSourceText, isPrimary ? 1 : 0]
    );
    return;
  }

  // No email -> insert as-is (best effort; not de-duped).
  if (!fullName && !roleTitle && !rawSourceText) return;
  await connection.execute(
    `INSERT INTO school_contacts
      (school_organization_id, full_name, email, role_title, notes, raw_source_text, is_primary)
     VALUES (?, ?, NULL, ?, ?, ?, ?)`,
    [schoolId, fullName, roleTitle, notes, rawSourceText, isPrimary ? 1 : 0]
  );
}

async function parseAdditionalContacts({ cellText, hintSchoolName }) {
  const raw = String(cellText || '').trim();
  if (!raw) return [];

  // Special-case: comma-separated triples like:
  // "Joyce Archuleta, joyce@dpsk12.org, Counselor, Other Name, other@dpsk12.org, Principal"
  // This is common in spreadsheets and should create multiple contacts.
  const hasEmails = extractEmails(raw).length > 0;
  const looksLikeCommaTriples = hasEmails && raw.includes(',') && !raw.includes('\n') && !raw.includes(';') && !raw.includes('|');
  if (looksLikeCommaTriples) {
    const tokens = raw.split(',').map((t) => String(t || '').trim()).filter(Boolean);
    const out = [];

    let nameBuffer = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const emails = extractEmails(t);
      if (emails.length) {
        const email = emails[0];
        const name = (nameBuffer.join(' ').trim() || null);
        // Role is next token if present and not an email token.
        const next = tokens[i + 1] ? tokens[i + 1] : '';
        const nextHasEmail = extractEmails(next).length > 0;
        const role = (!nextHasEmail && next) ? next : null;
        if (role) i += 1; // consume role token

        out.push({
          fullName: name,
          email,
          roleTitle: role,
          notes: null,
          rawSourceText: raw
        });
        nameBuffer = [];
        continue;
      }
      nameBuffer.push(t);
    }

    // If we parsed at least one contact, return them.
    if (out.length) return out;
  }

  const parts = splitMulti(raw);
  const out = [];
  for (const p of parts) {
    const emails = extractEmails(p);
    if (emails.length > 1) {
      // If multiple emails in a single chunk, treat each as separate contact with same text.
      for (const e of emails) {
        out.push(await parseContactSmart({ text: p, emailHint: e, hintSchoolName }));
      }
      continue;
    }
    out.push(await parseContactSmart({ text: p, emailHint: emails[0] || '', hintSchoolName }));
  }
  return out.filter(Boolean);
}

export async function processBulkSchoolUpload({ agencyId, userId, fileName, rows }) {
  const connection = await pool.getConnection();
  let jobId = null;
  try {
    const [jobResult] = await connection.execute(
      `INSERT INTO bulk_import_jobs (agency_id, uploaded_by_user_id, file_name, job_type, started_at, total_rows)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [agencyId, userId, fileName, 'bulk_school_upload', rows.length]
    );
    jobId = jobResult.insertId;

    let successRows = 0;
    let failedRows = 0;
    const createdSchools = new Map(); // name -> id

    for (const row of rows) {
      await connection.beginTransaction();
      try {
        const schoolName = String(row.schoolLocation || '').trim();
        const districtName = String(row.district || '').trim() || null;

        const { schoolId, created } = await findOrCreateSchool(connection, {
          agencyId,
          schoolName,
          districtName
        });
        if (created && schoolName && !createdSchools.has(schoolName)) {
          createdSchools.set(schoolName, schoolId);
        }

        // Update core organization fields used across the app UI.
        // (School address + school phone are stored on agencies, not only in school_profiles.)
        // Overwrite when the spreadsheet provides a non-empty value.
        // Your spreadsheet sometimes puts the school's phone in the "School Number" column.
        // Treat it as phone when it looks like a phone number.
        const schoolPhoneFromColumn = row.schoolPhone ? String(row.schoolPhone).trim() : '';
        const schoolNumberRaw = row.schoolNumber ? String(row.schoolNumber).trim() : '';
        const inferredPhone = (!schoolPhoneFromColumn && looksLikePhone(schoolNumberRaw)) ? schoolNumberRaw : '';
        const schoolPhone = schoolPhoneFromColumn || inferredPhone;
        const schoolAddress = row.schoolAddress ? String(row.schoolAddress).trim() : '';
        const schoolAddress2 = row.schoolAddress2 ? String(row.schoolAddress2).trim() : '';
        const schoolCity = row.schoolCity ? String(row.schoolCity).trim() : '';
        const schoolState = normalizeState(row.schoolState || '');
        const schoolPostalCode = normalizePostalCode(row.schoolPostalCode || '');

        // Prefer split components when present; otherwise try to parse the single string.
        const parsed = parseAddressParts(schoolAddress);
        const streetFinal =
          (schoolAddress ? schoolAddress : '') +
          (schoolAddress2 ? ` ${schoolAddress2}` : '');
        const cityFinal = schoolCity || parsed.city || '';
        const stateFinal = schoolState || parsed.state || '';
        const postalFinal = schoolPostalCode || parsed.postal || '';

        await connection.execute(
          `UPDATE agencies
           SET
             phone_number = CASE WHEN ? IS NOT NULL AND ? <> '' THEN ? ELSE phone_number END,
             street_address = CASE WHEN ? IS NOT NULL AND ? <> '' THEN ? ELSE street_address END,
             city = CASE WHEN ? IS NOT NULL AND ? <> '' THEN ? ELSE city END,
             state = CASE WHEN ? IS NOT NULL AND ? <> '' THEN ? ELSE state END,
             postal_code = CASE WHEN ? IS NOT NULL AND ? <> '' THEN ? ELSE postal_code END
           WHERE id = ?`,
          [
            schoolPhone || null,
            schoolPhone || null,
            schoolPhone || null,
            streetFinal || null,
            streetFinal || null,
            streetFinal || null,
            cityFinal || null,
            cityFinal || null,
            cityFinal || null,
            stateFinal || null,
            stateFinal || null,
            stateFinal || null,
            postalFinal || null,
            postalFinal || null,
            postalFinal || null,
            schoolId
          ]
        );

        // Primary contact:
        // - New format: separate name/title/email columns (no Gemini needed).
        // - Legacy format: messy string + separate email column (Gemini fallback).
        const primaryEmailHint = normalizeEmail(row.primaryContactEmail || row.schoolContactEmail || '');
        const primaryName = String(row.primaryContactName || '').trim() || String(row.primarySchoolContact || '').trim();
        const primaryRole = String(row.primaryContactTitle || '').trim();
        const hasStructuredPrimary = !!(primaryName || primaryRole || primaryEmailHint);

        const primaryParsed = hasStructuredPrimary
          ? {
              fullName: primaryName || null,
              email: primaryEmailHint || '',
              roleTitle: primaryRole || null,
              notes: null,
              rawSourceText: null,
              alsoSchools: []
            }
          : await parseContactSmart({
              text: String(row.primarySchoolContact || '').trim(),
              emailHint: primaryEmailHint,
              hintSchoolName: schoolName
            });

        // Update school profile fields
        // Only store a "school_number" when it doesn't look like a phone number.
        const schoolNumberForProfile = looksLikePhone(schoolNumberRaw) ? null : (schoolNumberRaw || null);

        await upsertSchoolProfile(connection, {
          schoolId,
          updates: {
            districtName,
            schoolNumber: schoolNumberForProfile,
            itscoEmail: row.itscoEmail || null,
            schoolDaysTimes: row.schoolDaysTimes || null,
            // Keep a copy in school_profiles for directory/export use,
            // even though the canonical UI field is agencies.street_address.
            schoolAddress: row.schoolAddress || null,
            locationLabel: null,
            primaryContactName: primaryParsed?.fullName || primaryName || null,
            primaryContactEmail: primaryParsed?.email || primaryEmailHint || null,
            primaryContactRole: primaryParsed?.roleTitle || primaryRole || null,
            secondaryContactText: row.secondaryContactText || row.secondaryContact || null
          }
        });

        // Ensure primary contact is recorded in school_contacts (and is the only primary).
        const primaryEmailFinal = primaryParsed?.email || primaryEmailHint || '';
        await setPrimaryFlagForSchool(connection, schoolId, primaryEmailFinal);
        if (primaryParsed) {
          await upsertSchoolContact(connection, schoolId, primaryParsed, { isPrimary: true });
        } else if (row.primarySchoolContact || primaryEmailFinal) {
          await upsertSchoolContact(
            connection,
            schoolId,
            {
              fullName: row.primarySchoolContact ? String(row.primarySchoolContact).trim() : null,
              email: primaryEmailFinal || '',
              roleTitle: null,
              notes: null,
              rawSourceText: row.primarySchoolContact ? String(row.primarySchoolContact).trim() : null
            },
            { isPrimary: true }
          );
        }

        // Also-schools: attach the same primary contact to other schools mentioned.
        const alsoSchools = Array.isArray(primaryParsed?.alsoSchools) ? primaryParsed.alsoSchools : [];
        for (const otherSchoolName of alsoSchools) {
          const other = await findOrCreateSchool(connection, {
            agencyId,
            schoolName: otherSchoolName,
            districtName: null
          });
          if (other?.created && otherSchoolName && !createdSchools.has(otherSchoolName)) {
            createdSchools.set(otherSchoolName, other.schoolId);
          }
          if (primaryEmailFinal || primaryParsed?.fullName) {
            await upsertSchoolContact(connection, other.schoolId, primaryParsed || { email: primaryEmailFinal }, { isPrimary: false });
          }
        }

        // Additional contacts
        const additional = await parseAdditionalContacts({
          cellText: row.schoolContactsEmailsAndRole || '',
          hintSchoolName: schoolName
        });
        let additionalInserted = 0;
        for (const c of additional) {
          if (!c) continue;
          await upsertSchoolContact(connection, schoolId, c, { isPrimary: false });
          additionalInserted += 1;

          // If additional contact also references other schools, mirror it there too.
          const also = Array.isArray(c.alsoSchools) ? c.alsoSchools : [];
          for (const otherSchoolName of also) {
            const other = await findOrCreateSchool(connection, {
              agencyId,
              schoolName: otherSchoolName,
              districtName: null
            });
            if (other?.created && otherSchoolName && !createdSchools.has(otherSchoolName)) {
              createdSchools.set(otherSchoolName, other.schoolId);
            }
            await upsertSchoolContact(connection, other.schoolId, c, { isPrimary: false });
          }
        }

        await connection.execute(
          `INSERT INTO bulk_import_job_rows (job_id, \`row_number\`, \`status\`, message, entity_ids)
           VALUES (?, ?, 'success', ?, ?)`,
          [
            jobId,
            row.rowNumber,
            `Upserted school "${schoolName}" (${additionalInserted} additional contact(s))`,
            JSON.stringify({ schoolId, additionalContacts: additionalInserted })
          ]
        );

        await connection.commit();
        successRows += 1;
      } catch (e) {
        await connection.rollback();
        failedRows += 1;
        const msg = String(e?.message || e || 'Row failed');
        await connection.execute(
          `INSERT INTO bulk_import_job_rows (job_id, \`row_number\`, \`status\`, message, entity_ids)
           VALUES (?, ?, 'failed', ?, NULL)
           ON DUPLICATE KEY UPDATE \`status\` = 'failed', message = VALUES(message)`,
          [jobId, row.rowNumber, msg.slice(0, 5000)]
        );
      }
    }

    await connection.execute(
      `UPDATE bulk_import_jobs
       SET finished_at = CURRENT_TIMESTAMP,
           success_rows = ?,
           failed_rows = ?,
           meta_json = ?
       WHERE id = ?`,
      [
        successRows,
        failedRows,
        JSON.stringify({ createdSchools: Array.from(createdSchools.entries()).map(([name, id]) => ({ name, id })) }),
        jobId
      ]
    );

    return {
      jobId,
      totalRows: rows.length,
      successRows,
      failedRows,
      createdSchools: Array.from(createdSchools.entries()).map(([name, id]) => ({ name, id }))
    };
  } finally {
    connection.release();
  }
}

