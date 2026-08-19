import {
  listTemplates,
  createTemplate,
  updateTemplate,
  listClauses,
  createClause,
  updateClause,
  listConfigs,
  createConfig,
  updateConfig,
  previewCandidateContract,
  generateAndAssignCandidateContract
} from '../services/contractGenerator.service.js';

function parseAgencyId(req) {
  const raw = req.query?.agencyId || req.body?.agencyId || req.user?.agencyId;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const getContractLibrary = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const [templates, clauses, configs] = await Promise.all([
      listTemplates(agencyId),
      listClauses(agencyId),
      listConfigs(agencyId)
    ]);
    res.json({ templates, clauses, configs });
  } catch (e) { next(e); }
};

export const postContractTemplate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const row = await createTemplate(agencyId, req.body || {}, req.user?.id);
    res.status(201).json(row);
  } catch (e) { next(e); }
};

export const patchContractTemplate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'Invalid request' } });
    const row = await updateTemplate(agencyId, id, req.body || {});
    if (!row) return res.status(404).json({ error: { message: 'Not found' } });
    res.json(row);
  } catch (e) { next(e); }
};

export const postContractClause = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const row = await createClause(agencyId, req.body || {}, req.user?.id);
    res.status(201).json(row);
  } catch (e) { next(e); }
};

export const patchContractClause = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'Invalid request' } });
    const row = await updateClause(agencyId, id, req.body || {});
    if (!row) return res.status(404).json({ error: { message: 'Not found' } });
    res.json(row);
  } catch (e) { next(e); }
};

export const postContractConfig = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const row = await createConfig(agencyId, req.body || {}, req.user?.id);
    res.status(201).json(row);
  } catch (e) { next(e); }
};

export const patchContractConfig = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'Invalid request' } });
    const row = await updateConfig(agencyId, id, req.body || {});
    if (!row) return res.status(404).json({ error: { message: 'Not found' } });
    res.json(row);
  } catch (e) { next(e); }
};

export const previewContractForCandidate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const candidateUserId = parseInt(req.params.userId, 10);
    const configId = parseInt(req.body?.configId, 10);
    if (!agencyId || !candidateUserId || !configId) {
      return res.status(400).json({ error: { message: 'agencyId, userId, and configId are required' } });
    }
    const result = await previewCandidateContract({
      agencyId,
      candidateUserId,
      configId,
      templateId: req.body?.templateId ? parseInt(req.body.templateId, 10) : null,
      tokens: req.body?.tokens || {},
      compensationCategory: req.body?.compensationCategory,
      compensationLevel: req.body?.compensationLevel
    });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const generateContractForCandidate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const candidateUserId = parseInt(req.params.userId, 10);
    const configId = parseInt(req.body?.configId, 10);
    if (!agencyId || !candidateUserId || !configId) {
      return res.status(400).json({ error: { message: 'agencyId, userId, and configId are required' } });
    }
    const result = await generateAndAssignCandidateContract({
      agencyId,
      candidateUserId,
      configId,
      templateId: req.body?.templateId ? parseInt(req.body.templateId, 10) : null,
      tokens: req.body?.tokens || {},
      compensationCategory: req.body?.compensationCategory,
      compensationLevel: req.body?.compensationLevel,
      createdByUserId: req.user?.id,
      title: req.body?.title
    });
    res.status(201).json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
