import {listPublicProviderOffices} from '../services/publicProviderOffices.service.js';
import { offersProviderService } from '../utils/providerServiceOfferings.js';
import {publicFormatEnabled} from '../utils/providerAvailabilityReminders.js';
import { getPublicCounselingHourlyRate } from '../services/publicCounselingRate.service.js';
import {normalizeLearningProfile, validateLearningCatalog, hourlyRate, pricePackage, matchesGrade, publicLearningCatalog, LEARNING_PROGRAMS} from '../services/learningCatalog.js';
import {publicAcceptance,uniquePublicFacets} from '../utils/publicProviderPresentation.js';
import { createPublicProviderHoldService, holdError } from '../services/publicProviderHold.service.js';
import pool from '../config/database.js';
import ProviderAvailabilityService from '../services/providerAvailability.service.js';
import PublicAppointmentRequest from '../models/PublicAppointmentRequest.model.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import PublicIntakeClientService, {
  PUBLIC_BOOKING_INQUIRY_CLIENT_OPTIONS,
  isPractitionerOrgType as isPractitionerOrgTypeShared,
  resolveOrganizationIdForPublicBooking
} from '../services/publicIntakeClient.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import EmailService from '../services/email.service.js';
import {
  detectAgeBucketFromText,
  normalizeAgeFilterValue,
  providerServesAgeBucket,
  textMatchesClinicalProfile
} from '../utils/ageMatch.util.js';
import { listOfficeIntakeProviders } from '../services/officeIntakeProviders.service.js';
import { findFullIntakePublicKey } from '../services/adaptiveIntake.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a Set of ISO start-time strings (e.g. "2025-04-01T14:00:00.000Z") for
 * slots that are already "held" by a non-cancelled/declined public request for
 * this provider. Used to exclude them from the available-slot lists shown to
 * new clients browsing the finder.
 */
async function getHeldSlotStartsForProvider(agencyId, providerId) {
  const [rows] = await pool.execute(
    `SELECT requested_start_at
     FROM public_appointment_requests
     WHERE agency_id = ?
       AND provider_id = ?
       AND UPPER(COALESCE(status, 'PENDING')) NOT IN ('DECLINED', 'CANCELLED')
       AND requested_start_at >= NOW()`,
    [Number(agencyId), Number(providerId)]
  );
  const held = new Set();
  for (const r of rows || []) {
    if (r.requested_start_at) {
      // Normalise to ISO string so we can compare against slot.startAt values.
      const iso = new Date(r.requested_start_at).toISOString();
      held.add(iso);
    }
  }
  return held;
}

function filterHeldSlots(slots, heldSet) {
  if (!heldSet || heldSet.size === 0) return slots;
  return (slots || []).filter((s) => {
    if (!s?.startAt) return true;
    const iso = new Date(s.startAt).toISOString();
    return !heldSet.has(iso);
  });
}

function parseIntSafe(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function isValidYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').slice(0, 10));
}

