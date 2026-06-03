import pool from '../config/database.js';
import ProviderAvailabilityService from '../services/providerAvailability.service.js';
import PublicAppointmentRequest from '../models/PublicAppointmentRequest.model.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import PublicIntakeClientService from '../services/publicIntakeClient.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import EmailService from '../services/email.service.js';

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
  if (s === 'tutoring') return 'tutoring';
  return 'counseling';
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
    if (!String(s?.startAt || '').trim() || !String(s?.endAt || '').trim()) continue;
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

async function requireAgencyBySlug(res, agencySlug) {
  const [rows] = await pool.execute(
    `SELECT id, name, slug, logo_url, logo_path, color_palette, theme_settings,
            public_availability_enabled, feature_flags, onboarding_team_email, phone_number
     FROM agencies
     WHERE slug = ?
       AND (is_archived IS NULL OR is_archived = FALSE)
     LIMIT 1`,
    [String(agencySlug || '').trim()]
  );
  const a = rows?.[0] || null;
  if (!a) {
    res.status(404).json({ error: { message: 'Agency not found' } });
    return null;
  }
  if (!a.public_availability_enabled) {
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
  const [rows] = await pool.execute(
    `SELECT user_id
     FROM provider_public_service_enrollments
     WHERE agency_id = ? AND service_type = ? AND is_active = 1`,
    [Number(agencyId), String(serviceType)]
  );
  return new Set((rows || []).map((r) => Number(r.user_id)));
}

async function listEnrolledProviders(agencyId, serviceType) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.role, u.profile_photo_path,
            u.service_focus, u.provider_accepting_new_clients, u.title
     FROM users u
     JOIN provider_public_service_enrollments e
       ON e.user_id = u.id AND e.agency_id = ? AND e.service_type = ? AND e.is_active = 1
     WHERE (u.is_active IS NULL OR u.is_active = TRUE)
       AND (u.is_archived IS NULL OR u.is_archived = FALSE)
       AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED', 'PROSPECTIVE'))
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [Number(agencyId), String(serviceType)]
  );
  return rows || [];
}

