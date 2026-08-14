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

const INTAKE_SERVICE_TYPES = new Set(['counseling', 'tutoring', 'coaching', 'consulting']);

function defaultDisplayNameForServiceType(serviceType) {
  const st = String(serviceType || '').toLowerCase();
  if (st === 'counseling') return 'Counseling';
  if (st === 'tutoring') return 'Tutoring';
  if (st === 'coaching') return 'Life Coaching';
  if (st === 'consulting') return 'Consulting';
  return st ? st.charAt(0).toUpperCase() + st.slice(1) : 'Services';
}

function defaultIntroBlurbForServiceType(serviceType) {
  const st = String(serviceType || '').toLowerCase();
  if (st === 'counseling') {
    return 'Start an intake for counseling and behavioral health services.';
  }
  if (st === 'tutoring') {
    return 'Start an intake for tutoring and academic support.';
  }
  if (st === 'coaching') {
    return 'Start an intake for coaching services.';
  }
  if (st === 'consulting') {
    return 'Start an intake for consulting services.';
  }
  return 'Start your intake.';
}

async function listIntakeServices(agencyRow) {
  try {
    const [rows] = await pool.execute(
      `SELECT service_type, display_name, intro_blurb, sort_order
       FROM agency_public_service_types
       WHERE agency_id = ? AND is_enabled = 1
       ORDER BY sort_order ASC, service_type ASC`,
      [Number(agencyRow.id)]
    );
    const mapped = (rows || [])
      .filter((r) => INTAKE_SERVICE_TYPES.has(String(r.service_type || '').toLowerCase()))
      .map((r) => ({
        serviceType: String(r.service_type || '').toLowerCase(),
        displayName: r.display_name || defaultDisplayNameForServiceType(r.service_type),
        introBlurb: r.intro_blurb || defaultIntroBlurbForServiceType(r.service_type),
        sortOrder: Number(r.sort_order) || 0
      }));
    if (mapped.length) return mapped;
  } catch {
    /* table may not exist in older envs */
  }

  const orgType = String(agencyRow.organization_type || 'agency').toLowerCase();
  if (orgType === 'tutoring' || orgType === 'learning') {
    return [
      {
        serviceType: 'tutoring',
        displayName: 'Tutoring',
        introBlurb: defaultIntroBlurbForServiceType('tutoring'),
        sortOrder: 0
      }
    ];
  }
  if (orgType === 'life_coach') {
    return [
      {
        serviceType: 'coaching',
        displayName: 'Life Coaching',
        introBlurb: defaultIntroBlurbForServiceType('coaching'),
        sortOrder: 0
      }
    ];
  }
  if (orgType === 'consultant') {
    return [
      {
        serviceType: 'consulting',
        displayName: 'Consulting',
        introBlurb: defaultIntroBlurbForServiceType('consulting'),
        sortOrder: 0
      }
    ];
  }
  return [
    {
      serviceType: 'counseling',
      displayName: 'Counseling',
      introBlurb: defaultIntroBlurbForServiceType('counseling'),
      sortOrder: 0
    }
  ];
}

function verticalFromServiceType(serviceType, organizationType) {
  const st = String(serviceType || '').toLowerCase();
  if (st === 'counseling') return 'clinical';
  if (st === 'tutoring') return 'tutoring';
  if (st === 'coaching') return 'life_coach';
  if (st === 'consulting') return 'consultant';
  return verticalFromOrgType(organizationType);
}

async function resolveAgency(agencySlugOrId) {
  return ClientExchange.getPublicOfficeIntakeAgency(agencySlugOrId);
}