function startOfWeekMondayYmd(input) {
  const d = new Date(`${String(input || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMoney(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n) || n < 0) return null;
  return `$${(n / 100).toFixed(2)}`;
}

function normalizeBookingMode(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'current_client' || s === 'current') return 'CURRENT_CLIENT';
  return 'NEW_CLIENT';
}

function normalizeProgramType(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'virtual') return 'VIRTUAL';
  return 'IN_PERSON';
}

function normalizeServiceType(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const allowed = new Set(['counseling', 'tutoring', 'evaluation', 'coaching', 'consulting']);
  if (allowed.has(s)) return s;
  return 'counseling';
}

function defaultDisplayNameForServiceType(serviceType) {
  const t = String(serviceType || '').toLowerCase();
  if (t === 'tutoring') return 'Find a Tutor';
  if (t === 'coaching') return 'Life Coaching';
  if (t === 'consulting') return 'Consulting';
  if (t === 'evaluation') return 'Evaluation';
  return 'Find a Counselor';
}

function isPractitionerOrgType(orgType) {
  return isPractitionerOrgTypeShared(orgType);
}

function parseAgencyFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function resolveDiscoverySettings(orgType, featureFlags = {}) {
  const t = String(orgType || '').toLowerCase();
  const defaults = t === 'life_coach'
    ? { discoveryBookingEnabled: true, discoveryBookingRequired: true, discoveryDurationMin: 20, discoveryLabel: 'Discovery Call' }
    : t === 'consultant'
      ? { discoveryBookingEnabled: true, discoveryBookingRequired: false, discoveryDurationMin: 30, discoveryLabel: 'Quick Clarity Call' }
      : { discoveryBookingEnabled: false, discoveryBookingRequired: false, discoveryDurationMin: 30, discoveryLabel: 'Discovery Call' };
  return {
    discoveryBookingEnabled: featureFlags.discoveryBookingEnabled === undefined
      ? defaults.discoveryBookingEnabled
      : !!featureFlags.discoveryBookingEnabled,
    discoveryBookingRequired: featureFlags.discoveryBookingRequired === undefined
      ? defaults.discoveryBookingRequired
      : !!featureFlags.discoveryBookingRequired,
    discoveryDurationMin: Number(featureFlags.discoveryDurationMin || defaults.discoveryDurationMin) || defaults.discoveryDurationMin,
    discoveryLabel: String(featureFlags.discoveryLabel || defaults.discoveryLabel).trim() || defaults.discoveryLabel
  };
}

function parseJsonColumn(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function defaultBookingPageSettings(orgType) {
  const t = String(orgType || '').toLowerCase();
  const styleDefaults = { fontFamily: '', headingFontFamily: '', accentColor: '' };
  if (t === 'consultant') {
    return {
      ...styleDefaults,
      brandDisplayName: '',
      ctaLabel: 'Book a Session',
      showNav: false,
      navLinks: [],
      backgroundImageUrl: '',
      consultantTagline: 'Strategic guidance. Practical solutions. Real results.',
      consultantBenefits: ['Personalized 1:1 Sessions', 'Flexible Scheduling', 'Secure & Confidential'],
      providerTitleFallback: 'Senior Consultant',
      providerBioFallback: 'I help leaders and organizations grow with clarity, strategy, and systems that scale.',
      specialties: [],
      whatToExpectTitle: 'What to expect',
      whatToExpectBody: 'A focused working session tailored to the service you select.',
      coachQuote: '',
      modalityLabel: 'Virtual',
      valueProps: [
        { title: 'Easy scheduling', body: 'Book from live calendar availability' },
        { title: 'Calendar sync', body: 'Works with your calendar' },
        { title: "You're in control", body: 'Decide next steps after you connect' }
      ],
      coachEyebrow: '',
      coachHeroTitles: { step1: '', step2: '', step3: '' },
      coachHeroSubtitles: { step1: '', step2: '', step3: '' },
      valuePropsStep1: [],
      valuePropsLater: [],
      step3Fields: []
    };
  }
  return {
    ...styleDefaults,
    brandDisplayName: '',
    ctaLabel: 'Book a Discovery Call',
    showNav: true,
    navLinks: [
      { label: 'About Me', href: '#booking' },
      { label: 'Coaching', href: '#booking' },
      { label: 'Programs', href: '#booking' },
      { label: 'Resources', href: '#booking' },
      { label: 'Contact', href: '#booking' }
    ],
    backgroundImageUrl: '',
    consultantTagline: '',
    consultantBenefits: [],
    providerTitleFallback: 'Life Coach',
    providerBioFallback: 'Helping you rise, revive, and create lasting change.',
    specialties: [
      'Life & Personal Growth',
      'Mindset & Confidence',
      'Goal Setting & Accountability',
      'Work-Life Balance'
    ],
    whatToExpectTitle: 'What to expect',
    whatToExpectBody: 'A friendly, no-pressure conversation to explore your goals and see how I can support you.',
    coachQuote: "Sometimes the first step is the hardest, but it's also the most powerful. I'm honored you're taking it.",
    modalityLabel: 'Virtual (Zoom)',
    coachEyebrow: 'Discovery Call',
    coachHeroTitles: {
      step1: "Let's find a time that works for you",
      step2: 'Almost there!',
      step3: "You're almost all set!"
    },
    coachHeroSubtitles: {
      step1: 'This is the first step toward lasting change. Select a time that works best for you for our discovery call.',
      step2: 'Share the days and times that usually work for you — this is submitted with your request.',
      step3: 'Just a few quick details so I can personalize our call and make the most of our time together.'
    },
    valueProps: [],
    valuePropsStep1: [
      { title: 'No Obligation', body: 'This discovery call is 100% free with no pressure.' },
      { title: 'Get to Know Each Other', body: "A chance to connect and see if we're a good fit." },
      { title: 'Next Steps', body: "If it feels right, we'll talk about how I can support you." }
    ],
    valuePropsLater: [
      { title: 'Get to know each other', body: "A chance to connect and see if we're a good fit." },
      { title: 'Explore your goals', body: "We'll talk about what's on your mind and what you want to create." },
      { title: "You're in control", body: 'You decide what happens next after our call.' }
    ],
    step3Fields: [
      { id: 'name', type: 'text', label: 'Full Name', required: true, enabled: true, placeholder: '', options: [] },
      { id: 'email', type: 'email', label: 'Email Address', required: true, enabled: true, placeholder: 'you@example.com', options: [] },
      { id: 'phone', type: 'tel', label: 'Phone Number', required: false, enabled: true, placeholder: '(555) 123-4567', options: [] },
      {
        id: 'referralSource',
        type: 'select',
        label: 'How did you hear about me?',
        required: false,
        enabled: true,
        placeholder: 'Select one…',
        options: ['Google / search', 'Social media', 'Friend or family', 'Podcast / media', 'Other']
      },
      {
        id: 'goals',
        type: 'textarea',
        label: 'What are you hoping to get out of our discovery call?',
        required: true,
        enabled: true,
        placeholder: '',
        maxLength: 500,
        options: []
      },
      {
        id: 'notes',
        type: 'textarea',
        label: 'Anything else I should know before our call?',
        required: false,
        enabled: true,
        placeholder: '',
        maxLength: 500,
        options: []
      }
    ]
  };
}

function resolveBookingPageSettings(orgType, stored = {}) {
  const defaults = defaultBookingPageSettings(orgType);
  const raw = stored && typeof stored === 'object' ? stored : {};
  const pickList = (v, fb) => (Array.isArray(v) ? v : fb);
  const titles = { ...defaults.coachHeroTitles, ...(raw.coachHeroTitles || {}) };
  const subs = { ...defaults.coachHeroSubtitles, ...(raw.coachHeroSubtitles || {}) };
  return {
    ...defaults,
    ...raw,
    fontFamily: String(raw.fontFamily || defaults.fontFamily || '').trim().toLowerCase(),
    headingFontFamily: String(raw.headingFontFamily || defaults.headingFontFamily || '').trim().toLowerCase(),
    accentColor: String(raw.accentColor || defaults.accentColor || '').trim(),
    brandDisplayName: String(raw.brandDisplayName ?? defaults.brandDisplayName ?? '').trim(),
    ctaLabel: String(raw.ctaLabel || defaults.ctaLabel).trim() || defaults.ctaLabel,
    showNav: raw.showNav === undefined ? defaults.showNav : !!raw.showNav,
    navLinks: pickList(raw.navLinks, defaults.navLinks),
    backgroundImageUrl: String(raw.backgroundImageUrl || '').trim(),
    consultantTagline: String(raw.consultantTagline || defaults.consultantTagline).trim(),
    consultantBenefits: pickList(raw.consultantBenefits, defaults.consultantBenefits),
    providerTitleFallback: String(raw.providerTitleFallback || defaults.providerTitleFallback).trim(),
    providerBioFallback: String(raw.providerBioFallback || defaults.providerBioFallback).trim(),
    specialties: pickList(raw.specialties, defaults.specialties),
    whatToExpectTitle: String(raw.whatToExpectTitle || defaults.whatToExpectTitle).trim(),
    whatToExpectBody: String(raw.whatToExpectBody || defaults.whatToExpectBody).trim(),
    coachQuote: String(raw.coachQuote ?? defaults.coachQuote).trim(),
    modalityLabel: String(raw.modalityLabel || defaults.modalityLabel).trim(),
    coachEyebrow: String(raw.coachEyebrow || defaults.coachEyebrow).trim(),
    coachHeroTitles: {
      step1: String(titles.step1 || '').trim(),
      step2: String(titles.step2 || '').trim(),
      step3: String(titles.step3 || '').trim()
    },
    coachHeroSubtitles: {
      step1: String(subs.step1 || '').trim(),
      step2: String(subs.step2 || '').trim(),
      step3: String(subs.step3 || '').trim()
    },
    valueProps: pickList(raw.valueProps, defaults.valueProps),
    valuePropsStep1: pickList(raw.valuePropsStep1, defaults.valuePropsStep1),
    valuePropsLater: pickList(raw.valuePropsLater, defaults.valuePropsLater),
    step3Fields: Array.isArray(raw.step3Fields) && raw.step3Fields.length
      ? raw.step3Fields
      : defaults.step3Fields
  };
}

function resolveServiceCatalog(orgType, featureFlags = {}) {
  const discovery = resolveDiscoverySettings(orgType, featureFlags);
  if (Array.isArray(featureFlags.practitionerServiceCatalog) && featureFlags.practitionerServiceCatalog.length) {
    return featureFlags.practitionerServiceCatalog;
  }
  if (String(orgType || '').toLowerCase() === 'consultant') {
    const catalog = [
      { id: 'strategy', name: 'Strategy Session', durationMin: 60, priceCents: 25000, description: 'Deep dive into your challenges and opportunities.', icon: 'chart', isDiscovery: false },
      { id: 'growth', name: 'Growth Planning Session', durationMin: 90, priceCents: 37500, description: 'Build a customized growth plan for your business.', icon: 'group', isDiscovery: false },
      { id: 'ops', name: 'Operations Review', durationMin: 60, priceCents: 25000, description: 'Optimize systems and improve operational efficiency.', icon: 'gear', isDiscovery: false },
      { id: 'workshop', name: 'Team Workshop', durationMin: 120, priceCents: 75000, description: 'Collaborative session for your leadership team.', icon: 'team', isDiscovery: false }
    ];
    if (discovery.discoveryBookingEnabled) {
      catalog.push({
        id: 'discovery',
        name: discovery.discoveryLabel,
        durationMin: discovery.discoveryDurationMin,
        priceCents: 0,
        description: 'Short call to get quick answers to your top questions.',
        icon: 'chat',
        isDiscovery: true
      });
    }
    return catalog;
  }
  if (String(orgType || '').toLowerCase() === 'life_coach') {
    return [{
      id: 'discovery',
      name: discovery.discoveryLabel,
      durationMin: discovery.discoveryDurationMin,
      priceCents: 0,
      description: 'A free, no-pressure conversation to explore your goals.',
      icon: 'chat',
      isDiscovery: true
    }];
  }
  return [];
}


async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const out = [];
  const max = Math.max(1, Number(limit || 1));
  const workers = Array.from({ length: max }).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      // eslint-disable-next-line no-await-in-loop
      const value = await worker(item);
      if (value) out.push(value);
    }
  });
  await Promise.all(workers);
  return out;
}

function dedupeSlots(slots) {
  const out = [];
  const seen = new Set();
  for (const s of Array.isArray(slots) ? slots : []) {
    const key = [
      String(s?.startAt || ''),
      String(s?.endAt || ''),
      String(s?.buildingId || ''),
      String(s?.roomId || ''),
      String(s?.sessionType || ''),
      String(s?.frequency || '')
    ].join('|');
    if (!String(s?.startAt || '').trim() || !String(s?.endAt || '').trim() || +new Date(s.startAt) <= Date.now()) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  out.sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
  return out;
}

// ---------------------------------------------------------------------------
// Agency/provider resolution
// ---------------------------------------------------------------------------

async function requireAgencyBySlug(res, agencySlug, {directoryOnly=false}={}) {
  const slug = String(agencySlug || '').trim();
  let rows;
  try {
    [rows] = await pool.execute(
      `SELECT id, name, slug, logo_url, logo_path, color_palette, theme_settings,
              public_availability_enabled, feature_flags, onboarding_team_email, phone_number,
              organization_type, public_booking_settings
       FROM agencies
       WHERE slug = ?
         AND COALESCE(is_active, 1) = 1
         AND LOWER(organization_type) IN ('agency','clubwebapp','life_coach','consultant')
         AND (is_archived IS NULL OR is_archived = FALSE)
       LIMIT 1`,
      [slug]
    );
  } catch {
    [rows] = await pool.execute(
      `SELECT id, name, slug, logo_url, logo_path, color_palette, theme_settings,
              public_availability_enabled, feature_flags, onboarding_team_email, phone_number,
              organization_type
       FROM agencies
       WHERE slug = ?
         AND COALESCE(is_active, 1) = 1
         AND LOWER(organization_type) IN ('agency','clubwebapp','life_coach','consultant')
         AND (is_archived IS NULL OR is_archived = FALSE)
       LIMIT 1`,
      [slug]
    );
  }
  const a = rows?.[0] || null;
  if (!a) {
    res.status(404).json({ error: { message: 'Agency not found' } });
    return null;
  }
  if (!directoryOnly && !a.public_availability_enabled) {
    res.status(403).json({ error: { message: 'Public booking is not enabled for this agency' } });
    return null;
  }
  // Parse JSON fields
  if (a.color_palette && typeof a.color_palette === 'string') {
    try { a.color_palette = JSON.parse(a.color_palette); } catch { a.color_palette = {}; }
  }
  if (a.theme_settings && typeof a.theme_settings === 'string') {
    try { a.theme_settings = JSON.parse(a.theme_settings); } catch { a.theme_settings = {}; }
  }
  return a;
}

async function getAgencyServiceTypes(agencyId) {
  const [rows] = await pool.execute(
    `SELECT service_type, display_name, intro_blurb, hero_image_url, sort_order
     FROM agency_public_service_types
     WHERE agency_id = ? AND is_enabled = 1
     ORDER BY sort_order ASC, service_type ASC`,
    [Number(agencyId)]
  );
  return rows || [];
}

async function getEnrolledProviderIds(agencyId, serviceType) {
  return new Set((await listEnrolledProviders(agencyId, serviceType)).map(row => Number(row.id)));
}

async function listEnrolledProviders(agencyId, serviceType, {includeDirectory=false}={}) {
  const serviceEnabled=(await getAgencyServiceTypes(agencyId)).some(s=>s.service_type===serviceType);
  // A clinical directory and school schedule remain public when online booking is not configured.
  if(!serviceEnabled && !(includeDirectory && serviceType==='counseling')) return [];
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.role, u.profile_photo_path,
            u.service_focus, u.provider_accepting_new_clients, u.in_office_available, u.title, u.sees_clients, p.public_details_json AS service_details, 1 AS online_enrolled
     FROM users u
     LEFT JOIN provider_public_profiles p ON p.user_id=u.id
     JOIN provider_public_service_enrollments e
       ON e.user_id = u.id AND e.agency_id = ? AND e.service_type = ? AND e.is_active = 1
     JOIN user_agencies membership ON membership.user_id = u.id AND membership.agency_id = e.agency_id
     WHERE u.sees_clients = 1 AND COALESCE(membership.is_active,1)=1 AND COALESCE(u.is_demo,0)=0
       AND LOWER(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')))) NOT IN ('super admin','superadmin')
       AND (u.is_active IS NULL OR u.is_active = TRUE)
       AND (u.is_archived IS NULL OR u.is_archived = FALSE)
       AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED', 'PROSPECTIVE'))
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [Number(agencyId), String(serviceType)]
  );
  const enrolled = rows.filter(row => offersProviderService(row.service_details, agencyId, serviceType, {enrolled:true,hasEnrollment:true})).map(row=>({...row,online_enrolled:serviceEnabled?1:0}));
  let listed = [];
  if (includeDirectory) {
    const [directory] = await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.role,u.profile_photo_path,
      u.service_focus,u.provider_accepting_new_clients,u.in_office_available,u.title,u.sees_clients,u.has_provider_access,ua.agency_role,0 AS online_enrolled,
      p.public_details_json AS service_details,
      EXISTS(SELECT 1 FROM provider_public_service_enrollments e WHERE e.user_id=u.id AND e.agency_id=ua.agency_id AND e.service_type=?) AS has_enrollment
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      LEFT JOIN provider_public_profiles p ON p.user_id=u.id
      WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND u.sees_clients=1
      AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
      AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')
      AND LOWER(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')))) NOT IN ('super admin','superadmin')
      ORDER BY u.last_name,u.first_name`,[String(serviceType),Number(agencyId)]);
    listed = directory.filter(row => !rows.some(e => Number(e.id)===Number(row.id)) && offersProviderService(row.service_details,agencyId,serviceType,{hasEnrollment:Boolean(row.has_enrollment),counselingEligible:['provider','provider_plus','intern','intern_plus','facilitator','supervisor','admin','super_admin'].includes(row.agency_role||row.role)||Boolean(row.has_provider_access)}));
  }
  const combined = extra => [...new Map([...listed,...extra,...enrolled].map(row => [Number(row.id),row])).values()]
    .sort((a,b)=>`${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
  const st = String(serviceType || '').toLowerCase();
  if (rows.length || !['coaching','consulting'].includes(st)) return combined([]);

  const [fallback] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.role, u.profile_photo_path,
            u.service_focus, u.provider_accepting_new_clients, u.in_office_available, u.title, u.sees_clients, p.public_details_json AS service_details, 1 AS online_enrolled
     FROM users u
     LEFT JOIN provider_public_profiles p ON p.user_id=u.id
     JOIN user_agencies ua ON ua.user_id = u.id
     JOIN agencies a ON a.id = ua.agency_id
     WHERE ua.agency_id = ? AND u.sees_clients=1 AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_demo,0)=0
       AND NOT EXISTS(SELECT 1 FROM provider_public_service_enrollments e WHERE e.user_id=u.id AND e.agency_id=ua.agency_id AND e.service_type=? AND e.is_active=0)
       AND LOWER(COALESCE(a.organization_type, '')) IN ('life_coach', 'consultant')
       AND (u.is_active IS NULL OR u.is_active = TRUE)
       AND (u.is_archived IS NULL OR u.is_archived = FALSE)
       AND UPPER(COALESCE(u.status, '')) = 'ACTIVE_EMPLOYEE'
       AND LOWER(COALESCE(u.role, '')) IN ('admin', 'provider', 'provider_plus', 'super_admin', 'staff')
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [Number(agencyId),String(serviceType)]
  );
  return combined((fallback || []).filter(row => offersProviderService(row.service_details, agencyId, serviceType, {enrolled:true})));
}

async function getTutoringProfile(userId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT learning_settings_json, subject_areas_json, grade_levels_json, session_rate_cents, session_rate_note, bio, accepting_new_students,
            COALESCE(min_session_package, 1) AS min_session_package,
            COALESCE(payment_policy, 'POST_SESSION') AS payment_policy
     FROM provider_tutoring_profiles
     WHERE user_id = ? AND agency_id = ?
     LIMIT 1`,
    [Number(userId), Number(agencyId)]
  );
  const r = rows?.[0] || null;
  if (!r) return null;
  let subjectAreas = [];
  let gradeLevels = [];
  try { subjectAreas = Array.isArray(r.subject_areas_json)?r.subject_areas_json:JSON.parse(r.subject_areas_json || '[]'); } catch { subjectAreas = []; }
  try { gradeLevels = Array.isArray(r.grade_levels_json)?r.grade_levels_json:JSON.parse(r.grade_levels_json || '[]'); } catch { gradeLevels = []; }
  return {
    learning: normalizeLearningProfile(typeof r.learning_settings_json === 'string' ? JSON.parse(r.learning_settings_json) : r.learning_settings_json || {}),
    subjectAreas,
    gradeLevels,
    sessionRateCents: r.session_rate_cents ?? null,
    sessionRateLabel: formatMoney(r.session_rate_cents),
    sessionRateNote: r.session_rate_note || null,
    bio: r.bio || null,
    acceptingNewStudents: r.accepting_new_students === 1 || r.accepting_new_students === true,
    minSessionPackage: Number(r.min_session_package || 1),
    paymentPolicy: r.payment_policy || 'POST_SESSION'
  };
}

