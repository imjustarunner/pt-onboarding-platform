import PayrollCompensationLevel, { COMPENSATION_CATEGORIES, CATEGORY_IDS, LEVEL_IDS } from '../models/PayrollCompensationLevel.model.js';
import PayrollRateCard from '../models/PayrollRateCard.model.js';

const requireAgencyId = (req, res) => {
  const id = parseInt(req.query.agencyId || req.body?.agencyId || '', 10);
  if (!id) { res.status(400).json({ error: { message: 'agencyId is required' } }); return null; }
  return id;
};

/** GET /payroll/compensation-levels?agencyId= */
export const listCompensationLevels = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;
    const [levels, categoryLabels] = await Promise.all([
      PayrollCompensationLevel.listForAgency(agencyId),
      PayrollCompensationLevel.getCategoryLabels(agencyId)
    ]);
    res.json({ levels, categoryLabels, categories: COMPENSATION_CATEGORIES });
  } catch (e) { next(e); }
};

/**
 * PUT /payroll/compensation-levels
 * body: { agencyId, levels: [{category,level,label,directRate,indirectRate,ffsRate,hasFfs}], categoryLabels?: {1:'',2:'',3:''} }
 */
export const saveCompensationLevels = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;
    const { levels, categoryLabels } = req.body;
    if (!Array.isArray(levels)) return res.status(400).json({ error: { message: 'levels array is required' } });

    for (const row of levels) {
      const cat = parseInt(row.category, 10);
      const lvl = parseInt(row.level, 10);
      if (!CATEGORY_IDS.includes(cat) || !LEVEL_IDS.includes(lvl)) continue;
      await PayrollCompensationLevel.upsert(agencyId, cat, lvl, {
        label: row.label ?? null,
        directRate: row.directRate ?? null,
        indirectRate: row.indirectRate ?? null,
        ffsRate: row.ffsRate ?? null,
        hasFfs: !!row.hasFfs
      });
    }

    if (categoryLabels && typeof categoryLabels === 'object') {
      for (const cat of CATEGORY_IDS) {
        if (categoryLabels[cat] !== undefined) {
          await PayrollCompensationLevel.saveCategoryLabel(agencyId, cat, categoryLabels[cat]);
        }
      }
    }

    const [updated, updatedLabels] = await Promise.all([
      PayrollCompensationLevel.listForAgency(agencyId),
      PayrollCompensationLevel.getCategoryLabels(agencyId)
    ]);
    res.json({ levels: updated, categoryLabels: updatedLabels });
  } catch (e) { next(e); }
};

/** GET /payroll/users/:userId/compensation-level?agencyId= */
export const getUserCompensationLevel = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;
    const userId = parseInt(req.params.userId, 10);
    const row = await PayrollCompensationLevel.getForUser(agencyId, userId);
    res.json({ assignment: row || null, categories: COMPENSATION_CATEGORIES });
  } catch (e) { next(e); }
};

/**
 * POST /payroll/users/:userId/compensation-level
 * body: { agencyId, category, level, applyRates? }
 * When applyRates=true, copies direct/indirect rates from the level definition to the user's rate card.
 */
export const assignUserCompensationLevel = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const agencyId = parseInt(req.body.agencyId, 10);
    const category = parseInt(req.body.category, 10);
    const level = parseInt(req.body.level, 10);
    const applyRates = !!req.body.applyRates;

    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!CATEGORY_IDS.includes(category)) return res.status(400).json({ error: { message: 'Invalid category (must be 1-3)' } });
    if (!LEVEL_IDS.includes(level)) return res.status(400).json({ error: { message: 'Invalid level (must be 1-5)' } });

    await PayrollCompensationLevel.assignToUser(agencyId, userId, category, level, req.user?.id);

    if (applyRates) {
      const def = await PayrollCompensationLevel.getLevel(agencyId, category, level);
      if (def && (def.direct_rate != null || def.indirect_rate != null)) {
        await PayrollRateCard.upsert({
          agencyId,
          userId,
          directRate: Number(def.direct_rate || 0),
          indirectRate: Number(def.indirect_rate || 0),
          updatedByUserId: req.user?.id
        });
      }
    }

    const assignment = await PayrollCompensationLevel.getForUser(agencyId, userId);
    res.json({ assignment });
  } catch (e) { next(e); }
};

/** DELETE /payroll/users/:userId/compensation-level?agencyId= */
export const removeUserCompensationLevel = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;
    const userId = parseInt(req.params.userId, 10);
    await PayrollCompensationLevel.removeFromUser(agencyId, userId);
    res.json({ ok: true });
  } catch (e) { next(e); }
};