async function loadAgencyRow(agencySlugOrId) {
  const slug = String(agencySlugOrId || '').trim();
  if (!slug) return null;
  if (/^\d+$/.test(slug)) {
    const [rows] = await pool.execute(
      `SELECT id, name, slug, portal_url, organization_type, logo_url, color_palette, feature_flags, public_booking_settings, careers_page_json, theme_settings, phone_number, phone_extension, onboarding_team_email
       FROM agencies WHERE id = ? AND is_active = 1 LIMIT 1`,
      [Number(slug)]
    );
    return rows[0] || null;
  }
  const [rows] = await pool.execute(
    `SELECT id, name, slug, portal_url, organization_type, logo_url, color_palette, feature_flags, public_booking_settings, careers_page_json, theme_settings, phone_number, phone_extension, onboarding_team_email
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
    const AgencyOfficeIntakeMaster = (await import('../models/AgencyOfficeIntakeMaster.model.js')).default;
    const IntakeLink = (await import('../models/IntakeLink.model.js')).default;
    // Prefer (and lazily create) the Master Office published shell for Join In-Depth.
    let officeMaster = null;
    try {
      officeMaster = await AgencyOfficeIntakeMaster.getOrCreateForAgency(agencyId, {
        languageCode: 'en'
      });
    } catch {
      officeMaster = await AgencyOfficeIntakeMaster.findByAgencyLanguage(agencyId, 'en');
    }
    if (officeMaster?.published_intake_link_id) {
      const shell = await IntakeLink.findById(officeMaster.published_intake_link_id);
      if (shell?.is_active && shell.public_key) {
        return {
          publicKey: shell.public_key,
          title: shell.title,
          formType: shell.form_type || 'intake'
        };
      }
    }
    // intake_links has no agency_id — organization_id is the tenant for agency-scoped links.
    const [rows] = await pool.execute(
      `SELECT public_key, title, form_type
       FROM intake_links
       WHERE organization_id = ?
         AND scope_type = 'agency'
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

export async function getAdaptiveIntakeConfig(agencySlugOrId, req, options = {}) {
  const agencyRow = await loadAgencyRow(agencySlugOrId);
  if (!agencyRow) return null;

  const intakeServices = await listIntakeServices(agencyRow);
  const requestedServiceType = String(options.serviceType || req?.query?.serviceType || '').trim().toLowerCase();
  const activeService =
    intakeServices.find((s) => s.serviceType === requestedServiceType) ||
    (intakeServices.length === 1 ? intakeServices[0] : null);

  const vertical = activeService
    ? verticalFromServiceType(activeService.serviceType, agencyRow.organization_type)
    : verticalFromOrgType(agencyRow.organization_type);
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

  const careersPage = parseJson(agencyRow.careers_page_json, null);
  const decorHero = careersPage
    ? {
        heroImageUrl: careersPage.heroImageUrl || null,
        heroImageAlt: careersPage.heroImageAlt || null,
        heroFrameStyle: careersPage.heroFrameStyle || null,
        heroImagePosition: careersPage.heroImagePosition || null
      }
    : null;

  return {
    agency: {
      id: agencyRow.id,
      name: agencyRow.name,
      slug: agencyRow.slug || agencyRow.portal_url,
      organizationType: agencyRow.organization_type || 'agency'
    },
    branding,
    decorHero,
    intakeServices,
    activeService: activeService
      ? {
          serviceType: activeService.serviceType,
          displayName: activeService.displayName,
          introBlurb: activeService.introBlurb
        }
      : null,
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
    copy: mergeJoinLandingCopy(vertical, agencyRow, activeService),
    themeImageUrl: resolveJoinThemeImage(agencyRow, activeService),
    supportContact: resolveClientFacingSupport(agencyRow)
  };
}

function agencySlugKey(agencyRow = {}) {
  return String(agencyRow.slug || agencyRow.portal_url || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
}

function formatUsPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return String(raw || '').trim();
}

/** Client-facing support from the tenant about/contact file, with ITSCO toll-free → local support. */
export function resolveClientFacingSupport(agencyRow = {}) {
  const slug = agencySlugKey(agencyRow);
  const email = slug
    ? `support@${slug}.health`
    : (agencyRow.onboarding_team_email || agencyRow.supportEmail || null);
  const rawPhone = agencyRow.phone_number || agencyRow.phone || '';
  const digits = String(rawPhone).replace(/\D/g, '');
  const isTollFree = digits === '8334448726' || digits === '18334448726';
  const extRaw = String(agencyRow.phone_extension || agencyRow.phoneExtension || '').trim();
  if (slug === 'itsco' || isTollFree || !digits) {
    return {
      email: email || 'support@itsco.health',
      phone: '719-657-7444 Ext 0',
      phoneExtension: '0',
      tel: '+17196577444,0'
    };
  }
  const formatted = formatUsPhone(rawPhone);
  const ext = extRaw ? (/^ext/i.test(extRaw) ? extRaw.replace(/^ext\.?\s*/i, 'Ext ') : `Ext ${extRaw}`) : '';
  return {
    email,
    phone: ext ? `${formatted} ${ext}` : formatted,
    phoneExtension: extRaw || null,
    tel: `+1${digits}${extRaw ? `,${extRaw.replace(/\D/g, '')}` : ''}`
  };
}

export function resolveJoinThemeImage(agencyRow = {}, activeService = null) {
  const slug = agencySlugKey(agencyRow);
  const serviceType = String(activeService?.serviceType || '').toLowerCase();
  const hay = `${slug} ${agencyRow.name || ''}`.toLowerCase();
  const isNlu = hay.includes('nlu') || hay.includes('new life') || hay.includes('newlife');
  if (serviceType === 'tutoring' || (isNlu && serviceType === 'tutoring')) {
    return '/assets/intake-themes/bluetutoringtheme.jpg';
  }
  if (isNlu) return '/assets/intake-themes/blueintakethemecounseling.jpg';
  return '/assets/intake-themes/greenintakethemecounseling.jpg';
}

function defaultJoinLanding(vertical, agencyName) {
  const org = agencyName || 'our team';
  const base = {
    welcomeTitle: `Welcome to ${org}!`,
    welcomeGlad: "We're so glad you're here.",
    welcomeLead: `Let's find the right place to start. Choose the type of intake that works best for you with ${org}. You can always add more details later or reach out if you need help.`,
    sidebarScript: "You're Not Alone.",
    sidebarTagline: 'HEAL • GROW • THRIVE',
    value1: 'Supportive & Welcoming',
    value2: 'Personalized to Your Needs',
    value3: 'Focused on Growth & Well-Being',
    helpTitle: 'Need Help?',
    helpBody: "We're here for you.",
    sendMessage: 'Send Us a Message',
    slogan: 'Better Days Start Here.',
    welcomeSubtitle: `Choose the type of intake that works best for you with ${org}. You can always add more details later.`,
    quickTitle: 'Quick Prospective',
    quickTagline: 'A short form to get you started.',
    quickDescription: 'Perfect if you are exploring services and want our team to follow up.',
    quickDuration: '5–10 min',
    quickBullets: ['Basic contact information', 'Reason for seeking support', 'Preferred communication method'],
    quickCta: 'Start Quick Intake →',
    quickFooter: 'You can add more details later.',
    fullTitle: 'In-Depth Intake Packet',
    fullTagline: 'A comprehensive intake experience.',
    fullDescription: 'Best when you are ready to provide full information for personalized care.',
    fullDuration: '25–35 min',
    fullBullets: ['All basic information', 'Detailed history & concerns', 'Documents & signatures'],
    fullCta: 'Start Full Intake →',
    fullFooter: 'More complete = better personalized care.'
  };
  if (vertical === 'life_coach') {
    return {
      ...base,
      welcomeSubtitle: `Choose how you’d like to connect with ${org}. You can start light and add details later.`,
      quickTitle: 'Quick Interest Form',
      fullTitle: 'Full Coaching Intake'
    };
  }
  if (vertical === 'consultant') {
    return {
      ...base,
      welcomeSubtitle: `Tell us a little about your needs, or complete a fuller intake for ${org}.`,
      quickTitle: 'Quick Inquiry',
      fullTitle: 'Full Consulting Intake'
    };
  }
  if (vertical === 'tutoring') {
    return {
      ...base,
      welcomeSubtitle: `Start with a short interest form or a fuller tutoring intake for ${org}.`,
      sidebarTagline: 'LEARN • GROW • THRIVE',
      value3: 'Focused on Learning & Confidence',
      quickTitle: 'Quick Interest Form',
      fullTitle: 'Full Tutoring Intake'
    };
  }
  return base;
}

function isJoinLandingFlat(value) {
  return !!(value && typeof value === 'object' && (value.welcomeTitle || value.layout || value.quickTitle || value.welcomeLead));
}

function pickJoinLandingScoped(saved, serviceKey) {
  if (!saved || typeof saved !== 'object') return {};
  const nested = saved[serviceKey];
  if (isJoinLandingFlat(nested)) return nested;
  if (isJoinLandingFlat(saved.default)) return saved.default;
  if (isJoinLandingFlat(saved)) return saved;
  return {};
}

function mergeJoinLandingCopy(vertical, agencyRow, activeService) {
  const defaults = defaultJoinLanding(vertical, agencyRow?.name);
  const theme = parseJson(agencyRow?.theme_settings, {}) || {};
  const saved = theme.joinLanding && typeof theme.joinLanding === 'object' ? theme.joinLanding : {};
  const serviceKey = String(activeService?.serviceType || 'default');
  const scoped = pickJoinLandingScoped(saved, serviceKey);
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(scoped)) {
    if (key === 'quickBullets' || key === 'fullBullets') {
      if (Array.isArray(value) && value.length) merged[key] = value.map((v) => String(v || '').trim()).filter(Boolean);
      continue;
    }
    if (key === 'layout' && value && typeof value === 'object') {
      merged.layout = value;
      continue;
    }
    if (typeof value === 'string' && value.trim()) merged[key] = value.trim();
  }
  if (/non-?judgmental/i.test(String(merged.value1 || ''))) {
    merged.value1 = 'Supportive & Welcoming';
  }
  return merged;
}

export async function updateJoinLandingCopy({ agencySlugOrId, serviceType, copy = {} }) {
  const agencyRow = await loadAgencyRow(agencySlugOrId);
  if (!agencyRow) throw new Error('Organization not found');
  const theme = parseJson(agencyRow.theme_settings, {}) || {};
  const existing = theme.joinLanding && typeof theme.joinLanding === 'object' ? { ...theme.joinLanding } : {};
  const key = String(serviceType || '').trim().toLowerCase() || 'default';
  const prev = existing[key] && typeof existing[key] === 'object' ? existing[key] : {};
  const next = { ...prev };
  for (const [field, value] of Object.entries(copy || {})) {
    if (field === 'quickBullets' || field === 'fullBullets') {
      next[field] = Array.isArray(value) ? value.map((v) => String(v || '').trim()).filter(Boolean) : prev[field];
      continue;
    }
    if (field === 'layout' && value && typeof value === 'object') {
      next[field] = value;
      continue;
    }
    if (typeof value === 'string') next[field] = value;
  }
  existing[key] = next;
  theme.joinLanding = existing;
  await pool.execute('UPDATE agencies SET theme_settings = ? WHERE id = ?', [
    JSON.stringify(theme),
    agencyRow.id
  ]);
  return mergeJoinLandingCopy(
    verticalFromServiceType(key, agencyRow.organization_type),
    { ...agencyRow, theme_settings: theme },
    { serviceType: key }
  );
}

function normalizeBirthdate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function humanizeToken(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const MODALITY_LABELS = {
  in_person: 'In person',
  virtual: 'Virtual',
  either: 'No preference'
};

const TIME_OF_DAY_LABELS = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  flexible: 'Flexible'
};

function labelModality(value) {
  return MODALITY_LABELS[String(value || '').trim()] || humanizeToken(value);
}

function labelTimeOfDay(value) {
  return TIME_OF_DAY_LABELS[String(value || '').trim()] || humanizeToken(value);
}

export async function submitQuickProspective({ agencySlugOrId, payload = {}, req }) {
  const agencyRow = await loadAgencyRow(agencySlugOrId);
  if (!agencyRow) throw new Error('Organization not found');

  const intakeServices = await listIntakeServices(agencyRow);
  const requestedServiceType = String(payload.serviceType || '').trim().toLowerCase();
  const activeService =
    intakeServices.find((s) => s.serviceType === requestedServiceType) ||
    (intakeServices.length === 1 ? intakeServices[0] : null);
  if (intakeServices.length > 1 && !activeService) {
    throw new Error('Please choose a service before submitting.');
  }

  const vertical = activeService
    ? verticalFromServiceType(activeService.serviceType, agencyRow.organization_type)
    : verticalFromOrgType(agencyRow.organization_type);
  const whoFor = String(payload.whoFor || 'myself').trim();
  const respondent = payload.respondent || {};
  const clientInfo = payload.client || {};
  const concerns = Array.isArray(payload.concerns) ? payload.concerns : [];
  const preferences = payload.preferences || {};
  const accomplishGoal = String(payload.accomplishGoal || payload.goals || '').trim() || null;
  const homeAddress = String(payload.homeAddress || clientInfo.homeAddress || '').trim() || null;
  const birthdate = normalizeBirthdate(
    payload.birthdate || clientInfo.birthdate || clientInfo.dateOfBirth || clientInfo.ageOrDob
  );

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
      dateOfBirth: birthdate,
      homeAddress,
      presentingConcern:
        accomplishGoal ||
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
    serviceType: activeService?.serviceType || null,
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
    accomplishGoal,
    homeAddress,
    birthdate,
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
      accomplishGoal,
      homeAddress,
      birthdate,
      respondentEmail: meta.respondent.email,
      preferredProviderUserId: meta.preferredProviderUserId,
      vertical,
      serviceType: activeService?.serviceType || null
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
      clientId: client.id,
      submittedAt: new Date().toISOString(),
      pathway: 'quick_prospective',
      summary: {
        whoFor,
        whoForLabel:
          whoFor === 'myself'
            ? 'Myself'
            : whoFor === 'child'
              ? 'My child / dependent'
              : whoFor === 'legal'
                ? 'Someone I have legal authority for'
                : humanizeToken(whoFor),
        contactName: `${String(respondent.firstName || '').trim()} ${String(respondent.lastName || '').trim()}`.trim(),
        contactEmail: meta.respondent.email,
        contactPhone: meta.respondent.phone,
        clientName: `${clientFirst} ${clientLast}`.trim(),
        birthdate,
        homeAddress,
        concerns,
        accomplishGoal,
        notes: payload.notes || null,
        preferredModality: labelModality(preferences.preferredModality || payload.preferredModality),
        preferredTimeOfDay: labelTimeOfDay(preferences.preferredTimeOfDay || payload.preferredTimeOfDay),
        preferredDays: Array.isArray(preferences.preferredDays)
          ? preferences.preferredDays
          : preferences.preferredDays
            ? [preferences.preferredDays]
            : [],
        insuranceOrPayment: preferences.insuranceOrPayment || payload.insuranceOrPayment || null,
        serviceType: activeService?.displayName || activeService?.serviceType || null
      },
      supportContact: resolveClientFacingSupport(agencyRow)
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

export async function submitSupportInquiry({ agencySlugOrId, payload = {} }) {
  const agencyRow = await loadAgencyRow(agencySlugOrId);
  if (!agencyRow) throw new Error('Organization not found');

  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim();
  const message = String(payload.message || '').trim();
  if (!name || !email || !message) {
    throw new Error('Name, email, and message are required.');
  }

  const supportEmail = String(agencyRow.onboarding_team_email || '').trim();
  const referenceCode = String(payload.referenceCode || '').trim();
  const clientId = Number(payload.clientId || 0) || null;
  const subject = referenceCode
    ? `Interest form follow-up (${referenceCode})`
    : 'Interest form follow-up question';

  const bodyLines = [
    `Name: ${name}`,
    `Email: ${email}`,
    referenceCode ? `Reference: ${referenceCode}` : null,
    clientId ? `Client ID: ${clientId}` : null,
    '',
    message
  ].filter(Boolean);

  if (supportEmail) {
    try {
      const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
      await sendEmailFromIdentity({
        agencyId: agencyRow.id,
        to: supportEmail,
        subject,
        text: bodyLines.join('\n'),
        source: 'adaptive_intake_support_inquiry',
        replyTo: email
      });
    } catch {
      /* fall through — still acknowledge submission */
    }
  }

  return { ok: true };
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