async function getCounselingSpecialties(userId, agencyId) {
  const { listClinicalFacetsForUser } = await import('../services/providerClinicalFacets.service.js');
  const facets = await listClinicalFacetsForUser(Number(userId), { agencyId });
  return {
    specialties: uniquePublicFacets(facets.specialties),
    modalities: facets.modalities || [],
    ageGroups: uniquePublicFacets(facets.ageGroups),
    focus: facets.populations || [],
    interventions: facets.interventions || [],
    serviceSettings: facets.serviceSettings || []
  };
}

async function resolveProviderProfileSummary({ agencyId, providerUserId, serviceType = 'counseling' }) {
  const counselingRate = await getPublicCounselingHourlyRate({ agencyId, providerUserId, serviceType });
  const profile = await ProviderPublicProfile.getForProvider({ providerUserId });
  const agencySettings = await ProviderPublicProfile.getAgencySettings({ agencyId });
  const effectiveRateCents = counselingRate ?? profile?.selfPayRateCents ?? agencySettings?.defaultSelfPayRateCents ?? null;
  const effectiveRateNote = counselingRate != null ? 'Per hour · cash / self-pay' : String(profile?.selfPayRateNote || agencySettings?.defaultSelfPayRateNote || '').trim() || null;
  let acceptedInsurances = [];
  try {
    const { listProviderAcceptedInsurancesForDisplay } = await import('../services/providerAcceptedInsurance.service.js');
    acceptedInsurances = await listProviderAcceptedInsurancesForDisplay({
      userId: providerUserId,
      agencyId
    });
  } catch {
    acceptedInsurances = [];
  }
  return {
    details: profile?.details || {},
    publicBlurb: String(profile?.publicBlurb || '').trim(),
    insurances: Array.isArray(profile?.insurances) ? profile.insurances : [],
    acceptedInsurances,
    selfPayRateCents: effectiveRateCents,
    selfPayRateLabel: formatMoney(effectiveRateCents),
    selfPayRateNote: effectiveRateNote,
    acceptingNewClientsOverride: profile?.acceptingNewClientsOverride ?? null
  };
}

async function computeProviderWindowSummary({ agencyId, providerId, weekStart, bookingMode, programType, heldSlots = null, lookaheadWeeks = 16, officeId = null }) {
  const intakeOnly = String(bookingMode || 'NEW_CLIENT') === 'NEW_CLIENT';
  const program = normalizeProgramType(programType);
  const pickProgramSlots = (result) => (program === 'VIRTUAL' ? (result?.virtualSlots || []) : (result?.inPersonSlots || [])).filter(s => Date.parse(s.startAt) > Date.now());

  const computeForWeek = async (candidateWeekStart) => {
    const result = await ProviderAvailabilityService.computeWeekAvailability({
      agencyId,
      providerId,
      weekStartYmd: candidateWeekStart,
      includeGoogleBusy: true,
      externalCalendarIds: [],
      slotMinutes: 60,
      intakeOnly
    });
    if (!result) return { inPersonSlots: [], virtualSlots: [] };
    return {
      inPersonSlots: filterHeldSlots(dedupeSlots((result.inPersonSlots || []).filter(slot=>!officeId||Number(slot.buildingId)===Number(officeId))), heldSlots),
      virtualSlots: filterHeldSlots(dedupeSlots(result.virtualSlots || []), heldSlots)
    };
  };

  const thisWeek = await computeForWeek(weekStart);
  const allThisWeek = dedupeSlots(pickProgramSlots(thisWeek));
  if (allThisWeek.length > 0) {
    return { thisWeek, nextAvailableAt: allThisWeek[0].startAt, bookedThroughYmd: null };
  }

  let nextAvailable = null;
  let bookedThroughYmd = null;
  for (let i = 1; i <= lookaheadWeeks; i += 1) {
    const candidateWeek = addDaysYmd(weekStart, i * 7);
    // eslint-disable-next-line no-await-in-loop
    const candidate = await computeForWeek(candidateWeek);
    const merged = dedupeSlots(pickProgramSlots(candidate));
    if (merged.length > 0) {
      nextAvailable = merged[0].startAt;
      const nextDate = new Date(nextAvailable);
      if (!Number.isNaN(nextDate.getTime())) bookedThroughYmd = addDaysYmd(nextDate.toISOString().slice(0, 10), -1);
      break;
    }
  }

  return { thisWeek, nextAvailableAt: nextAvailable, bookedThroughYmd };
}

function normalizeSlots({ result, bookingMode, profile }) {
  // These slots already passed schedule, assignment, conflict, and intake-hold checks.
  // Closing intake withdraws the publications themselves; later openings take precedence.
  const inPerson = (publicFormatEnabled(profile,'IN_PERSON',bookingMode)?result?.inPersonSlots || []:[]).filter((s) => new Date(s.startAt).getTime() > Date.now()).map((s) => ({
    ...s,
    modality: 'IN_PERSON',
    programType: 'IN_PERSON',
    recurrence: { isRecurring: true, frequency: String(s.frequency || 'WEEKLY').toUpperCase() }
  }));
  const virtual = (publicFormatEnabled(profile,'VIRTUAL',bookingMode)?result?.virtualSlots || []:[]).filter((s) => new Date(s.startAt).getTime() > Date.now()).map((s) => ({
    ...s,
    modality: 'VIRTUAL',
    programType: 'VIRTUAL',
    recurrence: { isRecurring: true, frequency: String(s.frequency || 'WEEKLY').toUpperCase() }
  }));
  return {
    virtual,
    inPerson,
    all: [...inPerson, ...virtual].sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')))
  };
}

// ---------------------------------------------------------------------------
// GET /:agencySlug — hub info
// ---------------------------------------------------------------------------

export const getAgencyServicesHub = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;

    const serviceTypes = await getAgencyServiceTypes(agency.id);

    const logoUrl = agency.logo_path
      ? publicUploadsUrlFromStoredPath(agency.logo_path)
      : (agency.logo_url || null);

    const featureFlags = parseAgencyFeatureFlags(agency.feature_flags);
    const orgType = String(agency.organization_type || 'agency').toLowerCase();
    const discoverySettings = resolveDiscoverySettings(orgType, featureFlags);
    const serviceCatalog = resolveServiceCatalog(orgType, featureFlags);
    const bookingPage = resolveBookingPageSettings(orgType, parseJsonColumn(agency.public_booking_settings));

    res.json({
      ok: true,
      agency: {
        id: Number(agency.id),
        name: agency.name || '',
        slug: agency.slug || '',
        logoUrl,
        colorPalette: parseJsonColumn(agency.color_palette),
        themeSettings: parseJsonColumn(agency.theme_settings),
        contactPhone: agency.phone_number || null,
        organizationType: orgType
      },
      discoverySettings,
      serviceCatalog,
      bookingPage,
      serviceTypes: serviceTypes.map((st) => ({
        serviceType: st.service_type,
        displayName: st.display_name || defaultDisplayNameForServiceType(st.service_type),
        introBlurb: st.intro_blurb || null,
        heroImageUrl: st.hero_image_url || null,
        sortOrder: st.sort_order || 0
      }))
    });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// GET /:agencySlug/choose-providers — shared office Choose a provider directory
// ---------------------------------------------------------------------------

export const listChooseProviders = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;
    const ages = String(req.query.ages || '')
      .split(',')
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n >= 0 && n < 120);
    const serviceMode = String(req.query.serviceMode || req.query.whoFor || '').trim();
    const providers = await listOfficeIntakeProviders(agency.id, {
      ages,
      includeNotAccepting: true,
      serviceMode
    });
    const fullIntake = await findFullIntakePublicKey(agency.id);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      agency: {
        id: agency.id,
        name: agency.name,
        slug: agency.slug || agency.portal_url
      },
      providers,
      fullIntake: fullIntake?.publicKey
        ? { publicKey: fullIntake.publicKey, title: fullIntake.title || null }
        : null
    });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// GET /:agencySlug/counselors — counseling provider list + availability
// ---------------------------------------------------------------------------

