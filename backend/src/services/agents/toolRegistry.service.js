import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import Task from '../../models/Task.model.js';
import HiringProfile from '../../models/HiringProfile.model.js';
import HiringNote from '../../models/HiringNote.model.js';
import ProviderSearchIndex from '../../models/ProviderSearchIndex.model.js';
import ProviderAvailabilityService from '../providerAvailability.service.js';
import { getUserCapabilities } from '../../utils/capabilities.js';

function str(v, maxLen = 2000) {
  const s = String(v ?? '').trim();
  if (!maxLen) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function intOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

async function ensureAgencyAccess(reqUser, agencyId) {
  if (!agencyId) {
    const err = new Error('agencyId is required');
    err.status = 400;
    throw err;
  }
  if (reqUser?.role === 'super_admin') return true;
  const agencies = await User.getAgencies(reqUser.id);
  const ok = (agencies || []).some((a) => Number(a.id) === Number(agencyId));
  if (!ok) {
    const err = new Error('You do not have access to this agency');
    err.status = 403;
    throw err;
  }
  return true;
}

async function ensureCandidateInAgency(candidateUserId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM user_agencies
     WHERE user_id = ? AND agency_id = ?
     LIMIT 1`,
    [candidateUserId, agencyId]
  );
  return rows.length > 0;
}

async function ensureUserInAgency(userId, agencyId) {
  const uid = intOrNull(userId);
  const aid = intOrNull(agencyId);
  if (!uid || !aid) {
    const err = new Error('userId and agencyId are required');
    err.status = 400;
    throw err;
  }
  const ok = await ensureCandidateInAgency(uid, aid);
  if (!ok) {
    const err = new Error('User not found in this agency');
    err.status = 404;
    throw err;
  }
  return true;
}

function assertBackofficeAdmin(reqUser) {
  if (!reqUser) {
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }
  if (reqUser.role !== 'admin' && reqUser.role !== 'super_admin' && reqUser.role !== 'support') {
    const err = new Error('Admin access required');
    err.status = 403;
    throw err;
  }
}

async function assertCanManageHiring(reqUser) {
  if (!reqUser?.id) {
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }
  const userRow = await User.findById(reqUser.id);
  const caps = getUserCapabilities(userRow);
  if (!caps?.canManageHiring) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
}

export function getToolSchemas() {
  return [
    {
      name: 'createTask',
      description: 'Create a training or document task (admin-only).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          taskType: { type: 'string', enum: ['training', 'document'] },
          title: { type: 'string' },
          description: { type: 'string' },
          assignedToUserId: { type: 'integer' },
          assignedToRole: {
            type: 'string',
            enum: [
              'super_admin',
              'admin',
              'support',
              'supervisor',
              'clinical_practice_assistant',
              'staff',
              'provider',
              'school_staff',
              'facilitator',
              'intern'
            ]
          },
          assignedToAgencyId: { type: 'integer' },
          dueDate: { type: 'string', description: 'ISO 8601 date/time string' },
          referenceId: { type: 'integer' },
          documentActionType: { type: 'string', enum: ['signature', 'review'] }
        },
        required: ['taskType', 'title']
      }
    },
    {
      name: 'createHiringCandidate',
      description: 'Create a prospective hiring candidate (requires canManageHiring).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agencyId: { type: 'integer' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          personalEmail: { type: 'string' },
          phoneNumber: { type: 'string' },
          appliedRole: { type: 'string' },
          source: { type: 'string' },
          stage: { type: 'string' },
          role: { type: 'string' }
        },
        required: ['agencyId', 'lastName', 'personalEmail']
      }
    },
    {
      name: 'addHiringNote',
      description: 'Add an internal hiring note for a candidate (requires canManageHiring).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agencyId: { type: 'integer' },
          candidateUserId: { type: 'integer' },
          message: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 }
        },
        required: ['agencyId', 'candidateUserId', 'message']
      }
    },
    {
      name: 'setHiringStage',
      description: 'Update a candidate hiring stage (requires canManageHiring).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agencyId: { type: 'integer' },
          candidateUserId: { type: 'integer' },
          stage: { type: 'string' }
        },
        required: ['agencyId', 'candidateUserId', 'stage']
      }
    },
    {
      name: 'searchProviders',
      description: 'Search providers in an agency by structured filters or free text.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agencyId: { type: 'integer' },
          textQuery: { type: 'string' },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                fieldKey: { type: 'string' },
                op: { type: 'string', enum: ['hasOption', 'textContains', 'equals'] },
                value: { type: 'string' }
              },
              required: ['fieldKey', 'op', 'value']
            }
          },
          limit: { type: 'integer' },
          offset: { type: 'integer' }
        },
        required: ['agencyId']
      }
    },
    {
      name: 'getProviderProfileFields',
      description: 'Fetch provider profile fields and values (Provider Info tab).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agencyId: { type: 'integer' },
          providerId: { type: 'integer' },
          fieldKeys: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['agencyId', 'providerId']
      }
    },
    {
      name: 'getProviderIntakeAvailability',
      description: 'Fetch provider intake availability (virtual + in-person slots).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agencyId: { type: 'integer' },
          providerId: { type: 'integer' },
          weekStartYmd: { type: 'string', description: 'YYYY-MM-DD (week start; Monday)' },
          includeGoogleBusy: { type: 'boolean' },
          slotMinutes: { type: 'integer' },
          modality: { type: 'string', enum: ['VIRTUAL', 'IN_PERSON', 'ALL'] }
        },
        required: ['agencyId', 'providerId']
      }
    }
  ];
}

export async function executeToolCall({ req, toolCall }) {
  const name = str(toolCall?.name || toolCall?.tool || '', 120);
  const args = toolCall?.args && typeof toolCall.args === 'object' ? toolCall.args : {};

  if (!name) {
    const err = new Error('Invalid tool call');
    err.status = 400;
    throw err;
  }

  if (name === 'createTask') {
    assertBackofficeAdmin(req.user);
    const taskType = str(args.taskType, 40);
    const title = str(args.title, 240);
    const description = args.description == null ? null : str(args.description, 8000);
    const assignedToUserId = intOrNull(args.assignedToUserId);
    const assignedToRole = args.assignedToRole == null ? null : str(args.assignedToRole, 40);
    const assignedToAgencyId = intOrNull(args.assignedToAgencyId);
    const dueDate = args.dueDate == null ? null : String(args.dueDate);
    const referenceId = intOrNull(args.referenceId);
    const documentActionType = args.documentActionType == null ? null : str(args.documentActionType, 40);

    if (taskType !== 'training' && taskType !== 'document') {
      const err = new Error('taskType must be training or document');
      err.status = 400;
      throw err;
    }
    if (!title) {
      const err = new Error('title is required');
      err.status = 400;
      throw err;
    }

    // Agency scoping: non-super admins can only create tasks within their agencies.
    if (assignedToAgencyId && req.user.role !== 'super_admin') {
      await ensureAgencyAccess(req.user, assignedToAgencyId);
    }

    const created = await Task.create({
      taskType,
      title,
      description,
      assignedToUserId,
      assignedToRole,
      assignedToAgencyId,
      assignedByUserId: req.user.id,
      dueDate,
      referenceId,
      documentActionType
    });

    return { ok: true, tool: name, result: { id: created?.id || null } };
  }

  if (name === 'createHiringCandidate') {
    await assertCanManageHiring(req.user);
    const agencyId = intOrNull(args.agencyId);
    await ensureAgencyAccess(req.user, agencyId);

    const firstName = args.firstName == null ? null : str(args.firstName, 120);
    const lastName = str(args.lastName, 120);
    const personalEmail = str(args.personalEmail, 220);
    const phoneNumber = args.phoneNumber == null ? null : str(args.phoneNumber, 80);
    const appliedRole = args.appliedRole == null ? null : str(args.appliedRole, 120);
    const source = args.source == null ? null : str(args.source, 120);
    const stage = args.stage == null ? 'applied' : str(args.stage, 80);
    const role = args.role == null ? 'provider' : str(args.role, 80);

    if (!lastName) {
      const err = new Error('lastName is required');
      err.status = 400;
      throw err;
    }
    if (!personalEmail) {
      const err = new Error('personalEmail is required');
      err.status = 400;
      throw err;
    }

    const user = await User.create({
      email: personalEmail,
      passwordHash: null,
      firstName,
      lastName,
      phoneNumber,
      personalEmail,
      role,
      status: 'PROSPECTIVE'
    });
    await User.assignToAgency(user.id, agencyId);
    const profile = await HiringProfile.upsert({
      candidateUserId: user.id,
      stage,
      appliedRole: appliedRole || null,
      source: source || null
    });

    return { ok: true, tool: name, result: { candidateUserId: user?.id || null, profile } };
  }

  if (name === 'addHiringNote') {
    await assertCanManageHiring(req.user);
    const agencyId = intOrNull(args.agencyId);
    const candidateUserId = intOrNull(args.candidateUserId);
    await ensureAgencyAccess(req.user, agencyId);
    if (!candidateUserId) {
      const err = new Error('candidateUserId is required');
      err.status = 400;
      throw err;
    }
    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) {
      const err = new Error('Candidate not found in this agency');
      err.status = 404;
      throw err;
    }
    const message = str(args.message, 6000);
    if (!message) {
      const err = new Error('message is required');
      err.status = 400;
      throw err;
    }
    const ratingRaw = args.rating;
    const rating = ratingRaw === null || ratingRaw === undefined || ratingRaw === '' ? null : intOrNull(ratingRaw);

    const note = await HiringNote.create({
      candidateUserId,
      authorUserId: req.user.id,
      message,
      rating: Number.isFinite(rating) ? rating : null
    });
    return { ok: true, tool: name, result: { id: note?.id || null } };
  }

  if (name === 'setHiringStage') {
    await assertCanManageHiring(req.user);
    const agencyId = intOrNull(args.agencyId);
    const candidateUserId = intOrNull(args.candidateUserId);
    const stage = str(args.stage, 80);
    await ensureAgencyAccess(req.user, agencyId);
    if (!candidateUserId) {
      const err = new Error('candidateUserId is required');
      err.status = 400;
      throw err;
    }
    if (!stage) {
      const err = new Error('stage is required');
      err.status = 400;
      throw err;
    }
    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) {
      const err = new Error('Candidate not found in this agency');
      err.status = 404;
      throw err;
    }
    const profile = await HiringProfile.upsert({ candidateUserId, stage });
    return { ok: true, tool: name, result: { profile } };
  }

  if (name === 'searchProviders') {
    const agencyId = intOrNull(args.agencyId);
    await ensureAgencyAccess(req.user, agencyId);
    const textQuery = args.textQuery == null ? '' : str(args.textQuery, 500);
    const filters = Array.isArray(args.filters) ? args.filters : [];
    const limitRaw = intOrNull(args.limit);
    const offsetRaw = intOrNull(args.offset);
    const limit = Math.min(Math.max(1, Number(limitRaw || 50)), 100);
    const offset = Math.max(0, Number(offsetRaw || 0));
    const out = await ProviderSearchIndex.search({
      agencyId,
      filters,
      limit,
      offset,
      textQuery
    });
    return { ok: true, tool: name, result: out };
  }

  if (name === 'getProviderProfileFields') {
    const agencyId = intOrNull(args.agencyId);
    const providerId = intOrNull(args.providerId);
    await ensureAgencyAccess(req.user, agencyId);
    await ensureUserInAgency(providerId, agencyId);

    const fieldKeys = Array.isArray(args.fieldKeys)
      ? args.fieldKeys.map((k) => str(k, 191)).filter(Boolean).slice(0, 80)
      : [];
    const whereKeysSql = fieldKeys.length ? ` AND uifd.field_key IN (${fieldKeys.map(() => '?').join(',')})` : '';

    const [rows] = await pool.execute(
      `SELECT
         uiv.value,
         uifd.field_key,
         uifd.field_label,
         uifd.field_type,
         uifd.options
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
       WHERE uiv.user_id = ?${whereKeysSql}
       ORDER BY uifd.field_key ASC`,
      fieldKeys.length ? [providerId, ...fieldKeys] : [providerId]
    );

    return { ok: true, tool: name, result: { providerId, fields: rows || [] } };
  }

  if (name === 'getProviderIntakeAvailability') {
    const agencyId = intOrNull(args.agencyId);
    const providerId = intOrNull(args.providerId);
    await ensureAgencyAccess(req.user, agencyId);
    await ensureUserInAgency(providerId, agencyId);

    const weekStartYmd = str(args.weekStartYmd || new Date().toISOString().slice(0, 10), 10);
    const includeGoogleBusy =
      args.includeGoogleBusy === true || args.includeGoogleBusy === 1 || args.includeGoogleBusy === '1';
    const slotMinutesRaw = intOrNull(args.slotMinutes);
    const slotMinutes = Math.min(Math.max(15, Number(slotMinutesRaw || 60)), 180);
    const modality = String(args.modality || 'ALL').trim().toUpperCase();

    const availability = await ProviderAvailabilityService.computeWeekAvailability({
      agencyId,
      providerId,
      weekStartYmd,
      includeGoogleBusy,
      externalCalendarIds: [],
      slotMinutes,
      intakeOnly: true
    });

    const result = {
      ok: true,
      agencyId,
      providerId,
      weekStart: availability.weekStart,
      weekEnd: availability.weekEnd,
      timeZone: availability.timeZone,
      slotMinutes: availability.slotMinutes,
      virtualSlots: availability.virtualSlots || [],
      inPersonSlots: availability.inPersonSlots || []
    };

    if (modality === 'VIRTUAL') result.inPersonSlots = [];
    if (modality === 'IN_PERSON') result.virtualSlots = [];

    return { ok: true, tool: name, result };
  }

  const err = new Error(`Unknown tool: ${name}`);
  err.status = 400;
  throw err;
}

