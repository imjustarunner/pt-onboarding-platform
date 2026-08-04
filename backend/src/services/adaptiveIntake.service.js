import pool from '../config/database.js';
import * as ClientExchange from './clientExchange.service.js';
import {
  buildPublicFormBranding,
  requestBaseUrl
} from './publicFormBranding.service.js';
import { notifyNewProspectiveInquiry } from './clientNotifications.service.js';

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function resolveAgency(agencySlugOrId) {
  return ClientExchange.getPublicOfficeIntakeAgency(agencySlugOrId);
}

async function loadAgencyRow(agencySlugOrId) {
  const slug = String(agencySlugOrId || '').trim();
  if (!slug) return null;
  if (/^\d+$/.test(slug)) {
    const [rows] = await pool.execute(
      `SELECT id, name, slug, portal_url, organization_type, logo_url, color_palette, feature_flags, public_booking_settings
       FROM agencies WHERE id = ? AND is_active = 1 LIMIT 1`,
      [Number(slug)]
    );
    return rows[0] || null;
  }
  const [rows] = await pool.execute(
    `SELECT id, name, slug, portal_url, organization_type, logo_url, color_palette, feature_flags, public_booking_settings
     FROM agencies
     WHERE (slug = ? OR portal_url = ?) AND is_active = 1
     LIMIT 1`,
    [slug, slug]
  );
  return rows[0] || null;
}

async function loadPathwayTemplate(verticalKey) {
  try {
    const [rows] = await pool.execute(
      `SELECT vertical_key, name, description, fields_json
       FROM adaptive_intake_pathway_templates
       WHERE vertical_key = ?
       LIMIT 1`,
      [verticalKey]
    );
    if (!rows[0]) return null;
    return {
      verticalKey: rows[0].vertical_key,
      name: rows[0].name,
      description: rows[0].description,
      fields: parseJson(rows[0].fields_json, [])
    };
  } catch {
    return null;
  }
}

function verticalFromOrgType(organizationType) {
  const t = String(organizationType || 'agency').toLowerCase();
  if (t === 'life_coach') return 'life_coach';
  if (t === 'consultant') return 'consultant';
  if (t === 'tutoring' || t === 'learning') return 'tutoring';
  return 'clinical';
}

async function findFullIntakePublicKey(agencyId) {
  try {
    const [rows] = await pool.execute(
      `SELECT public_key, title, form_type
       FROM intake_links
       WHERE agency_id = ?
         AND is_active = 1
         AND (form_type IS NULL OR form_type IN ('intake', 'public_form', ''))
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [agencyId]
    );
    return rows[0]
      ? { publicKey: rows[0].public_key, title: rows[0].title, formType: rows[0].form_type }
      : null;
  } catch {
    return null;
  }
}

async function listProviderPreview(agencyId, { limit = 6 } = {}) {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.title, u.service_focus,
              u.provider_accepting_new_clients, u.profile_image_url
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE u.is_active = 1
         AND (u.role IN ('provider', 'counselor', 'therapist', 'coach', 'tutor', 'consultant', 'employee')
              OR ua.role IN ('provider', 'counselor', 'coach', 'tutor'))
         AND (u.provider_accepting_new_clients IS NULL OR u.provider_accepting_new_clients = 1)
       ORDER BY u.last_name ASC, u.first_name ASC
       LIMIT ${Math.min(Number(limit) || 6, 12)}`,
      [agencyId]
    );
    return rows.map((r) => ({
      id: r.id,
      displayName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      credentials: r.title || null,
      specialties: r.service_focus
        ? String(r.service_focus)
            .split(/[,;|]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 4)
        : [],
      photoUrl: r.profile_image_url || null,
      modality: null,
      nextAvailable: null
    }));
  } catch {
    return [];
  }
}