export const listCounselors = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug, {directoryOnly:true});
    if (!agency) return;

    const serviceType = normalizeServiceType(req.query.serviceType || req._forcedServiceType || 'counseling');
    const bookingMode = normalizeBookingMode(req.query.bookingMode || req.query.mode);
    const programType = normalizeProgramType(req.query.programType || req.query.program);
    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const weekStart = startOfWeekMondayYmd(isValidYmd(weekStartRaw) ? weekStartRaw : new Date().toISOString().slice(0, 10));
    const searchQ = String(req.query.search || '').trim().toLowerCase();
    const filterSpecialty = String(req.query.specialty || '').trim().toLowerCase();
    const filterModality = String(req.query.modality || '').trim().toLowerCase();
    const filterAgeGroup = String(req.query.ageGroup || '').trim().toLowerCase();
    const queryAgeBucket = detectAgeBucketFromText(searchQ);
    const normalizedQueryAge = queryAgeBucket ? normalizeAgeFilterValue(queryAgeBucket) : '';

    const agencySettings = await ProviderPublicProfile.getAgencySettings({ agencyId: agency.id });
    const serviceTypeRow = (await getAgencyServiceTypes(agency.id)).find((st) => st.service_type === serviceType);

    const providerRows = await listEnrolledProviders(agency.id, serviceType, {includeDirectory:true});
    const officeLocations = await listPublicProviderOffices(agency.id,providerRows.map(p=>p.id));

    const providers = await runWithConcurrency(providerRows, 6, async (row) => {
      const directoryOnly = req.query.view === 'directory';
      const heldSlots = directoryOnly ? [] : await getHeldSlotStartsForProvider(agency.id, Number(row.id));
      const summary = directoryOnly ? { thisWeek: { virtualSlots: [], inPersonSlots: [] }, nextAvailableAt: null, bookedThroughYmd: null } : await computeProviderWindowSummary({
        lookaheadWeeks: req.query.view === 'availability' ? 3 : 16,
        agencyId: agency.id,
        providerId: Number(row.id),
        weekStart,
        bookingMode,
        programType,
        heldSlots, officeId:Number(req.query.officeId)||null
      });
      const profileData = await ProviderPublicProfile.getForProvider({ providerUserId: Number(row.id) }) || {};
      profileData.acceptingNewClientsOverride = Boolean(row.provider_accepting_new_clients ?? profileData.acceptingNewClientsOverride ?? true);
      const profile = await resolveProviderProfileSummary({ agencyId: agency.id, providerUserId: Number(row.id) });
      if(!publicFormatEnabled(profileData,programType,bookingMode))summary.nextAvailableAt=null;
      const slotSet = normalizeSlots({
        result: summary.thisWeek,
        bookingMode,
        profile: profileData
      });
      const filteredThisWeek = programType === 'VIRTUAL' ? slotSet.virtual : slotSet.inPerson;

      const { specialties, modalities, ageGroups, focus } = await getCounselingSpecialties(Number(row.id), agency.id);

      // Apply client-side filters
      const displayName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
      const detectedSearchAge = queryAgeBucket;
      const effectiveAgeFilter = filterAgeGroup || (detectedSearchAge ? normalizeAgeFilterValue(detectedSearchAge) : '');

      if (searchQ) {
        const nameMatch = displayName.toLowerCase().includes(searchQ);
        const clinicalMatch = textMatchesClinicalProfile({
          text: searchQ,
          specialties,
          modalities,
          ageGroups,
          focus
        });
        if (!nameMatch && !clinicalMatch) return null;
      }

      if (filterSpecialty) {
        const allClinical = [...specialties, ...modalities, ...ageGroups, ...focus].map((s) => s.toLowerCase());
        if (!allClinical.some((s) => s.includes(filterSpecialty))) return null;
      }
      if (filterModality && !modalities.map((s) => s.toLowerCase()).some((s) => s.includes(filterModality))) return null;
      if (effectiveAgeFilter && !providerServesAgeBucket(ageGroups, effectiveAgeFilter)) return null;

      return {
        acceptingNewClients: Boolean(summary.nextAvailableAt) || Boolean(profileData.acceptingNewClientsOverride),
        onlineScheduling: Boolean(agency.public_availability_enabled) && row.online_enrolled !== 0,
        officeLocations:officeLocations.get(Number(row.id))||[],
        providerId: Number(row.id),
        id: Number(row.id),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        displayName,
        title: row.title || null,
        role: row.role || null,
        profilePhotoUrl: publicUploadsUrlFromStoredPath(row.profile_photo_path || null),
        serviceFocus: row.service_focus || null,
        specialties,
        modalities,
        ageGroups,
        focus,
        profile: {
          details: profile.details || {},
          publicBlurb: profile.publicBlurb || '',
          insurancesAccepted: Array.isArray(profile.insurances) ? profile.insurances : [],
          acceptedInsurances: Array.isArray(profile.acceptedInsurances) ? profile.acceptedInsurances : [],
          selfPayRateCents: profile.selfPayRateCents ?? null,
          selfPayRateLabel: profile.selfPayRateLabel || null,
          selfPayRateNote: profile.selfPayRateNote || null
        },
        availability: {
          checked: !directoryOnly,
          bookingMode,
          programType,
          weekStart,
          thisWeekCount: filteredThisWeek.length,
          // A schedule opening is distinct from permission to accept a new client.
          hasPublishedOpenings: Boolean(summary.nextAvailableAt),
          nextAvailableAt: summary.nextAvailableAt || null,
          bookedThroughDate: summary.bookedThroughYmd || null,
          slots: filteredThisWeek.map((s) => ({ ...s, bookingMode, programType }))
        }
      };
    });

    const validProviders = (providers || []).filter(Boolean);
    const virtualOnlyCount = validProviders.filter((p) => p.availability?.programType === 'VIRTUAL').length;

    res.json({
      ok: true,
      serviceType,
      agencyId: Number(agency.id),
      agencySlug: agency.slug,
      agencyName: agency.name || '',
      weekStart,
      bookingMode,
      programType,
      introBlurb: serviceTypeRow?.intro_blurb || agencySettings?.finderIntroBlurb || '',
      stats: {
        totalCount: validProviders.length,
        availableTodayCount: validProviders.filter((p) => {
          const today = new Date().toISOString().slice(0, 10);
          return (p.availability?.slots || []).some((s) => String(s.startAt || '').slice(0, 10) === today);
        }).length,
        virtualOnlyCount,
        fastestAvailableAt: validProviders
          .map((p) => p.availability?.nextAvailableAt)
          .filter(Boolean)
          .sort()[0] || null
      },
      providers: validProviders.sort((a, b) => {
        if (filterSpecialty) {
          const score = (p) => {
            const all = [...(p.specialties || []), ...(p.modalities || []), ...(p.ageGroups || []), ...(p.focus || [])]
              .map((s) => String(s).toLowerCase());
            return all.filter((s) => s.includes(filterSpecialty)).length;
          };
          const diff = score(b) - score(a);
          if (diff !== 0) return diff;
        }
        const ageFilter = filterAgeGroup || normalizedQueryAge;
        if (ageFilter) {
          const ageScore = (p) => (providerServesAgeBucket(p.ageGroups, ageFilter) ? 1 : 0);
          const diff = ageScore(b) - ageScore(a);
          if (diff !== 0) return diff;
        }
        if (a.availability?.nextAvailableAt && b.availability?.nextAvailableAt) {
          return String(a.availability.nextAvailableAt).localeCompare(String(b.availability.nextAvailableAt));
        }
        if (Boolean(a.availability?.nextAvailableAt) !== Boolean(b.availability?.nextAvailableAt)) return a.availability?.nextAvailableAt ? -1 : 1;
        return String(a.displayName || '').localeCompare(String(b.displayName || ''));
      })
    });
  } catch (e) {
    next(e);
  }
};

export const listCoaches = async (req, res, next) => {
  req.query.serviceType = 'coaching';
  return listCounselors(req, res, next);
};

export const listConsultants = async (req, res, next) => {
  req.query.serviceType = 'consulting';
  return listCounselors(req, res, next);
};

// ---------------------------------------------------------------------------
// GET /:agencySlug/tutors — tutoring provider list + availability
// ---------------------------------------------------------------------------

export const listTutors = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;

    const bookingMode = normalizeBookingMode(req.query.bookingMode || req.query.mode);
    const programType = normalizeProgramType(req.query.programType || req.query.program);
    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const weekStart = startOfWeekMondayYmd(isValidYmd(weekStartRaw) ? weekStartRaw : new Date().toISOString().slice(0, 10));
    const searchQ = String(req.query.search || '').trim().toLowerCase();
    const filterSubject = String(req.query.subject || '').trim().toLowerCase();
    const learningProgram = String(req.query.learningProgram || '').trim();
    if (learningProgram && !LEARNING_PROGRAMS.includes(learningProgram)) return res.status(400).json({error:{message:'Unknown learning program.'}});
    const catalog = await readLearningCatalog(agency.id);
    const filterGradeLevel = String(req.query.gradeLevel || '').trim().toLowerCase();

    const serviceTypeRow = (await getAgencyServiceTypes(agency.id)).find((st) => st.service_type === 'tutoring');
    const providerRows = await listEnrolledProviders(agency.id, 'tutoring', {includeDirectory:true});
    const officeLocations = await listPublicProviderOffices(agency.id,providerRows.map(p=>p.id));

    const providers = await runWithConcurrency(providerRows, 6, async (row) => {
      const savedTutoringProfile = await getTutoringProfile(Number(row.id), agency.id);
      // A directory listing does not require pricing or a bookable tutoring setup.
      const tutoringProfile = savedTutoringProfile || {subjectAreas:[],gradeLevels:[],bio:'',acceptingNewStudents:Boolean(row.provider_accepting_new_clients),learning:{programs:['tutoring']},hourlyRateCents:null,packages:[]};
      if (!savedTutoringProfile) row.online_enrolled = 0;
      if (learningProgram && !tutoringProfile.learning.programs.includes(learningProgram)) return null;
      if (!matchesGrade(tutoringProfile.gradeLevels, filterGradeLevel)) return null;
      if (savedTutoringProfile) tutoringProfile.hourlyRateCents = hourlyRate(catalog, tutoringProfile.learning, 'tutoring', req.query.learningFormat === 'small-group' ? 'small-group' : programType==='IN_PERSON'?'in-person':'virtual');
      if (savedTutoringProfile) tutoringProfile.packages = catalog.packages.filter(p=>p.published && tutoringProfile.learning.programs.includes(p.program) && p.program===(learningProgram||'tutoring')).map(p=>pricePackage(catalog,p,{tutoring:{profile:tutoringProfile.learning,providerId:Number(row.id)}}));

      const directoryOnly = req.query.view === 'directory' || row.online_enrolled === 0;
      const heldSlots = directoryOnly ? [] : await getHeldSlotStartsForProvider(agency.id, Number(row.id));
      const summary = directoryOnly ? { thisWeek: { virtualSlots: [], inPersonSlots: [] }, nextAvailableAt: null, bookedThroughYmd: null } : await computeProviderWindowSummary({
        lookaheadWeeks: req.query.view === 'availability' ? 0 : 16,
        agencyId: agency.id,
        providerId: Number(row.id),
        weekStart,
        bookingMode,
        programType,
        heldSlots, officeId:Number(req.query.officeId)||null
      });
      const profileData = await ProviderPublicProfile.getForProvider({ providerUserId: Number(row.id) }) || {};
      if (!savedTutoringProfile) tutoringProfile.bio = profileData.publicBlurb || '';
      profileData.acceptingNewClientsOverride = Boolean(row.provider_accepting_new_clients ?? profileData.acceptingNewClientsOverride ?? true);
      if(!publicFormatEnabled(profileData,programType,bookingMode))summary.nextAvailableAt=null;
      const slotSet = normalizeSlots({
        result: summary.thisWeek,
        bookingMode,
        profile: profileData
      });
      const filteredThisWeek = req.query.learningFormat !== 'small-group' ? (programType === 'VIRTUAL' ? slotSet.virtual : slotSet.inPerson) : [];

      const displayName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
      if (searchQ && !displayName.toLowerCase().includes(searchQ)) return null;
      if (filterSubject && !tutoringProfile.subjectAreas.map((s) => s.toLowerCase()).some((s) => s.includes(filterSubject))) return null;

      return {
        acceptingNewClients: Boolean(summary.nextAvailableAt) || (Boolean(profileData.acceptingNewClientsOverride) && tutoringProfile.acceptingNewStudents),
        onlineScheduling: row.online_enrolled !== 0,
        officeLocations:officeLocations.get(Number(row.id))||[],
        providerId: Number(row.id),
        id: Number(row.id),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        displayName,
        title: row.title || null,
        profilePhotoUrl: publicUploadsUrlFromStoredPath(row.profile_photo_path || null),
        tutoringProfile,
        availability: {
          checked: !directoryOnly,
          bookingMode,
          programType,
          weekStart,
          thisWeekCount: filteredThisWeek.length,
          nextAvailableAt: req.query.learningFormat !== 'small-group' ? summary.nextAvailableAt || null : null,
          bookedThroughDate: summary.bookedThroughYmd || null,
          slots: filteredThisWeek.map((s) => ({ ...s, bookingMode, programType }))
        }
      };
    });

    const validProviders = (providers || []).filter(Boolean);

    res.json({
      ok: true,
      serviceType: 'tutoring',
      agencyId: Number(agency.id),
      agencySlug: agency.slug,
      agencyName: agency.name || '',
      weekStart,
      bookingMode,
      programType,
      introBlurb: serviceTypeRow?.intro_blurb || '',
      stats: {
        totalCount: validProviders.length,
        availableTodayCount: validProviders.filter((p) => {
          const today = new Date().toISOString().slice(0, 10);
          return (p.availability?.slots || []).some((s) => String(s.startAt || '').slice(0, 10) === today);
        }).length,
        virtualOnlyCount: validProviders.filter((p) => p.availability?.programType === 'VIRTUAL').length,
        fastestAvailableAt: validProviders
          .map((p) => p.availability?.nextAvailableAt)
          .filter(Boolean)
          .sort()[0] || null
      },
      providers: validProviders.sort((a, b) => {
        if (a.availability?.nextAvailableAt && b.availability?.nextAvailableAt) {
          return String(a.availability.nextAvailableAt).localeCompare(String(b.availability.nextAvailableAt));
        }
        if (Boolean(a.availability?.nextAvailableAt) !== Boolean(b.availability?.nextAvailableAt)) return a.availability?.nextAvailableAt ? -1 : 1;
        return String(a.displayName || '').localeCompare(String(b.displayName || ''));
      })
    });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// GET /:agencySlug/evaluators — providers enrolled for 'evaluation' service type
// Mirrors listTutors but filtered to the 'evaluation' enrollment bucket.
// ---------------------------------------------------------------------------

