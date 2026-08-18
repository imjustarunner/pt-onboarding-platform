import {
  bulkSetClientDemo,
  bulkSetUserDemo,
  findClientDuplicateGroups,
  findUserDuplicateGroups,
  listTestClients,
  listTestUsers,
  mergeClients,
  mergeUsers,
  previewClientMerge,
  previewUserMerge,
  setClientDemoFlag,
  setUserDemoFlag
} from '../services/identityHygiene.service.js';

function canReview(role) {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support';
}

function deny(res) {
  return res.status(403).json({ error: { message: 'Duplicate and test review is limited to admins.' } });
}

function defaultPersona(req, fallback = 'employees') {
  if (String(req.baseUrl || '').includes('clients')) return 'clients';
  return String(req.query.persona || req.body?.persona || fallback);
}

function parseIds(raw) {
  if (Array.isArray(raw)) return raw.map((n) => Number(n)).filter((n) => n > 0);
  if (raw == null || raw === '') return [];
  return String(raw).split(',').map((n) => Number(n)).filter((n) => n > 0);
}

export async function getPeopleDuplicates(req, res, next) {
  try {
    if (!canReview(req.user?.role)) return deny(res);
    const persona = defaultPersona(req, 'employees');
    const agencyId = req.query.agencyId || req.query.agency_id || null;
    const includeArchived = String(req.query.includeArchived || '') === 'true';
    if (persona === 'clients') {
      const result = await findClientDuplicateGroups({ agencyId, includeArchived });
      return res.json(result);
    }
    const result = await findUserDuplicateGroups({ persona, agencyId, includeArchived });
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getPeopleTests(req, res, next) {
  try {
    if (!canReview(req.user?.role)) return deny(res);
    const persona = defaultPersona(req, 'employees');
    const agencyId = req.query.agencyId || req.query.agency_id || null;
    if (persona === 'clients') {
      return res.json(await listTestClients({ agencyId }));
    }
    return res.json(await listTestUsers({ persona, agencyId }));
  } catch (err) {
    next(err);
  }
}

export async function previewPeopleMerge(req, res, next) {
  try {
    if (!canReview(req.user?.role)) return deny(res);
    const persona = defaultPersona(req, String(req.body?.persona || 'employees'));
    const keepId = Number(req.body?.keepId);
    const sourceIds = parseIds(req.body?.sourceIds);
    const fieldChoices = req.body?.fieldChoices || {};
    if (!keepId || !sourceIds.length) {
      return res.status(400).json({ error: { message: 'keepId and sourceIds are required' } });
    }
    const preview = persona === 'clients'
      ? await previewClientMerge({ keepId, sourceIds, fieldChoices })
      : await previewUserMerge({ keepId, sourceIds, fieldChoices });
    return res.json(preview);
  } catch (err) {
    next(err);
  }
}

export async function applyPeopleMerge(req, res, next) {
  try {
    if (!canReview(req.user?.role)) return deny(res);
    const persona = defaultPersona(req, String(req.body?.persona || 'employees'));
    const keepId = Number(req.body?.keepId);
    const sourceIds = parseIds(req.body?.sourceIds);
    const fieldChoices = req.body?.fieldChoices || {};
    if (!keepId || !sourceIds.length) {
      return res.status(400).json({ error: { message: 'keepId and sourceIds are required' } });
    }
    const result = persona === 'clients'
      ? await mergeClients({ keepId, sourceIds, fieldChoices, actorUserId: req.user.id })
      : await mergeUsers({ keepId, sourceIds, fieldChoices, actorUserId: req.user.id });
    return res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
}

export async function patchUserDemo(req, res, next) {
  try {
    if (!canReview(req.user?.role)) return deny(res);
    const userId = Number(req.params.id);
    const isDemo = req.body?.isDemo === true || req.body?.is_demo === true || req.body?.isDemo === 1;
    const user = await setUserDemoFlag(userId, isDemo);
    return res.json({ user, is_demo: isDemo });
  } catch (err) {
    next(err);
  }
}

export async function patchClientDemo(req, res, next) {
  try {
    if (!canReview(req.user?.role)) return deny(res);
    const clientId = Number(req.params.id);
    const isDemo = req.body?.isDemo === true || req.body?.is_demo === true || req.body?.isDemo === 1;
    const client = await setClientDemoFlag(clientId, isDemo);
    return res.json({ client, is_demo: isDemo });
  } catch (err) {
    next(err);
  }
}

export async function bulkPatchDemo(req, res, next) {
  try {
    if (!canReview(req.user?.role)) return deny(res);
    const persona = defaultPersona(req, String(req.body?.persona || 'employees'));
    const ids = parseIds(req.body?.ids);
    const isDemo = req.body?.isDemo !== false && req.body?.is_demo !== false;
    const result = persona === 'clients'
      ? await bulkSetClientDemo(ids, isDemo)
      : await bulkSetUserDemo(ids, isDemo);
    return res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}