export async function getAdaptiveIntakeConfig(agencySlugOrId, req) {
  const agencyRow = await loadAgencyRow(agencySlugOrId);
  if (!agencyRow) return null;

  const vertical = verticalFromOrgType(agencyRow.organization_type);
  const [concernTemplate, practitionerTemplate, fullIntake, providers] = await Promise.all([
    loadPathwayTemplate(vertical === 'clinical' ? 'clinical' : vertical),
    vertical === 'clinical' ? null : loadPathwayTemplate(vertical),
    findFullIntakePublicKey(agencyRow.id),
    listProviderPreview(agencyRow.id)
  ]);

  let branding = null;
  try {
    branding = await buildPublicFormBranding({
      organization: agencyRow,
      agency: agencyRow,
      baseUrl: requestBaseUrl(req)
    });
  } catch {
    branding = null;
  }

  const concernOptions =
    vertical === 'clinical'
      ? concernTemplate?.fields || []
      : [
          { value: 'goals', label: 'Goals & growth' },
          { value: 'stress', label: 'Stress / overwhelm' },
          { value: 'career', label: 'Career / performance' },
          { value: 'relationships', label: 'Relationships' },
          { value: 'skills', label: 'Skill building' },
          { value: 'other', label: 'Other' }
        ];

  return {
    agency: {
      id: agencyRow.id,
      name: agencyRow.name,
      slug: agencyRow.slug || agencyRow.portal_url,
      organizationType: agencyRow.organization_type || 'agency'
    },
    branding,
    vertical,
    pathways: {
      quick: { enabled: true },
      full: {
        enabled: !!fullIntake?.publicKey,
        publicKey: fullIntake?.publicKey || null,
        title: fullIntake?.title || null,
        disabledReason: fullIntake?.publicKey
          ? null
          : 'A full intake packet has not been published yet. Use Quick Prospective or contact the organization.'
      }
    },
    concernOptions,
    practitionerFrame: practitionerTemplate,
    providerPreview: providers,
    copy: copyForVertical(vertical, agencyRow.name)
  };
}

function copyForVertical(vertical, agencyName) {
  const org = agencyName || 'our team';
  if (vertical === 'life_coach') {
    return {
      welcomeTitle: `Welcome! We’re glad you’re here.`,
      welcomeSubtitle: `Choose how you’d like to connect with ${org}. You can start light and add details later.`,
      quickTitle: 'Quick Interest Form',
      fullTitle: 'Full Coaching Intake'
    };
  }
  if (vertical === 'consultant') {
    return {
      welcomeTitle: `Welcome! We’re glad you’re here.`,
      welcomeSubtitle: `Tell us a little about your needs, or complete a fuller intake for ${org}.`,
      quickTitle: 'Quick Inquiry',
      fullTitle: 'Full Consulting Intake'
    };
  }
  if (vertical === 'tutoring') {
    return {
      welcomeTitle: `Welcome! We’re glad you’re here.`,
      welcomeSubtitle: `Start with a short interest form or a fuller tutoring intake for ${org}.`,
      quickTitle: 'Quick Interest Form',
      fullTitle: 'Full Tutoring Intake'
    };
  }
  return {
    welcomeTitle: `Welcome! We’re glad you’re here.`,
    welcomeSubtitle: `Choose the type of intake that works best for you with ${org}. You can always add more details later.`,
    quickTitle: 'Quick Prospective',
    fullTitle: 'In-Depth Intake Packet'
  };
}