export const listEvaluators = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;

    const bookingMode = normalizeBookingMode(req.query.bookingMode || req.query.mode);
    const programType = normalizeProgramType(req.query.programType || req.query.program);
    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const weekStart = startOfWeekMondayYmd(isValidYmd(weekStartRaw) ? weekStartRaw : new Date().toISOString().slice(0, 10));
    const searchQ = String(req.query.search || '').trim().toLowerCase();

    const providerRows = await listEnrolledProviders(agency.id, 'evaluation', {includeDirectory:true});
    const officeLocations = await listPublicProviderOffices(agency.id,providerRows.map(p=>p.id));

    const evaluators = await runWithConcurrency(providerRows, 6, async (row) => {
      const heldSlots = row.online_enrolled !== 0 ? await getHeldSlotStartsForProvider(agency.id, Number(row.id)) : [];
      const summary = row.online_enrolled !== 0 ? await computeProviderWindowSummary({
        agencyId: agency.id,
        providerId: Number(row.id),
        weekStart,
        bookingMode,
        programType,
        heldSlots, officeId:Number(req.query.officeId)||null
      }) : {thisWeek:{virtualSlots:[],inPersonSlots:[]},nextAvailableAt:null};
      const slotSet = normalizeSlots({
        result: summary.thisWeek,
        bookingMode,
        providerAcceptingNewClients: 1,
        profileAcceptingNewClientsOverride: null
      });
      const filteredThisWeek = programType === 'VIRTUAL' ? slotSet.virtual : slotSet.inPerson;

      const displayName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
      if (searchQ && !displayName.toLowerCase().includes(searchQ)) return null;

      // Also check if this evaluator is also enrolled as a tutor (shows tutor profile)
      const tutoringProfile = await getTutoringProfile(Number(row.id), agency.id).catch(() => null);

      return {
        onlineScheduling: row.online_enrolled !== 0,
        officeLocations:officeLocations.get(Number(row.id))||[],
        providerId: Number(row.id),
        id: Number(row.id),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        displayName,
        title: row.title || null,
        profilePhotoUrl: publicUploadsUrlFromStoredPath(row.profile_photo_path || null),
        tutoringProfile: tutoringProfile || undefined,
        availability: {
          bookingMode,
          programType,
          weekStart,
          thisWeekCount: filteredThisWeek.length,
          nextAvailableAt: summary.nextAvailableAt || null,
          slots: filteredThisWeek.map((s) => ({ ...s, bookingMode, programType }))
        }
      };
    });

    const validEvaluators = (evaluators || []).filter(Boolean);

    res.json({
      ok: true,
      serviceType: 'evaluation',
      agencyId: Number(agency.id),
      agencySlug: agency.slug,
      agencyName: agency.name || '',
      weekStart,
      bookingMode,
      programType,
      evaluators: validEvaluators.sort((a, b) => {
        if (a.availability?.nextAvailableAt && b.availability?.nextAvailableAt) {
          return String(a.availability.nextAvailableAt).localeCompare(String(b.availability.nextAvailableAt));
        }
        return String(a.displayName || '').localeCompare(String(b.displayName || ''));
      })
    });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// GET /:agencySlug/providers/:providerId — profile + availability detail
// ---------------------------------------------------------------------------

export const joinProviderWaitlist = async (req,res,next) => {
 try {
  const agency=await requireAgencyBySlug(res,req.params.agencySlug,{directoryOnly:true});if(!agency)return;
  const providerId=parseIntSafe(req.params.providerId),serviceType=normalizeServiceType(req.body?.serviceType);
  const provider=(await listEnrolledProviders(agency.id,serviceType,{includeDirectory:true})).find(p=>Number(p.id)===providerId);
  if(!provider)return res.status(404).json({error:{message:'Provider not found'}});
  const profile=await ProviderPublicProfile.getForProvider({providerUserId:providerId});
  const format=String(req.body?.format||'').toUpperCase();
  const key={IN_PERSON:'officeAvailability',VIRTUAL:'virtualAvailability',SCHOOL:'schoolAvailability'}[format];
  if(!key)return res.status(400).json({error:{message:'Choose in-person, virtual, or school-based support.'}});
  if(profile?.details?.waitlistEnabled!==true && profile?.details?.[key]!=='waitlist')return res.status(409).json({error:{message:'This provider is not accepting waitlist requests for that format. Please inquire with our team.'}});
  const {createPublicAgencySupportTicket}=await import('../services/publicAgencySupport.service.js');
  const result=await createPublicAgencySupportTicket(agency.slug,{...req.body,category:'provider',message:`Please add me to the ${format.toLowerCase().replace('_','-')} ${serviceType} waitlist for ${provider.first_name} ${provider.last_name}.\n${String(req.body?.message||'').slice(0,2000)}`},req,{providerWaitlist:{providerId,serviceType,format,providerName:`${provider.first_name} ${provider.last_name}`}});
  if(result.suppressed)return res.status(201).json({ok:true});
  res.status(201).json({ok:true,ticketId:result.ticketId});
 }catch(error){if(error.status)return res.status(error.status).json({error:{message:error.message}});next(error);}
};

export const getProviderScheduleSummary = async (req,res,next) => {
 try {
  const agency=await requireAgencyBySlug(res,req.params.agencySlug,{directoryOnly:true});if(!agency)return;
  const providerId=parseIntSafe(req.params.providerId),serviceType=normalizeServiceType(req.query.serviceType);
  const directory=await listEnrolledProviders(agency.id,serviceType,{includeDirectory:true});
  const provider=directory.find(p=>Number(p.id)===providerId);
  if(!provider)return res.status(404).json({error:{message:'Provider not found'}});
  const {readPublicProviderSchedule}=await import('../services/publicProviderSchedule.service.js');
  const schedule=await readPublicProviderSchedule(providerId,agency.id,{officeId:Number(req.query.officeId)||null});
  res.json({...schedule,onlineScheduling:Boolean(agency.public_availability_enabled)&&provider.online_enrolled!==0});
 }catch(error){next(error);}
};

export const getProviderDetail = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug,{directoryOnly:true});
    if (!agency) return;

    const providerId = parseIntSafe(req.params.providerId);
    if (!providerId) return res.status(400).json({ error: { message: 'Invalid providerId' } });

    const serviceType = normalizeServiceType(req.query.serviceType);
    const directory = await listEnrolledProviders(agency.id, serviceType, {includeDirectory:true});
    const listing = directory.find(p => Number(p.id)===providerId);
    if (!listing) return res.status(404).json({error:{message:'Provider not found'}});
    const officeLocations = (await listPublicProviderOffices(agency.id,[providerId])).get(providerId)||[];
    const savedTutoringProfile = serviceType === 'tutoring' ? await getTutoringProfile(providerId, agency.id) : null;
    const onlineScheduling = Boolean(agency.public_availability_enabled) && listing.online_enrolled !== 0 && (serviceType !== 'tutoring' || Boolean(savedTutoringProfile));

    const [userRows] = await pool.execute(
      `SELECT id, first_name, last_name, role, profile_photo_path, service_focus, title, credential,
              provider_accepting_new_clients, in_office_available
       FROM users
       WHERE id = ?
         AND (is_active IS NULL OR is_active = TRUE)
         AND (is_archived IS NULL OR is_archived = FALSE)
       LIMIT 1`,
      [providerId]
    );
    const user = userRows?.[0];
    if (!user) return res.status(404).json({ error: { message: 'Provider not found' } });

    const bookingMode = normalizeBookingMode(req.query.bookingMode || req.query.mode);
    const programType = normalizeProgramType(req.query.programType || req.query.program);
    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const weekStart = startOfWeekMondayYmd(isValidYmd(weekStartRaw) ? weekStartRaw : new Date().toISOString().slice(0, 10));

    const heldSlots = onlineScheduling ? await getHeldSlotStartsForProvider(agency.id, providerId) : [];
    const summary = onlineScheduling ? await computeProviderWindowSummary({ agencyId: agency.id, providerId, weekStart, bookingMode, programType, heldSlots, officeId:Number(req.query.officeId)||null }) : {thisWeek:{virtualSlots:[],inPersonSlots:[]},nextAvailableAt:null};
    const profileData = await ProviderPublicProfile.getForProvider({ providerUserId: providerId }) || {};
    profileData.acceptingNewClientsOverride = Boolean(user.provider_accepting_new_clients ?? profileData.acceptingNewClientsOverride ?? true);
    if(!publicFormatEnabled(profileData,programType,bookingMode))summary.nextAvailableAt=null;
    const profile = await resolveProviderProfileSummary({ agencyId: agency.id, providerUserId: providerId, serviceType });
    if (serviceType === 'tutoring' && !savedTutoringProfile) {
      profile.selfPayRateCents = null; profile.selfPayRateLabel = null; profile.selfPayRateNote = null;
    }
    const slotSet = normalizeSlots({
      result: summary.thisWeek,
      bookingMode,
      profile: profileData
    });
    let filteredThisWeek = programType === 'VIRTUAL' ? slotSet.virtual : slotSet.inPerson;

    let specialtyData = null;
    let tutoringProfile = null;
    if (serviceType === 'counseling') {
      specialtyData = await getCounselingSpecialties(providerId, agency.id);
    } else if (serviceType === 'tutoring') {
      tutoringProfile = savedTutoringProfile;
      if(tutoringProfile){const catalog=await readLearningCatalog(agency.id);tutoringProfile.hourlyRates=Object.fromEntries(['virtual','in-person','small-group'].map(format=>[format,hourlyRate(catalog,tutoringProfile.learning,'tutoring',format)]));tutoringProfile.packages=catalog.packages.filter(p=>p.published&&tutoringProfile.learning.programs.includes(p.program)).map(p=>pricePackage(catalog,p,{tutoring:{profile:tutoringProfile.learning,providerId}}));}
    }


    res.json({
      ok: true,
      serviceType,
      agency: { id: agency.id, slug: agency.slug, name: agency.name },
      provider: {
        acceptingNewClients: Boolean(summary.nextAvailableAt) || (Boolean(profileData.acceptingNewClientsOverride) && tutoringProfile?.acceptingNewStudents !== false),
        onlineScheduling,
        officeLocations,
        providerId,
        id: providerId,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        title: user.title || null,
        credential: user.credential || '',
        profilePhotoUrl: publicUploadsUrlFromStoredPath(user.profile_photo_path || null),
        serviceFocus: user.service_focus || null,
        ...(specialtyData || {}),
        tutoringProfile: tutoringProfile || undefined
      },
      profile: {
        details: profile.details || {},
          publicBlurb: profile.publicBlurb || '',
        insurancesAccepted: Array.isArray(profile.insurances) ? profile.insurances : [],
        acceptedInsurances: Array.isArray(profile.acceptedInsurances) ? profile.acceptedInsurances : [],
        selfPayRateCents: profile.selfPayRateCents ?? null,
        selfPayRateLabel: profile.selfPayRateLabel || null,
        selfPayRateNote: profile.selfPayRateNote || null
      },
      availability: {
        bookingMode,
        programType,
        weekStart,
        thisWeekCount: filteredThisWeek.length,
        nextAvailableAt: summary.nextAvailableAt || null,
        slots: filteredThisWeek.map((s) => ({ ...s, bookingMode, programType }))
      }
    });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// Email notification helpers
// ---------------------------------------------------------------------------

function mysqlDateTimeToIso(val) {
  if (!val) return null;
  const s = String(val).replace(' ', 'T');
  return s.length > 10 ? s : null;
}