async function getTutoringProfile(userId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT subject_areas_json, grade_levels_json, session_rate_cents, session_rate_note, bio, accepting_new_students
     FROM provider_tutoring_profiles
     WHERE user_id = ? AND agency_id = ?
     LIMIT 1`,
    [Number(userId), Number(agencyId)]
  );
  const r = rows?.[0] || null;
  if (!r) return null;
  let subjectAreas = [];
  let gradeLevels = [];
  try { subjectAreas = JSON.parse(r.subject_areas_json || '[]'); } catch { subjectAreas = []; }
  try { gradeLevels = JSON.parse(r.grade_levels_json || '[]'); } catch { gradeLevels = []; }
  return {
    subjectAreas,
    gradeLevels,
    sessionRateCents: r.session_rate_cents ?? null,
    sessionRateLabel: formatMoney(r.session_rate_cents),
    sessionRateNote: r.session_rate_note || null,
    bio: r.bio || null,
    acceptingNewStudents: r.accepting_new_students === 1 || r.accepting_new_students === true
  };
}

async function getCounselingSpecialties(userId) {
  const [rows] = await pool.execute(
    `SELECT value_text, value_option, field_key
     FROM provider_search_index
     WHERE user_id = ?
       AND field_key IN (
         'provider_counseling_specialties',
         'provider_marketing_treatment_modalities',
         'provider_marketing_age_specialty',
         'age_specialty',
         'provider_marketing_focus'
       )
     ORDER BY field_key ASC`,
    [Number(userId)]
  );
  const specialties = [];
  const modalities = [];
  const ageGroups = [];
  const focus = [];
  for (const r of rows || []) {
    const val = String(r.value_option || r.value_text || '').trim();
    if (!val) continue;
    if (r.field_key === 'provider_counseling_specialties') specialties.push(val);
    else if (r.field_key === 'provider_marketing_treatment_modalities') modalities.push(val);
    else if (r.field_key === 'provider_marketing_age_specialty' || r.field_key === 'age_specialty') ageGroups.push(val);
    else if (r.field_key === 'provider_marketing_focus') focus.push(val);
  }
  return { specialties, modalities, ageGroups, focus };
}

async function resolveProviderProfileSummary({ agencyId, providerUserId }) {
  const profile = await ProviderPublicProfile.getForProvider({ providerUserId });
  const agencySettings = await ProviderPublicProfile.getAgencySettings({ agencyId });
  const effectiveRateCents = profile?.selfPayRateCents ?? agencySettings?.defaultSelfPayRateCents ?? null;
  const effectiveRateNote = String(profile?.selfPayRateNote || agencySettings?.defaultSelfPayRateNote || '').trim() || null;
  return {
    publicBlurb: String(profile?.publicBlurb || '').trim(),
    insurances: Array.isArray(profile?.insurances) ? profile.insurances : [],
    selfPayRateCents: effectiveRateCents,
    selfPayRateLabel: formatMoney(effectiveRateCents),
    selfPayRateNote: effectiveRateNote,
    acceptingNewClientsOverride: profile?.acceptingNewClientsOverride ?? null
  };
}

async function computeProviderWindowSummary({ agencyId, providerId, weekStart, bookingMode, programType, heldSlots = null }) {
  const intakeOnly = String(bookingMode || 'NEW_CLIENT') === 'NEW_CLIENT';
  const program = normalizeProgramType(programType);
  const pickProgramSlots = (result) => (program === 'VIRTUAL' ? (result?.virtualSlots || []) : (result?.inPersonSlots || []));

  const computeForWeek = async (candidateWeekStart) => {
    const result = await ProviderAvailabilityService.computeWeekAvailability({
      agencyId,
      providerId,
      weekStartYmd: candidateWeekStart,
      includeGoogleBusy: true,
      externalCalendarIds: [],
      slotMinutes: 60,
      intakeOnly
    }).catch(() => null);
    if (!result) return { inPersonSlots: [], virtualSlots: [] };
    return {
      inPersonSlots: filterHeldSlots(dedupeSlots(result.inPersonSlots || []), heldSlots),
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
  for (let i = 1; i <= 16; i += 1) {
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

function normalizeSlots({ result, bookingMode, providerAcceptingNewClients, profileAcceptingNewClientsOverride }) {
  const mode = String(bookingMode || 'NEW_CLIENT').toUpperCase();
  const intakeOnly = mode === 'NEW_CLIENT';
  const accepting = profileAcceptingNewClientsOverride === null || profileAcceptingNewClientsOverride === undefined
    ? !!providerAcceptingNewClients
    : !!profileAcceptingNewClientsOverride;
  if (intakeOnly && !accepting) return { virtual: [], inPerson: [], all: [] };
  const inPerson = (result?.inPersonSlots || []).map((s) => ({
    ...s,
    modality: 'IN_PERSON',
    programType: 'IN_PERSON',
    recurrence: { isRecurring: true, frequency: String(s.frequency || 'WEEKLY').toUpperCase() }
  }));
  const virtual = (result?.virtualSlots || []).map((s) => ({
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

    res.json({
      ok: true,
      agency: {
        id: Number(agency.id),
        name: agency.name || '',
        slug: agency.slug || '',
        logoUrl,
        colorPalette: agency.color_palette || null,
        themeSettings: agency.theme_settings || null,
        contactPhone: agency.phone_number || null
      },
      serviceTypes: serviceTypes.map((st) => ({
        serviceType: st.service_type,
        displayName: st.display_name || (st.service_type === 'tutoring' ? 'Find a Tutor' : 'Find a Counselor'),
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
// GET /:agencySlug/counselors — counseling provider list + availability
// ---------------------------------------------------------------------------

export const listCounselors = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;

    const bookingMode = normalizeBookingMode(req.query.bookingMode || req.query.mode);
    const programType = normalizeProgramType(req.query.programType || req.query.program);
    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const weekStart = startOfWeekMondayYmd(isValidYmd(weekStartRaw) ? weekStartRaw : new Date().toISOString().slice(0, 10));
    const searchQ = String(req.query.search || '').trim().toLowerCase();
    const filterSpecialty = String(req.query.specialty || '').trim().toLowerCase();
    const filterModality = String(req.query.modality || '').trim().toLowerCase();
    const filterAgeGroup = String(req.query.ageGroup || '').trim().toLowerCase();

    const agencySettings = await ProviderPublicProfile.getAgencySettings({ agencyId: agency.id });
    const serviceTypeRow = (await getAgencyServiceTypes(agency.id)).find((st) => st.service_type === 'counseling');

    const providerRows = await listEnrolledProviders(agency.id, 'counseling');

    const providers = await runWithConcurrency(providerRows, 6, async (row) => {
      const heldSlots = await getHeldSlotStartsForProvider(agency.id, Number(row.id));
      const summary = await computeProviderWindowSummary({
        agencyId: agency.id,
        providerId: Number(row.id),
        weekStart,
        bookingMode,
        programType,
        heldSlots
      });
      const profileData = await ProviderPublicProfile.getForProvider({ providerUserId: Number(row.id) });
      const profile = await resolveProviderProfileSummary({ agencyId: agency.id, providerUserId: Number(row.id) });
      const slotSet = normalizeSlots({
        result: summary.thisWeek,
        bookingMode,
        providerAcceptingNewClients: row.provider_accepting_new_clients,
        profileAcceptingNewClientsOverride: profileData?.acceptingNewClientsOverride ?? null
      });
      const filteredThisWeek = programType === 'VIRTUAL' ? slotSet.virtual : slotSet.inPerson;
      if (!filteredThisWeek.length && !summary.nextAvailableAt) return null;

      const { specialties, modalities, ageGroups, focus } = await getCounselingSpecialties(Number(row.id));

      // Apply client-side filters
      const displayName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
      if (searchQ && !displayName.toLowerCase().includes(searchQ)) return null;
      if (filterSpecialty && !specialties.map((s) => s.toLowerCase()).some((s) => s.includes(filterSpecialty))) return null;
      if (filterModality && !modalities.map((s) => s.toLowerCase()).some((s) => s.includes(filterModality))) return null;
      if (filterAgeGroup && !ageGroups.map((s) => s.toLowerCase()).some((s) => s.includes(filterAgeGroup))) return null;

      return {
        providerId: Number(row.id),
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
          publicBlurb: profile.publicBlurb || '',
          insurancesAccepted: Array.isArray(profile.insurances) ? profile.insurances : [],
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
          bookedThroughDate: summary.bookedThroughYmd || null,
          slots: filteredThisWeek.map((s) => ({ ...s, bookingMode, programType }))
        }
      };
    });

    const validProviders = (providers || []).filter(Boolean);
    const virtualOnlyCount = validProviders.filter((p) => p.availability?.programType === 'VIRTUAL').length;

    res.json({
      ok: true,
      serviceType: 'counseling',
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
    const filterGradeLevel = String(req.query.gradeLevel || '').trim().toLowerCase();

    const serviceTypeRow = (await getAgencyServiceTypes(agency.id)).find((st) => st.service_type === 'tutoring');
    const providerRows = await listEnrolledProviders(agency.id, 'tutoring');

    const providers = await runWithConcurrency(providerRows, 6, async (row) => {
      const tutoringProfile = await getTutoringProfile(Number(row.id), agency.id);
      if (!tutoringProfile) return null;

      const heldSlots = await getHeldSlotStartsForProvider(agency.id, Number(row.id));
      const summary = await computeProviderWindowSummary({
        agencyId: agency.id,
        providerId: Number(row.id),
        weekStart,
        bookingMode,
        programType,
        heldSlots
      });
      const profileData = await ProviderPublicProfile.getForProvider({ providerUserId: Number(row.id) });
      // Tutors are shown as bookable based on open availability, not the accepting_new_students flag.
      // The flag is advisory — shown in the profile but does not gate slot visibility.
      const slotSet = normalizeSlots({
        result: summary.thisWeek,
        bookingMode,
        providerAcceptingNewClients: 1,
        profileAcceptingNewClientsOverride: null
      });
      const filteredThisWeek = programType === 'VIRTUAL' ? slotSet.virtual : slotSet.inPerson;
      if (!filteredThisWeek.length && !summary.nextAvailableAt) return null;

      const displayName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
      if (searchQ && !displayName.toLowerCase().includes(searchQ)) return null;
      if (filterSubject && !tutoringProfile.subjectAreas.map((s) => s.toLowerCase()).some((s) => s.includes(filterSubject))) return null;
      if (filterGradeLevel && !tutoringProfile.gradeLevels.map((s) => s.toLowerCase()).some((s) => s.includes(filterGradeLevel))) return null;

      return {
        providerId: Number(row.id),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        displayName,
        title: row.title || null,
        profilePhotoUrl: publicUploadsUrlFromStoredPath(row.profile_photo_path || null),
        tutoringProfile,
        availability: {
          bookingMode,
          programType,
          weekStart,
          thisWeekCount: filteredThisWeek.length,
          nextAvailableAt: summary.nextAvailableAt || null,
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

export const getProviderDetail = async (req, res, next) => {
  try {
    const agency = await requireAgencyBySlug(res, req.params.agencySlug);
    if (!agency) return;

    const providerId = parseIntSafe(req.params.providerId);
    if (!providerId) return res.status(400).json({ error: { message: 'Invalid providerId' } });

    const serviceType = normalizeServiceType(req.query.serviceType);
    const enrolledIds = await getEnrolledProviderIds(agency.id, serviceType);
    if (!enrolledIds.has(providerId)) {
      return res.status(404).json({ error: { message: 'Provider not found' } });
    }

    const [userRows] = await pool.execute(
      `SELECT id, first_name, last_name, role, profile_photo_path, service_focus, title,
              provider_accepting_new_clients
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

    const heldSlots = await getHeldSlotStartsForProvider(agency.id, providerId);
    const summary = await computeProviderWindowSummary({ agencyId: agency.id, providerId, weekStart, bookingMode, programType, heldSlots });
    const profileData = await ProviderPublicProfile.getForProvider({ providerUserId: providerId });
    const profile = await resolveProviderProfileSummary({ agencyId: agency.id, providerUserId: providerId });
    const slotSet = normalizeSlots({
      result: summary.thisWeek,
      bookingMode,
      providerAcceptingNewClients: user.provider_accepting_new_clients,
      profileAcceptingNewClientsOverride: profileData?.acceptingNewClientsOverride ?? null
    });
    const filteredThisWeek = programType === 'VIRTUAL' ? slotSet.virtual : slotSet.inPerson;

    let specialtyData = null;
    let tutoringProfile = null;
    if (serviceType === 'counseling') {
      specialtyData = await getCounselingSpecialties(providerId);
    } else {
      tutoringProfile = await getTutoringProfile(providerId, agency.id);
    }

    res.json({
      ok: true,
      serviceType,
      provider: {
        providerId,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        title: user.title || null,
        profilePhotoUrl: publicUploadsUrlFromStoredPath(user.profile_photo_path || null),
        serviceFocus: user.service_focus || null,
        ...(specialtyData || {}),
        tutoringProfile: tutoringProfile || undefined
      },
      profile: {
        publicBlurb: profile.publicBlurb || '',
        insurancesAccepted: Array.isArray(profile.insurances) ? profile.insurances : [],
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

    const inPersonSlots = filterHeldSlots(dedupeSlots(result?.inPersonSlots || []), heldSlots)
      .map((s) => ({ ...s, modality: 'IN_PERSON', programType: 'IN_PERSON' }));
    const virtualSlots = filterHeldSlots(dedupeSlots(result?.virtualSlots || []), heldSlots)
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
        try {
          const result = await PublicIntakeClientService.createClientAndGuardian({
            link: { scope_type: 'agency', organization_id: agency.id, create_guardian: true, create_client: true },
            payload: {
              organizationId: agency.id,
              client: { fullName, initials: clientInitials || null, contactPhone: String(req.body?.phone || '').trim() || null },
              guardian: {
                firstName: guardianFirstName,
                lastName: String(req.body?.guardianLastName || '').trim() || null,
                email: guardianEmail,
                phone: String(req.body?.guardianPhone || req.body?.phone || '').trim() || null,
                relationship: String(req.body?.guardianRelationship || 'Guardian').trim()
              }
            }
          });
          createdClientId = Number(result?.clients?.[0]?.id || 0) || null;
          createdGuardianUserId = Number(result?.guardianUser?.id || 0) || null;
          if (createdClientId) {
            await pool.execute(`UPDATE clients SET provider_id = ? WHERE id = ?`, [providerId, createdClientId]);
          }
        } catch { /* non-fatal */ }
      }
    }

    // Build extra columns for service_type/subject/grade (migration 844)
    const subjectArea = String(req.body?.subjectArea || '').trim() || null;
    const clientGradeLevel = String(req.body?.clientGradeLevel || '').trim() || null;

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

    // Patch in service_type, subject_area, client_grade_level, appointment_role
    if (created?.id) {
      await pool.execute(
        `UPDATE public_appointment_requests
         SET service_type = ?, subject_area = ?, client_grade_level = ?, appointment_role = 'session'
         WHERE id = ?`,
        [serviceType || null, subjectArea || null, clientGradeLevel || null, created.id]
      );
    }

    // --- Optional paired intake/evaluation appointment ---
    let intakeCreated = null;
    const intakePayload = req.body?.intakeAppointment;
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
        intakeCreated: intakeCreated || null
      }).catch(() => {});
    }

    res.status(201).json({
      ok: true,
      request: {
        id: created?.id ?? null,
        agencyId: agency.id,
        providerId,
        serviceType,
        modality,
        bookingMode,
        programType,
        subjectArea,
        clientGradeLevel,
        appointmentRole: 'session',
        requestedStartAt: created?.requested_start_at ?? null,
        requestedEndAt: created?.requested_end_at ?? null,
        status: 'PENDING'
      },
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

    const subjectAreas = Array.isArray(req.body?.subjectAreas) ? req.body.subjectAreas : [];
    const gradeLevels = Array.isArray(req.body?.gradeLevels) ? req.body.gradeLevels : [];
    const sessionRateCents = req.body?.sessionRateCents !== undefined ? parseIntSafe(req.body.sessionRateCents) : null;
    const sessionRateNote = req.body?.sessionRateNote !== undefined ? String(req.body.sessionRateNote || '').trim() : null;
    const bio = req.body?.bio !== undefined ? String(req.body.bio || '').trim() : null;
    const acceptingNewStudents = req.body?.acceptingNewStudents === false || req.body?.acceptingNewStudents === 0 ? 0 : 1;

    await pool.execute(
      `INSERT INTO provider_tutoring_profiles
         (user_id, agency_id, subject_areas_json, grade_levels_json, session_rate_cents, session_rate_note, bio, accepting_new_students)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         subject_areas_json = VALUES(subject_areas_json),
         grade_levels_json = VALUES(grade_levels_json),
         session_rate_cents = VALUES(session_rate_cents),
         session_rate_note = VALUES(session_rate_note),
         bio = VALUES(bio),
         accepting_new_students = VALUES(accepting_new_students),
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId, Number(agency.id),
        JSON.stringify(subjectAreas),
        JSON.stringify(gradeLevels),
        sessionRateCents || null,
        sessionRateNote || null,
        bio || null,
        acceptingNewStudents
      ]
    );

    const profile = await getTutoringProfile(userId, agency.id);
    res.json({ ok: true, profile });
  } catch (e) {
    next(e);
  }
};