export async function submitQuickProspective({ agencySlugOrId, payload = {}, req }) {
  const agencyRow = await loadAgencyRow(agencySlugOrId);
  if (!agencyRow) throw new Error('Organization not found');

  const vertical = verticalFromOrgType(agencyRow.organization_type);
  const whoFor = String(payload.whoFor || 'myself').trim();
  const respondent = payload.respondent || {};
  const clientInfo = payload.client || {};
  const concerns = Array.isArray(payload.concerns) ? payload.concerns : [];
  const preferences = payload.preferences || {};

  const clientFirst =
    String(clientInfo.firstName || respondent.firstName || payload.firstName || '').trim();
  const clientLast =
    String(clientInfo.lastName || respondent.lastName || payload.lastName || '').trim();

  const clientType =
    vertical === 'tutoring'
      ? 'learning'
      : vertical === 'life_coach' || vertical === 'consultant'
        ? 'basic_nonclinical'
        : whoFor === 'myself'
          ? 'clinical'
          : 'clinical';

  const { client } = await ClientExchange.createPublicOfficeIntakeClient({
    agencySlugOrId: agencyRow.id,
    payload: {
      firstName: clientFirst,
      lastName: clientLast,
      contactPhone: respondent.phone || payload.contactPhone || payload.phone,
      presentingConcern:
        payload.presentingConcern ||
        (concerns.length ? concerns.join(', ') : null) ||
        payload.notes ||
        null,
      preferredDays: preferences.preferredDays || payload.preferredDays,
      preferredTimeOfDay: preferences.preferredTimeOfDay || payload.preferredTimeOfDay,
      preferredModality: preferences.preferredModality || payload.preferredModality,
      preferredLocation: preferences.preferredLocation || payload.preferredLocation,
      insuranceOrPayment: preferences.insuranceOrPayment || payload.insuranceOrPayment,
      clientType
    }
  });

  const meta = {
    pathway: 'quick_prospective',
    vertical,
    whoFor,
    respondent: {
      firstName: respondent.firstName || null,
      lastName: respondent.lastName || null,
      email: respondent.email || payload.email || null,
      phone: respondent.phone || payload.contactPhone || payload.phone || null,
      preferredContactMethod: respondent.preferredContactMethod || preferences.preferredContactMethod || null,
      relationship: respondent.relationship || (whoFor === 'myself' ? 'self' : 'guardian')
    },
    concerns,
    notes: payload.notes || null,
    preferredProviderUserId: payload.preferredProviderUserId || preferences.preferredProviderUserId || null,
    source: 'ADAPTIVE_QUICK_PROSPECTIVE',
    conversionStatus: 'not_converted',
    linkedIntakePublicKey: null,
    linkedIntakeSubmissionId: null,
    submittedAt: new Date().toISOString()
  };

  try {
    await pool.execute(`UPDATE clients SET adaptive_intake_meta_json = ?, source = ? WHERE id = ?`, [
      JSON.stringify(meta),
      'ADAPTIVE_QUICK_PROSPECTIVE',
      client.id
    ]);
  } catch (err) {
    // Column may not exist until migration runs — still succeed with preferences already saved.
    if (!/Unknown column|adaptive_intake_meta/i.test(String(err?.message || ''))) {
      throw err;
    }
  }

  // Enrich preferences JSON with adaptive fields
  try {
    const [rows] = await pool.execute(`SELECT intake_preferences_json FROM clients WHERE id = ? LIMIT 1`, [
      client.id
    ]);
    const prefs = parseJson(rows[0]?.intake_preferences_json, {}) || {};
    const nextPrefs = {
      ...prefs,
      pathway: 'quick_prospective',
      whoFor,
      concerns,
      respondentEmail: meta.respondent.email,
      preferredProviderUserId: meta.preferredProviderUserId,
      vertical
    };
    await pool.execute(`UPDATE clients SET intake_preferences_json = ? WHERE id = ?`, [
      JSON.stringify(nextPrefs),
      client.id
    ]);
  } catch {
    /* non-fatal */
  }

  try {
    await notifyNewProspectiveInquiry({
      agencyId: agencyRow.id,
      clientId: client.id,
      clientName: client.full_name || `${clientFirst} ${clientLast}`.trim(),
      pathway: 'quick_prospective',
      vertical
    });
  } catch {
    /* non-fatal */
  }

  return {
    client,
    confirmation: {
      identifierCode: client.identifier_code,
      submittedAt: new Date().toISOString(),
      pathway: 'quick_prospective'
    },
    conversion: {
      available: true,
      hint: 'Staff can send a full intake link that pre-fills known information.'
    }
  };
}