async function sendNewBookingNotification({ agencyId, agencyName, created, serviceType, providerDisplayName, subjectArea, clientGradeLevel, intakeCreated = null }) {
  if (!EmailService.isConfigured()) return;

  const start = mysqlDateTimeToIso(created?.requested_start_at) || created?.requested_start_at;
  const end = mysqlDateTimeToIso(created?.requested_end_at) || created?.requested_end_at;
  const timeLabel = start && end
    ? `${new Date(start).toLocaleString()} – ${new Date(end).toLocaleTimeString()}`
    : 'requested time';
  const modality = String(created?.modality || '').toUpperCase() === 'VIRTUAL' ? 'Virtual' : 'In-Person';
  const clientName = String(created?.client_name || 'Client').trim();
  const clientEmail = String(created?.client_email || '').trim();
  const svcLabel = serviceType === 'tutoring' ? 'Tutoring' : 'Counseling';

  const confirmSubject = `Your ${svcLabel} booking request has been received — ${agencyName}`;
  const intakeStart = intakeCreated?.requested_start_at ? mysqlDateTimeToIso(intakeCreated.requested_start_at) : null;
  const intakeEnd = intakeCreated?.requested_end_at ? mysqlDateTimeToIso(intakeCreated.requested_end_at) : null;
  const intakeTimeLabel = intakeStart && intakeEnd
    ? `${new Date(intakeStart).toLocaleString()} – ${new Date(intakeEnd).toLocaleTimeString()}`
    : null;

  const confirmLines = [
    `Hi ${clientName},`,
    '',
    `We received your ${svcLabel.toLowerCase()} booking request. Here are the details:`,
    '',
    `Session — Provider: ${providerDisplayName}`,
    `Session — Time: ${timeLabel}`,
    `Session — Type: ${modality}`,
    ...(subjectArea ? [`Subject: ${subjectArea}`] : []),
    ...(clientGradeLevel ? [`Grade level: ${clientGradeLevel}`] : []),
    ...(intakeTimeLabel ? ['', `Intake/Evaluation — Time: ${intakeTimeLabel}`, `Intake/Evaluation — With: ${providerDisplayName}`] : []),
    '',
    'Our team will review your request and follow up to confirm. No payment is collected at this time.',
    '',
    `— ${agencyName}`
  ];
  const confirmHtml = `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:520px">
    <p>Hi <strong>${clientName}</strong>,</p>
    <p>We received your <strong>${svcLabel.toLowerCase()}</strong> booking request. Here are the details:</p>
    <p style="font-weight:600;font-size:13px;margin:12px 0 4px">Session appointment</p>
    <table style="border-collapse:collapse;margin:0 0 12px">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Provider</td><td style="font-size:13px">${providerDisplayName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Time</td><td style="font-size:13px">${timeLabel}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Type</td><td style="font-size:13px">${modality}</td></tr>
      ${subjectArea ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Subject</td><td style="font-size:13px">${subjectArea}</td></tr>` : ''}
      ${clientGradeLevel ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Grade level</td><td style="font-size:13px">${clientGradeLevel}</td></tr>` : ''}
    </table>
    ${intakeTimeLabel ? `
    <p style="font-weight:600;font-size:13px;margin:12px 0 4px">Intake &amp; evaluation</p>
    <table style="border-collapse:collapse;margin:0 0 12px">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Provider</td><td style="font-size:13px">${providerDisplayName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Time</td><td style="font-size:13px">${intakeTimeLabel}</td></tr>
    </table>` : ''}
    <p style="color:#6b7280;font-size:13px">Our team will review your request and follow up to confirm. No payment is collected at this time.</p>
    <p style="color:#9ca3af;font-size:12px">— ${agencyName}</p>
  </div>`;

  // Confirmation to client
  if (clientEmail) {
    try {
      await EmailService.sendEmail({
        to: clientEmail,
        subject: confirmSubject,
        text: confirmLines.join('\n'),
        html: confirmHtml,
        fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || agencyName,
        fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
        replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
        source: 'auto',
        agencyId: Number(agencyId)
      });
    } catch { /* non-fatal */ }
  }

  // Alert to the provider
  try {
    const [providerRows] = await pool.execute(
      `SELECT u.email, u.first_name, u.last_name
       FROM users u
       WHERE u.id = ?
       LIMIT 1`,
      [Number(created?.provider_id || 0)]
    );
    const provider = providerRows?.[0];
    if (provider?.email) {
      const alertSubject = `New ${svcLabel.toLowerCase()} booking request — ${clientName}`;
      const alertHtml = `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:520px">
        <p>A new public booking request has been submitted for <strong>${provider.first_name || ''}</strong>.</p>
        <table style="border-collapse:collapse;margin:12px 0">
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Client</td><td style="font-size:13px">${clientName} (${clientEmail})</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Time</td><td style="font-size:13px">${timeLabel}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Session type</td><td style="font-size:13px">${modality}</td></tr>
          ${subjectArea ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Subject</td><td style="font-size:13px">${subjectArea}</td></tr>` : ''}
          ${clientGradeLevel ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Grade level</td><td style="font-size:13px">${clientGradeLevel}</td></tr>` : ''}
        </table>
        <p style="color:#6b7280;font-size:13px">Review this request in the <strong>Availability Intake → Appointments</strong> tab in your admin portal.</p>
      </div>`;
      await EmailService.sendEmail({
        to: provider.email,
        subject: alertSubject,
        text: `New booking request from ${clientName} for ${timeLabel} (${modality}).`,
        html: alertHtml,
        fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || agencyName,
        fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
        source: 'auto',
        agencyId: Number(agencyId)
      });
    }
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// GET /:agencySlug/providers/:providerId/slots — available slots for intake picker
// Public endpoint; returns the same held-slot-aware availability used by the finders.
// ---------------------------------------------------------------------------

export const getProviderSlots = async (req, res, next) => {
  try {
    if (normalizeBookingMode(req.query.bookingMode || req.query.mode) === 'NEW_CLIENT') {
      return getProviderDetail(req, { status: (code) => res.status(code), json: (data) => res.json({ ok: true, weekStart: data.availability.weekStart, slots: data.availability.slots }) }, next);
    }
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;

    const providerId = parseIntSafe(req.params.providerId);
    if (!providerId) return res.status(400).json({ error: { message: 'Invalid providerId' } });

    const bookingMode = normalizeBookingMode(req.query.bookingMode || req.query.mode);
    const programType = normalizeProgramType(req.query.programType || req.query.program);
    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const weekStart = startOfWeekMondayYmd(isValidYmd(weekStartRaw) ? weekStartRaw : new Date().toISOString().slice(0, 10));

    // Confirm provider is enrolled for at least one service type with this agency
    const [enrolledRow] = await pool.execute(
      `SELECT id FROM provider_public_service_enrollments
       WHERE agency_id = ? AND user_id = ? AND is_active = 1 LIMIT 1`,
      [agency.id, providerId]
    );
    if (!enrolledRow?.[0]) return res.status(404).json({ error: { message: 'Provider not found' } });

    const heldSlots = await getHeldSlotStartsForProvider(agency.id, providerId);
    const result = await ProviderAvailabilityService.computeWeekAvailability({
      agencyId: agency.id,
      providerId,
      weekStartYmd: weekStart,
      includeGoogleBusy: true,
      externalCalendarIds: [],
      slotMinutes: 60,
      intakeOnly: String(bookingMode || 'NEW_CLIENT') === 'NEW_CLIENT'
    }).catch(() => null);

    const calendarProfile = await ProviderPublicProfile.getForProvider({providerUserId:providerId}) || {};
    const [[calendarUser]]=await pool.execute('SELECT provider_accepting_new_clients FROM users WHERE id=?',[providerId]);
    calendarProfile.acceptingNewClientsOverride ??= Boolean(calendarUser?.provider_accepting_new_clients);
    const inPersonSlots = filterHeldSlots(dedupeSlots(publicFormatEnabled(calendarProfile,'IN_PERSON',bookingMode)?result?.inPersonSlots || []:[]), heldSlots)
      .map((s) => ({ ...s, modality: 'IN_PERSON', programType: 'IN_PERSON' }));
    const virtualSlots = filterHeldSlots(dedupeSlots(publicFormatEnabled(calendarProfile,'VIRTUAL',bookingMode)?result?.virtualSlots || []:[]), heldSlots)
      .map((s) => ({ ...s, modality: 'VIRTUAL', programType: 'VIRTUAL' }));

    const slots = programType === 'VIRTUAL'
      ? virtualSlots
      : [...inPersonSlots, ...virtualSlots].sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));

    res.json({ ok: true, weekStart, slots });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// POST /:agencySlug/requests — create booking request
// ---------------------------------------------------------------------------

export const createBookingRequest = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;

    const serviceType = normalizeServiceType(req.body?.serviceType);
    const providerId = parseIntSafe(req.body?.providerId);
    if (!providerId) return res.status(400).json({ error: { message: 'providerId is required' } });

    const enrolledIds = await getEnrolledProviderIds(agency.id, serviceType);
    if (!enrolledIds.has(providerId)) {
      return res.status(400).json({ error: { message: 'Provider is not enrolled in this service' } });
    }

    const modality = String(req.body?.modality || '').trim().toUpperCase();
    if (modality !== 'VIRTUAL' && modality !== 'IN_PERSON') {
      return res.status(400).json({ error: { message: 'modality must be VIRTUAL or IN_PERSON' } });
    }

    const bookingMode = normalizeBookingMode(req.body?.bookingMode);
    const programType = normalizeProgramType(req.body?.programType);
    const startAt = String(req.body?.startAt || '').trim();
    const endAt = String(req.body?.endAt || '').trim();
    if (!startAt || !endAt) return res.status(400).json({ error: { message: 'startAt and endAt are required' } });

    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    if (!name || !email) return res.status(400).json({ error: { message: 'name and email are required' } });

    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: { message: 'Invalid startAt/endAt' } });
    }

    // Duplicate-request guard — reject if there's already a non-cancelled/declined
    // request for the same provider at the same start time.
    const [dupRows] = await pool.execute(
      `SELECT id FROM public_appointment_requests
       WHERE provider_id = ?
         AND requested_start_at = ?
         AND UPPER(COALESCE(status, 'PENDING')) NOT IN ('DECLINED', 'CANCELLED')
       LIMIT 1`,
      [providerId, start.toISOString().slice(0, 19).replace('T', ' ')]
    );
    if (dupRows?.[0]) {
      return res.status(409).json({
        error: { message: 'This time slot has already been requested. Please choose another time.' }
      });
    }

    const availabilityProfile=await ProviderPublicProfile.getForProvider({providerUserId:providerId}) || {};
    const [[availabilityUser]]=await pool.execute('SELECT provider_accepting_new_clients FROM users WHERE id=?',[providerId]);
    availabilityProfile.acceptingNewClientsOverride ??= Boolean(availabilityUser?.provider_accepting_new_clients);
    if(!publicFormatEnabled(availabilityProfile,modality,bookingMode))return res.status(409).json({error:{message:'This appointment format is not currently accepting new clients.'}});
    // Validate slot is still available
    const weekStartYmd = start.toISOString().slice(0, 10);
    const availability = await ProviderAvailabilityService.computeWeekAvailability({
      agencyId: agency.id,
      providerId,
      weekStartYmd,
      includeGoogleBusy: true,
      externalCalendarIds: [],
      slotMinutes: 60,
      intakeOnly: bookingMode === 'NEW_CLIENT'
    });
    const list = modality === 'VIRTUAL' ? availability.virtualSlots : availability.inPersonSlots;
    const wantedKey = `${start.toISOString()}|${end.toISOString()}`;
    const slotOk = (list || []).some((s) => `${s.startAt}|${s.endAt}` === wantedKey);
    if (!slotOk) {
      return res.status(409).json({ error: { message: 'Requested time is no longer available' } });
    }

    let matchedClientId = null;
    const clientInitials = String(req.body?.clientInitials || '').trim();
    if (bookingMode === 'CURRENT_CLIENT') {
      if (!clientInitials) return res.status(400).json({ error: { message: 'clientInitials required for current client booking' } });
      const [clientRows] = await pool.execute(
        `SELECT id FROM clients WHERE provider_id = ? AND LOWER(COALESCE(initials,'')) = ? AND (status IS NULL OR UPPER(status) <> 'ARCHIVED') ORDER BY id DESC LIMIT 1`,
        [providerId, clientInitials.toLowerCase()]
      );
      if (!clientRows?.[0]) {
        return res.status(404).json({ error: { message: 'No current client match found' } });
      }
      matchedClientId = Number(clientRows[0].id);
    }

    let createdClientId = null;
    let createdGuardianUserId = null;
    if (bookingMode === 'NEW_CLIENT') {
      const fullName = String(req.body?.clientFullName || name).trim();
      const guardianEmail = String(req.body?.guardianEmail || email).trim();
      const guardianFirstName = String(req.body?.guardianFirstName || '').trim();
      if (fullName && guardianEmail && guardianFirstName) {
        // Phase 6: all NEW_CLIENT public bookings (coaching/consulting/tutoring/counseling/eval)
        // create at prospective. Intake-link packet flows keep default packet.
        const selfContact =
          isPractitionerOrgType(agency.organization_type)
          || serviceType === 'coaching'
          || serviceType === 'consulting';
        try {
          const organizationId = await resolveOrganizationIdForPublicBooking({
            agencyId: agency.id,
            organizationIdHint: agency.id,
            serviceType
          });
          if (!organizationId) {
            console.warn('[createBookingRequest] no intake-capable organization for agency', {
              agencyId: agency.id,
              serviceType
            });
          } else {
            const result = await PublicIntakeClientService.createClientAndGuardian({
              link: { scope_type: 'agency', organization_id: organizationId, create_guardian: true, create_client: true },
              payload: {
                organizationId,
                client: { fullName, initials: clientInitials || null, contactPhone: String(req.body?.phone || '').trim() || null },
                guardian: {
                  firstName: guardianFirstName,
                  lastName: String(req.body?.guardianLastName || '').trim() || null,
                  email: guardianEmail,
                  phone: String(req.body?.guardianPhone || req.body?.phone || '').trim() || null,
                  relationship: String(req.body?.guardianRelationship || (selfContact ? 'Self / Contact' : 'Guardian')).trim()
                }
              },
              options: { ...PUBLIC_BOOKING_INQUIRY_CLIENT_OPTIONS }
            });
            createdClientId = Number(result?.clients?.[0]?.id || 0) || null;
            createdGuardianUserId = Number(result?.guardianUser?.id || 0) || null;
            if (createdClientId) {
              await pool.execute(`UPDATE clients SET provider_id = ? WHERE id = ?`, [providerId, createdClientId]);
            }
          }
        } catch (err) {
          console.warn('[createBookingRequest] client provision failed', {
            agencyId: agency.id,
            serviceType,
            message: err?.message || err
          });
        }
      }
    }

    // Build extra columns for service_type/subject/grade (migration 844)
    const subjectArea = String(req.body?.subjectArea || '').trim() || null;
    const clientGradeLevel = String(req.body?.clientGradeLevel || '').trim() || null;

    // --- Evaluation-required flow (migration 868) ---
    // evalRequired=true means client self-reported no recent assessments and an
    // evaluation must happen before the session.  In this case:
    //   - evalProviderId / evalStartAt / evalEndAt describe the eval appointment
    //   - The session request is created with status='PENDING_EVAL' (blocked)
    //   - The eval request is created with status='PENDING' and appointment_role='evaluation'
    const evalRequired = req.body?.evalRequired === true || req.body?.evalRequired === 'true';
    const evalProviderId = parseIntSafe(req.body?.evalProviderId) || providerId; // defaults to same provider
    const evalStartAt = String(req.body?.evalStartAt || '').trim();
    const evalEndAt = String(req.body?.evalEndAt || '').trim();

    if (evalRequired && (!evalStartAt || !evalEndAt)) {
      return res.status(400).json({ error: { message: 'evalStartAt and evalEndAt are required when evalRequired is true' } });
    }

    // Derive session_type from serviceType
    const sessionType = serviceType === 'tutoring' ? 'tutoring' : 'counseling';

    const created = await PublicAppointmentRequest.create({
      agencyId: agency.id,
      providerId,
      modality,
      bookingMode,
      programType,
      requestedStartAt: start.toISOString().slice(0, 19).replace('T', ' '),
      requestedEndAt: end.toISOString().slice(0, 19).replace('T', ' '),
      clientName: name,
      clientEmail: email,
      clientPhone: req.body?.phone ?? null,
      clientInitials: clientInitials || null,
      matchedClientId,
      createdClientId,
      createdGuardianUserId,
      notes: req.body?.notes ?? null
    });

    // Patch service_type, session_type, subject, grade, appointment_role, eval_required
    // and – for eval-required flow – set status to PENDING_EVAL (session is blocked).
    const sessionStatus = evalRequired ? 'PENDING_EVAL' : 'PENDING';
    if (created?.id) {
      await pool.execute(
        `UPDATE public_appointment_requests
         SET service_type = ?, session_type = ?, subject_area = ?, client_grade_level = ?,
             appointment_role = 'session', eval_required = ?, status = ?
         WHERE id = ?`,
        [serviceType || null, sessionType, subjectArea, clientGradeLevel,
          evalRequired ? 1 : 0, sessionStatus, created.id]
      );
    }

    // --- Evaluation appointment (eval-required path) ---
    let evalCreated = null;
    if (evalRequired && created?.id) {
      const evalStart = new Date(evalStartAt);
      const evalEnd = new Date(evalEndAt);
      if (!Number.isNaN(evalStart.getTime()) && !Number.isNaN(evalEnd.getTime()) && evalEnd > evalStart) {
        // Validate eval slot not already held
        const [evalDupRows] = await pool.execute(
          `SELECT id FROM public_appointment_requests
           WHERE provider_id = ?
             AND requested_start_at = ?
             AND UPPER(COALESCE(status, 'PENDING')) NOT IN ('DECLINED', 'CANCELLED', 'PENDING_EVAL')
           LIMIT 1`,
          [evalProviderId, evalStart.toISOString().slice(0, 19).replace('T', ' ')]
        );
        if (!evalDupRows?.[0]) {
          try {
            const evalModality = modality; // inherit from main request
            evalCreated = await PublicAppointmentRequest.create({
              agencyId: agency.id,
              providerId: evalProviderId,
              modality: evalModality,
              bookingMode,
              programType,
              requestedStartAt: evalStart.toISOString().slice(0, 19).replace('T', ' '),
              requestedEndAt: evalEnd.toISOString().slice(0, 19).replace('T', ' '),
              clientName: name,
              clientEmail: email,
              clientPhone: req.body?.phone ?? null,
              clientInitials: clientInitials || null,
              matchedClientId,
              createdClientId,
              createdGuardianUserId,
              notes: req.body?.notes ?? null
            });
            if (evalCreated?.id) {
              // Eval request: PENDING, role = evaluation, paired back to session
              await pool.execute(
                `UPDATE public_appointment_requests
                 SET service_type = ?, session_type = 'evaluation', subject_area = ?,
                     client_grade_level = ?, appointment_role = 'evaluation',
                     eval_required = 0, paired_request_id = ?
                 WHERE id = ?`,
                [serviceType || null, subjectArea, clientGradeLevel, created.id, evalCreated.id]
              );
              // Back-link session to eval
              await pool.execute(
                `UPDATE public_appointment_requests SET paired_request_id = ? WHERE id = ?`,
                [evalCreated.id, created.id]
              );
            }
          } catch { /* non-fatal — main booking still succeeded */ }
        }
      }
    }

    // --- Optional paired intake/evaluation appointment (legacy opt-in, non-required path) ---
    // Only runs when evalRequired is false (backward compatible with existing intake step).
    let intakeCreated = null;
    const intakePayload = (!evalRequired) ? req.body?.intakeAppointment : null;
    if (created?.id && intakePayload && intakePayload.startAt && intakePayload.endAt) {
      const intakeStart = new Date(intakePayload.startAt);
      const intakeEnd = new Date(intakePayload.endAt);
      const intakeModality = String(intakePayload.modality || modality).toUpperCase() === 'VIRTUAL' ? 'VIRTUAL' : 'IN_PERSON';
      // Validate intake slot isn't already held
      const [intakeDupRows] = await pool.execute(
        `SELECT id FROM public_appointment_requests
         WHERE provider_id = ?
           AND requested_start_at = ?
           AND UPPER(COALESCE(status, 'PENDING')) NOT IN ('DECLINED', 'CANCELLED')
         LIMIT 1`,
        [providerId, intakeStart.toISOString().slice(0, 19).replace('T', ' ')]
      );
      if (!intakeDupRows?.[0] && !Number.isNaN(intakeStart.getTime()) && !Number.isNaN(intakeEnd.getTime()) && intakeEnd > intakeStart) {
        try {
          intakeCreated = await PublicAppointmentRequest.create({
            agencyId: agency.id,
            providerId,
            modality: intakeModality,
            bookingMode,
            programType,
            requestedStartAt: intakeStart.toISOString().slice(0, 19).replace('T', ' '),
            requestedEndAt: intakeEnd.toISOString().slice(0, 19).replace('T', ' '),
            clientName: name,
            clientEmail: email,
            clientPhone: req.body?.phone ?? null,
            clientInitials: clientInitials || null,
            matchedClientId,
            createdClientId,
            createdGuardianUserId,
            notes: req.body?.notes ?? null
          });
          if (intakeCreated?.id) {
            await pool.execute(
              `UPDATE public_appointment_requests
               SET service_type = ?, subject_area = ?, client_grade_level = ?,
                   appointment_role = 'intake', paired_request_id = ?
               WHERE id = ?`,
              [serviceType || null, subjectArea || null, clientGradeLevel || null, created.id, intakeCreated.id]
            );
            // Back-link the session to the intake
            await pool.execute(
              `UPDATE public_appointment_requests SET paired_request_id = ? WHERE id = ?`,
              [intakeCreated.id, created.id]
            );
          }
        } catch { /* non-fatal — main booking still succeeded */ }
      }
    }

    // Fire-and-forget email notifications (client confirmation + provider alert)
    if (created?.id) {
      const [providerNameRows] = await pool.execute(
        `SELECT CONCAT(first_name, ' ', last_name) AS display_name FROM users WHERE id = ? LIMIT 1`,
        [providerId]
      );
      const providerDisplayName = providerNameRows?.[0]?.display_name?.trim() || `Provider #${providerId}`;
      created.client_name = name;
      created.client_email = email;
      created.provider_id = providerId;
      created.modality = modality;
      created.requested_start_at = created.requested_start_at ?? start.toISOString().slice(0, 19).replace('T', ' ');
      created.requested_end_at = created.requested_end_at ?? end.toISOString().slice(0, 19).replace('T', ' ');
      sendNewBookingNotification({
        agencyId: agency.id,
        agencyName: agency.name || `Agency ${agency.id}`,
        created,
        serviceType,
        providerDisplayName,
        subjectArea,
        clientGradeLevel,
        intakeCreated: evalCreated || intakeCreated || null
      }).catch(() => {});
    }

    res.status(201).json({
      ok: true,
      request: {
        id: created?.id ?? null,
        agencyId: agency.id,
        providerId,
        serviceType,
        sessionType,
        modality,
        bookingMode,
        programType,
        subjectArea,
        clientGradeLevel,
        appointmentRole: 'session',
        evalRequired,
        requestedStartAt: created?.requested_start_at ?? null,
        requestedEndAt: created?.requested_end_at ?? null,
        status: sessionStatus
      },
      evalRequest: evalCreated?.id ? {
        id: evalCreated.id,
        appointmentRole: 'evaluation',
        sessionType: 'evaluation',
        providerId: evalProviderId,
        requestedStartAt: evalCreated.requested_start_at ?? null,
        requestedEndAt: evalCreated.requested_end_at ?? null,
        status: 'PENDING'
      } : null,
      intakeRequest: intakeCreated?.id ? {
        id: intakeCreated.id,
        appointmentRole: 'intake',
        providerId,
        requestedStartAt: intakeCreated.requested_start_at ?? null,
        requestedEndAt: intakeCreated.requested_end_at ?? null,
        status: 'PENDING'
      } : null
    });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// GET /:agencySlug/enrollment — list enrolled providers (admin helper)
