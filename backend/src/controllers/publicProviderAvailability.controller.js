import pool from '../config/database.js';
import ProviderAvailabilityService from '../services/providerAvailability.service.js';
import PublicAppointmentRequest from '../models/PublicAppointmentRequest.model.js';
import { checkPublicAvailabilityGate } from '../services/publicAvailabilityGate.service.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import PublicIntakeClientService from '../services/publicIntakeClient.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

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
  return d.toISOString().slice(0, 10);
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function toDate(val) {
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
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

async function requireAgencyPublicKey(req, res, agencyId) {
  const gate = await checkPublicAvailabilityGate(agencyId);
  if (!gate.ok) {
    res.status(gate.status).json({ error: { message: gate.message } });
    return null;
  }

  const key = String(req.query?.key || '').trim();
  if (!key) {
    res.status(403).json({ error: { message: 'Access key required' } });
    return null;
  }
  const [rows] = await pool.execute(
    `SELECT id, public_availability_access_key
     FROM agencies
     WHERE id = ?
     LIMIT 1`,
    [Number(agencyId)]
  );
  const a = rows?.[0] || null;
  if (!a) {
    res.status(404).json({ error: { message: 'Agency not found' } });
    return null;
  }
  if (String(a.public_availability_access_key || '').trim() !== key) {
    res.status(403).json({ error: { message: 'Invalid access key' } });
    return null;
  }
  return a;
}

async function requireProviderInAgency(req, res, { agencyId, providerId }) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.role, u.is_active, u.is_archived, u.status
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE u.id = ?
     LIMIT 1`,
    [Number(agencyId), Number(providerId)]
  );
  const u = rows?.[0] || null;
  if (!u) {
    res.status(404).json({ error: { message: 'Provider not found' } });
    return null;
  }
  // Best-effort: exclude archived/inactive users.
  const archived = u.is_archived === true || u.is_archived === 1 || String(u.status || '').toUpperCase() === 'ARCHIVED';
  const inactive = u.is_active === false || u.is_active === 0;
  if (archived || inactive) {
    res.status(404).json({ error: { message: 'Provider not found' } });
    return null;
  }
  return {
    id: Number(u.id),
    firstName: u.first_name || '',
    lastName: u.last_name || '',
    profilePhotoPath: u.profile_photo_path || null,
    displayName: `${u.first_name || ''} ${u.last_name || ''}`.trim()
  };
}

async function listAgencyClientFacingProviders({ agencyId }) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role, u.profile_photo_path, u.service_focus, u.provider_accepting_new_clients
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND (u.is_active IS NULL OR u.is_active = TRUE)
       AND (u.is_archived IS NULL OR u.is_archived = FALSE)
       AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE'))
       AND (
         u.role IN ('provider', 'supervisor', 'clinical_practice_assistant', 'admin', 'super_admin', 'staff', 'support')
         OR u.has_provider_access = TRUE
       )
       AND LOWER(COALESCE(u.role, '')) NOT IN ('guardian', 'school_support')
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [Number(agencyId)]
  );
  return rows || [];
}

async function resolveAgencyPortalSettings(agencyId) {
  const settings = await ProviderPublicProfile.getAgencySettings({ agencyId });
  return settings || {
    agencyId: Number(agencyId),
    finderIntroBlurb: '',
    defaultSelfPayRateCents: null,
    defaultSelfPayRateNote: ''
  };
}

async function resolveProviderProfileSummary({ agencyId, providerUserId }) {
  const profile = await ProviderPublicProfile.getForProvider({ providerUserId });
  const agencySettings = await resolveAgencyPortalSettings(agencyId);
  const effectiveRateCents = profile?.selfPayRateCents ?? agencySettings?.defaultSelfPayRateCents ?? null;
  const effectiveRateNote = String(profile?.selfPayRateNote || agencySettings?.defaultSelfPayRateNote || '').trim() || null;
  return {
    publicBlurb: String(profile?.publicBlurb || '').trim(),
    insurances: Array.isArray(profile?.insurances) ? profile.insurances : [],
    selfPayRateCents: effectiveRateCents,
    selfPayRateLabel: formatMoney(effectiveRateCents),
    selfPayRateNote: effectiveRateNote,
    agencyDefaultSelfPayRateCents: agencySettings?.defaultSelfPayRateCents ?? null,
    agencyDefaultSelfPayRateLabel: formatMoney(agencySettings?.defaultSelfPayRateCents ?? null)
  };
}

function normalizeAvailabilitySlots({ result, bookingMode, providerAcceptingNewClients, profileAcceptingNewClientsOverride }) {
  const mode = String(bookingMode || 'NEW_CLIENT').toUpperCase();
  const intakeOnly = mode === 'NEW_CLIENT';
  const accepting = profileAcceptingNewClientsOverride === null || profileAcceptingNewClientsOverride === undefined
    ? !!providerAcceptingNewClients
    : !!profileAcceptingNewClientsOverride;
  if (intakeOnly && !accepting) {
    return { virtual: [], inPerson: [], all: [] };
  }
  const inPerson = (result?.inPersonSlots || []).map((s) => ({
    ...s,
    modality: 'IN_PERSON',
    programType: 'IN_PERSON',
    recurrence: {
      isRecurring: true,
      frequency: String(s.frequency || 'WEEKLY').toUpperCase()
    }
  }));
  const virtual = (result?.virtualSlots || []).map((s) => ({
    ...s,
    modality: 'VIRTUAL',
    programType: 'VIRTUAL',
    recurrence: {
      isRecurring: true,
      frequency: String(s.frequency || 'WEEKLY').toUpperCase()
    }
  }));
  return {
    virtual,
    inPerson,
    all: [...inPerson, ...virtual].sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')))
  };
}

async function computeProviderWindowSummary({
  agencyId,
  providerId,
  weekStart,
  bookingMode,
  programType
}) {
  const intakeOnly = String(bookingMode || 'NEW_CLIENT') === 'NEW_CLIENT';
  const program = normalizeProgramType(programType);
  const pickProgramSlots = (result) =>
    program === 'VIRTUAL'
      ? (result?.virtualSlots || [])
      : (result?.inPersonSlots || []);
  const thisWeek = await ProviderAvailabilityService.computeWeekAvailability({
    agencyId,
    providerId,
    weekStartYmd: weekStart,
    includeGoogleBusy: true,
    externalCalendarIds: [],
    slotMinutes: 60,
    intakeOnly
  });
  let nextAvailable = null;
  let bookedThroughYmd = null;
  const allThisWeek = pickProgramSlots(thisWeek)
    .sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
  if (allThisWeek.length > 0) {
    return {
      thisWeek,
      nextAvailableAt: allThisWeek[0].startAt,
      bookedThroughYmd: null
    };
  }

  for (let i = 1; i <= 16; i += 1) {
    const candidateWeek = addDaysYmd(weekStart, i * 7);
    // eslint-disable-next-line no-await-in-loop
    const candidate = await ProviderAvailabilityService.computeWeekAvailability({
      agencyId,
      providerId,
      weekStartYmd: candidateWeek,
      includeGoogleBusy: true,
      externalCalendarIds: [],
      slotMinutes: 60,
      intakeOnly
    });
    const merged = pickProgramSlots(candidate)
      .sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
    if (merged.length > 0) {
      nextAvailable = merged[0].startAt;
      const nextDate = toDate(nextAvailable);
      if (nextDate) bookedThroughYmd = addDaysYmd(nextDate.toISOString().slice(0, 10), -1);
      break;
    }
  }

  return {
    thisWeek,
    nextAvailableAt: nextAvailable,
    bookedThroughYmd
  };
}

async function findClientMatchForProvider({ providerId, initials }) {
  const token = String(initials || '').trim().toLowerCase();
  if (!token) return null;
  const [rows] = await pool.execute(
    `SELECT id, initials
     FROM clients
     WHERE provider_id = ?
       AND LOWER(COALESCE(initials, '')) = ?
       AND (status IS NULL OR UPPER(status) <> 'ARCHIVED')
     ORDER BY id DESC
     LIMIT 1`,
    [Number(providerId), token]
  );
  return rows?.[0] || null;
}

async function maybeCreateClientForPublicRequest({ agencyId, providerId, body }) {
  const bookingMode = normalizeBookingMode(body?.bookingMode);
  if (bookingMode !== 'NEW_CLIENT') return { createdClientId: null, createdGuardianUserId: null };

  const fullName = String(body?.clientFullName || body?.name || '').trim();
  const guardianEmail = String(body?.guardianEmail || body?.email || '').trim();
  const guardianFirstName = String(body?.guardianFirstName || '').trim();
  if (!fullName || !guardianEmail || !guardianFirstName) {
    return { createdClientId: null, createdGuardianUserId: null };
  }

  let organizationId = parseIntSafe(body?.organizationId);
  if (!organizationId) {
    const [orgRows] = await pool.execute(
      `SELECT a.id
       FROM organization_affiliations oa
       JOIN agencies a ON a.id = oa.organization_id
       WHERE oa.agency_id = ?
         AND oa.is_active = TRUE
         AND LOWER(COALESCE(a.organization_type, '')) IN ('program', 'school', 'learning')
       ORDER BY FIELD(LOWER(COALESCE(a.organization_type, '')), 'program', 'school', 'learning'), a.id ASC
       LIMIT 1`,
      [Number(agencyId)]
    );
    organizationId = Number(orgRows?.[0]?.id || 0) || null;
  }
  if (!organizationId) return { createdClientId: null, createdGuardianUserId: null };

  try {
    const linkLike = {
      scope_type: 'agency',
      organization_id: organizationId,
      create_guardian: true,
      create_client: true
    };
    const payload = {
      organizationId,
      client: {
        fullName,
        initials: String(body?.clientInitials || '').trim() || null,
        contactPhone: String(body?.clientPhone || body?.phone || '').trim() || null
      },
      guardian: {
        firstName: guardianFirstName,
        lastName: String(body?.guardianLastName || '').trim() || null,
        email: guardianEmail,
        phone: String(body?.guardianPhone || body?.phone || '').trim() || null,
        relationship: String(body?.guardianRelationship || 'Guardian').trim()
      }
    };
    const { clients, guardianUser } = await PublicIntakeClientService.createClientAndGuardian({
      link: linkLike,
      payload
    });
    const createdClientId = Number(clients?.[0]?.id || 0) || null;
    if (createdClientId) {
      await pool.execute(
        `UPDATE clients
         SET provider_id = ?
         WHERE id = ?`,
        [Number(providerId), createdClientId]
      );
    }
    return {
      createdClientId,
      createdGuardianUserId: Number(guardianUser?.id || 0) || null
    };
  } catch {
    return { createdClientId: null, createdGuardianUserId: null };
  }
}

export const listPublicProvidersAvailability = async (req, res, next) => {
  try {
    const agencyId = parseIntSafe(req.params.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const okAgency = await requireAgencyPublicKey(req, res, agencyId);
    if (!okAgency) return;

    const bookingMode = normalizeBookingMode(req.query.bookingMode || req.query.mode);
    const programType = normalizeProgramType(req.query.programType || req.query.program);
    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const weekStart = startOfWeekMondayYmd(isValidYmd(weekStartRaw) ? weekStartRaw : new Date().toISOString().slice(0, 10));
    const agencySettings = await resolveAgencyPortalSettings(agencyId);
    const providerRows = await listAgencyClientFacingProviders({ agencyId });

    const providers = await runWithConcurrency(providerRows, 6, async (row) => {
      const summary = await computeProviderWindowSummary({
        agencyId,
        providerId: Number(row.id),
        weekStart,
        bookingMode,
        programType
      });
      const profile = await resolveProviderProfileSummary({ agencyId, providerUserId: Number(row.id) });
      const profileData = await ProviderPublicProfile.getForProvider({ providerUserId: Number(row.id) });
      const slotSet = normalizeAvailabilitySlots({
        result: summary.thisWeek,
        bookingMode,
        providerAcceptingNewClients: row.provider_accepting_new_clients,
        profileAcceptingNewClientsOverride: profileData?.acceptingNewClientsOverride ?? null
      });
      const filteredThisWeek = programType === 'VIRTUAL' ? slotSet.virtual : slotSet.inPerson;
      if (!filteredThisWeek.length && !summary.nextAvailableAt) return null;

      return {
        providerId: Number(row.id),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        displayName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        role: row.role || null,
        profilePhotoPath: row.profile_photo_path || null,
        profilePhotoUrl: publicUploadsUrlFromStoredPath(row.profile_photo_path || null),
        serviceFocus: row.service_focus || null,
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
          slots: filteredThisWeek.map((s) => ({
            ...s,
            bookingMode,
            programType
          }))
        }
      };
    });

    res.json({
      ok: true,
      agencyId,
      weekStart,
      bookingMode,
      programType,
      introBlurb: agencySettings?.finderIntroBlurb || '',
      providers: (providers || []).sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')))
    });
  } catch (e) {
    next(e);
  }
};

export const getPublicProviderProfile = async (req, res, next) => {
  try {
    const agencyId = parseIntSafe(req.params.agencyId);
    const providerId = parseIntSafe(req.params.providerId);
    if (!agencyId || !providerId) return res.status(400).json({ error: { message: 'Invalid agencyId/providerId' } });
    const okAgency = await requireAgencyPublicKey(req, res, agencyId);
    if (!okAgency) return;
    const provider = await requireProviderInAgency(req, res, { agencyId, providerId });
    if (!provider) return;
    const profile = await resolveProviderProfileSummary({ agencyId, providerUserId: providerId });
    res.json({
      ok: true,
      agencyId,
      provider: {
        id: provider.id,
        firstName: provider.firstName,
        lastName: provider.lastName,
        displayName: provider.displayName,
        profilePhotoPath: provider.profilePhotoPath || null,
        profilePhotoUrl: publicUploadsUrlFromStoredPath(provider.profilePhotoPath || null)
      },
      profile: {
        publicBlurb: profile.publicBlurb || '',
        insurancesAccepted: Array.isArray(profile.insurances) ? profile.insurances : [],
        selfPayRateCents: profile.selfPayRateCents ?? null,
        selfPayRateLabel: profile.selfPayRateLabel || null,
        selfPayRateNote: profile.selfPayRateNote || null,
        agencyDefaultSelfPayRateCents: profile.agencyDefaultSelfPayRateCents ?? null,
        agencyDefaultSelfPayRateLabel: profile.agencyDefaultSelfPayRateLabel || null
      }
    });
  } catch (e) {
    next(e);
  }
};

export const getPublicProviderAvailability = async (req, res, next) => {
  try {
    const agencyId = parseIntSafe(req.params.agencyId);
    const providerId = parseIntSafe(req.params.providerId);
    if (!agencyId || !providerId) return res.status(400).json({ error: { message: 'Invalid agencyId/providerId' } });

    const okAgency = await requireAgencyPublicKey(req, res, agencyId);
    if (!okAgency) return;

    const provider = await requireProviderInAgency(req, res, { agencyId, providerId });
    if (!provider) return;

    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const weekStart = isValidYmd(weekStartRaw) ? weekStartRaw : new Date().toISOString().slice(0, 10);

    const includeGoogleBusy = String(req.query.includeGoogleBusy ?? 'true').toLowerCase() !== 'false';
    const bookingMode = normalizeBookingMode(req.query.bookingMode || req.query.mode);
    const programType = normalizeProgramType(req.query.programType || req.query.program);
    const intakeOnly = bookingMode === 'NEW_CLIENT';

    const result = await ProviderAvailabilityService.computeWeekAvailability({
      agencyId,
      providerId,
      weekStartYmd: weekStart,
      includeGoogleBusy,
      externalCalendarIds: [],
      slotMinutes: 60,
      intakeOnly
    });

    res.json({
      ok: true,
      agencyId,
      provider,
      bookingMode,
      programType,
      weekStart: result.weekStart,
      weekEnd: result.weekEnd,
      timeZone: result.timeZone,
      slotMinutes: result.slotMinutes,
      virtualSlots: (result.virtualSlots || []).map((s) => ({
        ...s,
        recurrence: {
          isRecurring: true,
          frequency: String(s.frequency || 'WEEKLY').toUpperCase()
        }
      })),
      inPersonSlots: (result.inPersonSlots || []).map((s) => ({
        ...s,
        recurrence: {
          isRecurring: true,
          frequency: String(s.frequency || 'WEEKLY').toUpperCase()
        }
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const createPublicAppointmentRequest = async (req, res, next) => {
  try {
    const agencyId = parseIntSafe(req.params.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });

    const okAgency = await requireAgencyPublicKey(req, res, agencyId);
    if (!okAgency) return;

    const providerId = parseIntSafe(req.body?.providerId);
    const modality = String(req.body?.modality || '').trim().toUpperCase();
    const bookingMode = normalizeBookingMode(req.body?.bookingMode);
    const programType = normalizeProgramType(req.body?.programType);
    const startAt = String(req.body?.startAt || '').trim();
    const endAt = String(req.body?.endAt || '').trim();
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    const clientInitials = String(req.body?.clientInitials || '').trim();
    const phone = req.body?.phone ?? null;
    const notes = req.body?.notes ?? null;

    if (!providerId) return res.status(400).json({ error: { message: 'providerId is required' } });
    if (modality !== 'VIRTUAL' && modality !== 'IN_PERSON') {
      return res.status(400).json({ error: { message: 'modality must be VIRTUAL or IN_PERSON' } });
    }
    if ((programType === 'VIRTUAL' && modality !== 'VIRTUAL') || (programType === 'IN_PERSON' && modality !== 'IN_PERSON')) {
      return res.status(400).json({ error: { message: 'programType must match modality' } });
    }
    if (!startAt || !endAt) return res.status(400).json({ error: { message: 'startAt and endAt are required' } });
    if (!name || !email) return res.status(400).json({ error: { message: 'name and email are required' } });
    if (bookingMode === 'CURRENT_CLIENT' && !clientInitials) {
      return res.status(400).json({ error: { message: 'clientInitials are required for current client booking' } });
    }
    if (bookingMode === 'NEW_CLIENT') {
      const clientFullName = String(req.body?.clientFullName || req.body?.name || '').trim();
      const guardianFirstName = String(req.body?.guardianFirstName || '').trim();
      const guardianEmail = String(req.body?.guardianEmail || req.body?.email || '').trim();
      if (!clientFullName || !guardianFirstName || !guardianEmail) {
        return res.status(400).json({
          error: {
            message: 'clientFullName, guardianFirstName, and guardianEmail are required for new client intake booking'
          }
        });
      }
    }

    const provider = await requireProviderInAgency(req, res, { agencyId, providerId });
    if (!provider) return;

    // Validate requested slot exists in computed availability (fresh).
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: { message: 'Invalid startAt/endAt' } });
    }
    const diffMin = Math.round((end.getTime() - start.getTime()) / 60000);
    if (diffMin !== 60) {
      return res.status(400).json({ error: { message: 'Requested appointment must be 60 minutes' } });
    }

    const weekStart = start.toISOString().slice(0, 10);
    const availability = await ProviderAvailabilityService.computeWeekAvailability({
      agencyId,
      providerId,
      weekStartYmd: weekStart,
      includeGoogleBusy: true,
      externalCalendarIds: [],
      slotMinutes: 60,
      intakeOnly: bookingMode === 'NEW_CLIENT'
    });

    const list = modality === 'VIRTUAL' ? availability.virtualSlots : availability.inPersonSlots;
    const wantedKey = `${start.toISOString()}|${end.toISOString()}`;
    const ok = (list || []).some((s) => `${s.startAt}|${s.endAt}` === wantedKey);
    if (!ok) {
      return res.status(409).json({ error: { message: 'Requested time is no longer available' } });
    }

    let matchedClient = null;
    if (bookingMode === 'CURRENT_CLIENT') {
      matchedClient = await findClientMatchForProvider({ providerId, initials: clientInitials });
      if (!matchedClient?.id) {
        return res.status(404).json({
          error: {
            message: 'No current client match found for these initials with this provider'
          }
        });
      }
    }
    const createdEntity = await maybeCreateClientForPublicRequest({ agencyId, providerId, body: req.body });

    const created = await PublicAppointmentRequest.create({
      agencyId,
      providerId,
      modality,
      bookingMode,
      programType,
      requestedStartAt: start.toISOString().slice(0, 19).replace('T', ' '),
      requestedEndAt: end.toISOString().slice(0, 19).replace('T', ' '),
      clientName: name,
      clientEmail: email,
      clientPhone: phone,
      clientInitials: clientInitials || null,
      matchedClientId: matchedClient?.id || null,
      createdClientId: createdEntity.createdClientId || null,
      createdGuardianUserId: createdEntity.createdGuardianUserId || null,
      notes
    });

    res.status(201).json({
      ok: true,
      request: {
        id: created?.id ?? null,
        agencyId,
        providerId,
        modality,
        bookingMode: created?.booking_mode || bookingMode,
        programType: created?.program_type || programType,
        clientInitials: created?.client_initials || null,
        matchedClientId: created?.matched_client_id || null,
        createdClientId: created?.created_client_id || null,
        createdGuardianUserId: created?.created_guardian_user_id || null,
        requestedStartAt: created?.requested_start_at ?? null,
        requestedEndAt: created?.requested_end_at ?? null,
        status: created?.status ?? 'PENDING'
      }
    });
  } catch (e) {
    next(e);
  }
};