export async function convertProspectiveToFullIntake({
  clientId,
  agencyId,
  intakePublicKey = null,
  actingUserId = null
}) {
  const id = Number(clientId);
  if (!id) throw new Error('clientId is required');

  const [rows] = await pool.execute(
    `SELECT id, agency_id, full_name, intake_preferences_json, adaptive_intake_meta_json, contact_phone
     FROM clients WHERE id = ? LIMIT 1`,
    [id]
  );
  const client = rows[0];
  if (!client) throw new Error('Client not found');
  if (agencyId && Number(client.agency_id) !== Number(agencyId)) {
    throw new Error('Client does not belong to this agency');
  }

  let publicKey = intakePublicKey;
  if (!publicKey) {
    const found = await findFullIntakePublicKey(client.agency_id);
    publicKey = found?.publicKey || null;
  }
  if (!publicKey) throw new Error('No active full intake link is available for conversion');

  const meta = parseJson(client.adaptive_intake_meta_json, {}) || {};
  const prefs = parseJson(client.intake_preferences_json, {}) || {};
  const prefill = {
    guardianFirstName: meta.respondent?.firstName || null,
    guardianLastName: meta.respondent?.lastName || null,
    guardianEmail: meta.respondent?.email || null,
    guardianPhone: meta.respondent?.phone || client.contact_phone || null,
    clientFullName: client.full_name || null,
    presentingConcern: prefs.presentingConcern || null,
    preferredModality: prefs.preferredModality || null,
    preferredTimeOfDay: prefs.preferredTimeOfDay || null,
    preferredDays: prefs.preferredDays || [],
    concerns: prefs.concerns || meta.concerns || []
  };

  const nextMeta = {
    ...meta,
    conversionStatus: 'conversion_link_issued',
    linkedIntakePublicKey: publicKey,
    conversionIssuedAt: new Date().toISOString(),
    conversionIssuedByUserId: actingUserId || null,
    prefill
  };

  try {
    await pool.execute(`UPDATE clients SET adaptive_intake_meta_json = ? WHERE id = ?`, [
      JSON.stringify(nextMeta),
      id
    ]);
  } catch (err) {
    if (!/Unknown column|adaptive_intake_meta/i.test(String(err?.message || ''))) throw err;
  }

  const token = Buffer.from(
    JSON.stringify({
      clientId: id,
      publicKey,
      issuedAt: Date.now()
    })
  ).toString('base64url');

  return {
    clientId: id,
    publicKey,
    intakeUrlPath: `/intake/${publicKey}?convert=${encodeURIComponent(token)}`,
    prefill,
    meta: nextMeta
  };
}

export async function listProspectiveAdaptiveClients({ agencyId, limit = 50 }) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.full_name, c.contact_phone, c.identifier_code, c.client_type, c.source,
            c.created_at, c.intake_preferences_json, c.adaptive_intake_meta_json, c.provider_id
     FROM clients c
     WHERE c.agency_id = ?
       AND c.provider_id IS NULL
       AND (
         c.source IN ('PUBLIC_OFFICE_INTAKE', 'ADAPTIVE_QUICK_PROSPECTIVE', 'PUBLIC_BOOKING_INQUIRY')
         OR c.adaptive_intake_meta_json IS NOT NULL
       )
     ORDER BY c.created_at DESC
     LIMIT ${Math.min(Number(limit) || 50, 100)}`,
    [agencyId]
  );
  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    contactPhone: r.contact_phone,
    identifierCode: r.identifier_code,
    clientType: r.client_type,
    source: r.source,
    createdAt: r.created_at,
    intakePreferences: parseJson(r.intake_preferences_json, null),
    adaptiveMeta: parseJson(r.adaptive_intake_meta_json, null),
    pathway: parseJson(r.adaptive_intake_meta_json, null)?.pathway || null
  }));
}

export { resolveAgency, listProviderPreview };