// GET /:agencySlug/enrollment/options — available providers to enroll
// POST /:agencySlug/enrollment — upsert enrollment
// DELETE /:agencySlug/enrollment/:userId — remove enrollment
// ---------------------------------------------------------------------------

export const listEnrollments = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;

    const serviceType = normalizeServiceType(req.query.serviceType);
    const [rows] = await pool.execute(
      `SELECT e.id, e.user_id, e.service_type, e.is_active, e.enrolled_at,
              u.first_name, u.last_name, u.role, u.profile_photo_path
       FROM provider_public_service_enrollments e
       JOIN users u ON u.id = e.user_id
       WHERE e.agency_id = ? AND e.service_type = ?
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [Number(agency.id), serviceType]
    );

    res.json({ ok: true, serviceType, enrollments: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const upsertEnrollment = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;

    const serviceType = normalizeServiceType(req.body?.serviceType);
    const userId = parseIntSafe(req.body?.userId);
    if (!userId) return res.status(400).json({ error: { message: 'userId required' } });
    const isActive = req.body?.isActive === false || req.body?.isActive === 0 ? 0 : 1;

    await pool.execute(
      `INSERT INTO provider_public_service_enrollments (agency_id, user_id, service_type, is_active)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_active = VALUES(is_active), updated_at = CURRENT_TIMESTAMP`,
      [Number(agency.id), userId, serviceType, isActive]
    );

    res.json({ ok: true, agencyId: Number(agency.id), userId, serviceType, isActive: !!isActive });
  } catch (e) {
    next(e);
  }
};

export const removeEnrollment = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;

    const userId = parseIntSafe(req.params.userId);
    const serviceType = normalizeServiceType(req.query.serviceType || req.body?.serviceType);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    await pool.execute(
      `DELETE FROM provider_public_service_enrollments
       WHERE agency_id = ? AND user_id = ? AND service_type = ?`,
      [Number(agency.id), userId, serviceType]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// GET/PUT /:agencySlug/tutoring-profiles/:userId — tutoring profile CRUD
// ---------------------------------------------------------------------------

export const getTutoringProfileForUser = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;
    const userId = parseIntSafe(req.params.userId);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid userId' } });
    const profile = await getTutoringProfile(userId, agency.id);
    res.json({ ok: true, profile: profile || null });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// POST /:agencySlug/service-types — agency admin upserts a service type config
// ---------------------------------------------------------------------------

export const upsertAgencyServiceType = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;

    const serviceType = normalizeServiceType(req.body?.serviceType);
    const displayName = String(req.body?.displayName || '').trim() || null;
    const introBlurb = req.body?.introBlurb !== undefined ? String(req.body.introBlurb || '').trim() || null : null;
    const heroImageUrl = req.body?.heroImageUrl !== undefined ? String(req.body.heroImageUrl || '').trim() || null : null;
    const isEnabled = req.body?.isEnabled === false || req.body?.isEnabled === 0 ? 0 : 1;
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;

    if (isEnabled) {
      try {
        const {
          getCapabilitiesForAgency,
          isPublicServiceTypeAllowed
        } = await import('../services/businessTypeCapabilities.service.js');
        const caps = await getCapabilitiesForAgency(agency.id, {
          ensureDefaults: true,
          organizationType: agency.organization_type || agency.organizationType
        });
        const allowedRows = (caps.enabledBusinessTypes || []).map((businessType) => ({
          businessType,
          isEnabled: true
        }));
        if (allowedRows.length && !isPublicServiceTypeAllowed(serviceType, allowedRows)) {
          return res.status(400).json({
            error: {
              message: `Public service type "${serviceType}" is not allowed for this tenant’s enabled business types. Enable the matching tenant service type first.`,
              code: 'BUSINESS_TYPE_GATE',
              allowedPublicServiceTypes: caps.allowedPublicServiceTypes || []
            }
          });
        }
      } catch {
        /* if catalog missing, allow legacy behavior */
      }
    }

    await pool.execute(
      `INSERT INTO agency_public_service_types
         (agency_id, service_type, display_name, intro_blurb, hero_image_url, is_enabled, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         intro_blurb = VALUES(intro_blurb),
         hero_image_url = VALUES(hero_image_url),
         is_enabled = VALUES(is_enabled),
         sort_order = VALUES(sort_order),
         updated_at = CURRENT_TIMESTAMP`,
      [
        Number(agency.id), serviceType,
        displayName, introBlurb, heroImageUrl, isEnabled, sortOrder
      ]
    );

    res.json({ ok: true, agencyId: Number(agency.id), serviceType, isEnabled: !!isEnabled });
  } catch (e) {
    next(e);
  }
};

export const upsertTutoringProfile = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;
    const userId = parseIntSafe(req.params.userId);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const existingProfile = req.body?.learning === undefined ? await getTutoringProfile(userId, agency.id) : null;
    const learning = normalizeLearningProfile(req.body?.learning ?? existingProfile?.learning ?? {});
    const subjectAreas = Array.isArray(req.body?.subjectAreas) ? req.body.subjectAreas : [];
    const gradeLevels = Array.isArray(req.body?.gradeLevels) ? req.body.gradeLevels : [];
    const sessionRateCents = req.body?.sessionRateCents !== undefined ? parseIntSafe(req.body.sessionRateCents) : null;
    const sessionRateNote = req.body?.sessionRateNote !== undefined ? String(req.body.sessionRateNote || '').trim() : null;
    const bio = req.body?.bio !== undefined ? String(req.body.bio || '').trim() : null;
    const acceptingNewStudents = req.body?.acceptingNewStudents === false || req.body?.acceptingNewStudents === 0 ? 0 : 1;
    const minSessionPackage = req.body?.minSessionPackage !== undefined ? Math.max(1, Math.min(10, parseIntSafe(req.body.minSessionPackage) || 1)) : 1;
    const paymentPolicy = ['PREPAY', 'POST_SESSION'].includes(String(req.body?.paymentPolicy || '').toUpperCase())
      ? String(req.body.paymentPolicy).toUpperCase()
      : 'POST_SESSION';

    await pool.execute(
      `INSERT INTO provider_tutoring_profiles
         (user_id, agency_id, subject_areas_json, grade_levels_json, session_rate_cents, session_rate_note, bio, accepting_new_students, min_session_package, payment_policy, learning_settings_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         subject_areas_json = VALUES(subject_areas_json),
         grade_levels_json = VALUES(grade_levels_json),
         session_rate_cents = VALUES(session_rate_cents),
         session_rate_note = VALUES(session_rate_note),
         bio = VALUES(bio),
         accepting_new_students = VALUES(accepting_new_students),
         min_session_package = VALUES(min_session_package),
         payment_policy = VALUES(payment_policy),
         learning_settings_json = VALUES(learning_settings_json),
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId, Number(agency.id),
        JSON.stringify(subjectAreas),
        JSON.stringify(gradeLevels),
        sessionRateCents || null,
        sessionRateNote || null,
        bio || null,
        acceptingNewStudents,
        minSessionPackage,
        paymentPolicy,
        JSON.stringify(learning)
      ]
    );

    const profile = await getTutoringProfile(userId, agency.id);
    res.json({ ok: true, profile });
  } catch (e) {
    next(e);
  }
};

// Explicit time selection: no client creation, request, email, or appointment side effects.
export const createProviderSlotHold = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;
    const providerId = Number(req.params.providerId);
    if (!Number.isSafeInteger(providerId) || providerId <= 0) throw holdError('Invalid provider.', 400);
    const serviceType = normalizeServiceType(req.body?.serviceType);
    const modality = String(req.body?.modality || '').toUpperCase();
    if (!['VIRTUAL', 'IN_PERSON'].includes(modality)) throw holdError('Choose a session format.', 400);
    const hold = await createPublicProviderHoldService(pool).create({
      agencyId: agency.id, providerId, serviceType, modality,
      timeZone: await ProviderAvailabilityService.resolveAgencyTimeZone({agencyId: agency.id}),
      startAt: req.body?.startAt, endAt: req.body?.endAt,
      validateAvailability: async () => {
        let data, status = 200;
        await getProviderDetail({ params: req.params, query: { serviceType, programType: modality, bookingMode: 'NEW_CLIENT', weekStart: req.body.startAt.slice(0, 10) } },
          { status(code) { status = code; return this; }, json(value) { data = value; } }, (error) => { throw error; });
        const valid = status === 200 && data?.availability?.slots?.some((s) =>
          +new Date(s.startAt) === +new Date(req.body.startAt) && +new Date(s.endAt) === +new Date(req.body.endAt));
        if (!valid) throw holdError('This opening is no longer available. Please refresh and choose another time.');
      }
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ hold, message: 'Weekly opening held until placement is resolved. This is not a confirmed appointment.' });
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ error: { message: 'Temporary time selection is being prepared. You can continue enrollment with a provider preference.' } });
    if (error.status) return res.status(error.status).json({ error: { message: error.message } });
    next(error);
  }
};
export const releaseProviderSlotHold = async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT id FROM agencies WHERE slug=? LIMIT 1',[req.params.agencySlug]);
    if(rows[0]) await createPublicProviderHoldService(pool).release({ agencyId: rows[0].id, token: req.body?.token });
    res.json({ ok: true });
  } catch (error) { next(error); }
};

async function readLearningCatalog(agencyId) {
 const [rows]=await pool.execute('SELECT catalog_json FROM agency_learning_catalogs WHERE agency_id=?',[agencyId]);
 const raw=rows[0]?.catalog_json;
 return raw ? (typeof raw==='string'?JSON.parse(raw):raw) : {version:1,rates:[],packages:[]};
}
export async function getLearningCatalog(req,res,next) {
 try {const agency=await requireAgencyBySlug(res,req.params.agencySlug);if(!agency)return;
 const catalog=await readLearningCatalog(agency.id);
 if(req.route?.path?.endsWith('/manage')) {if(!['admin','super_admin'].includes(req.user?.role))return res.status(403).json({error:{message:'Administrator access is required for rates and compensation standards.'}});return res.json({catalog});}
 const providerId=Number(req.query.providerId||0);let tutoringProfile=null;
 if(req.query.providerId){
   if(!Number.isSafeInteger(providerId)||providerId<=0||!(await getEnrolledProviderIds(agency.id,'tutoring')).has(providerId))return res.status(404).json({error:{message:'Provider not found'}});
   tutoringProfile=await getTutoringProfile(providerId,agency.id);
 }
 const context=tutoringProfile?{tutoring:{providerId,profile:tutoringProfile.learning}}:{};
 res.json({catalog:{...publicLearningCatalog(catalog),packages:catalog.packages.filter(p=>p.published&&(!tutoringProfile||tutoringProfile.learning.programs.includes(p.program))).map(p=>pricePackage(catalog,p,context))}});
 }catch(e){next(e);}
}
export async function saveLearningCatalog(req,res,next) {
 if(!['admin','super_admin'].includes(req.user?.role))return res.status(403).json({error:{message:'Administrator access is required for rates and compensation standards.'}});
 try {const agency=await requireAgencyBySlug(res,req.params.agencySlug);if(!agency)return;
 const catalog=validateLearningCatalog(req.body);
 await pool.execute('INSERT INTO agency_learning_catalogs (agency_id,catalog_json) VALUES (?,?) ON DUPLICATE KEY UPDATE catalog_json=VALUES(catalog_json)',[agency.id,JSON.stringify(catalog)]);
 res.json({catalog});
 }catch(e){if(e.status===400)return res.status(400).json({error:{message:e.message}});next(e);}
}
