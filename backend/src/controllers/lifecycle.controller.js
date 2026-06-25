/**
 * lifecycle.controller.js
 *
 * Handles HR Lifecycle tab operations:
 *   GET    /users/:id/lifecycle            Full lifecycle payload
 *   PATCH  /users/:id/lifecycle/dates      Update milestone dates
 *   PATCH  /users/:id/lifecycle/separation Update separation info
 *   POST   /users/:id/lifecycle/checklist/:definitionId/toggle  Check/uncheck item
 *   POST   /users/:id/lifecycle/sync       Re-run auto-sync
 */
import { getLifecycleData, saveMilestoneDates } from '../services/lifecycle.service.js';
import { syncLifecycleItems } from '../services/lifecycleSync.service.js';
import UserLifecycleChecklistItem from '../models/UserLifecycleChecklistItem.model.js';
import UserSeparationInfo from '../models/UserSeparationInfo.model.js';
import LifecycleChecklistDefinition from '../models/LifecycleChecklistDefinition.model.js';
import { scopeLifecycleItem } from '../services/lifecycleScope.service.js';

// ─────────────────────────────────────────────────────────────────────────────

export const getUserLifecycle = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    // Run auto-sync on every load (non-blocking to response but awaited for accuracy)
    try {
      await syncLifecycleItems(userId);
    } catch {
      // sync failures are non-fatal
    }

    const data = await getLifecycleData(userId);
    res.json(data);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: { message: err.message } });
    next(err);
  }
};

export const updateLifecycleDates = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const allowed = new Set([
      'offer_accepted_date',
      'start_date',
      'orientation_date',
      'therapy_notes_training_date',
      'first_client_date',
      'first_payroll_submission_date',
      'probation_end_date',
    ]);

    const payload = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (allowed.has(k)) {
        payload[k] = v || null;
      }
    }

    await saveMilestoneDates(userId, payload);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const updateSeparationInfo = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const {
      lastDayWorked,
      separationType,
      resignationReceivedDate,
      rehireEligible,
      exitInterviewCompleted,
      offboardingNotes,
    } = req.body || {};

    const validSepTypes = [null, undefined, 'voluntary', 'involuntary'];
    if (separationType !== undefined && !validSepTypes.includes(separationType)) {
      return res.status(400).json({ error: { message: 'separationType must be voluntary or involuntary' } });
    }

    const row = await UserSeparationInfo.upsert(
      userId,
      {
        lastDayWorked: lastDayWorked || null,
        separationType: separationType || null,
        resignationReceivedDate: resignationReceivedDate || null,
        rehireEligible: rehireEligible != null ? !!rehireEligible : null,
        exitInterviewCompleted: !!exitInterviewCompleted,
        offboardingNotes: offboardingNotes || null,
      },
      req.user?.id
    );
    res.json({ ok: true, separation: row });
  } catch (err) {
    next(err);
  }
};

export const toggleLifecycleChecklistItem = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const definitionId = parseInt(req.params.definitionId, 10);
    if (!userId || !definitionId) {
      return res.status(400).json({ error: { message: 'Invalid user id or definition id' } });
    }

    const { completed } = req.body || {};
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: { message: 'completed (boolean) is required' } });
    }

    const def = await LifecycleChecklistDefinition.findById(definitionId);
    if (!def) return res.status(404).json({ error: { message: 'Checklist item not found' } });

    const item = await UserLifecycleChecklistItem.toggle(userId, definitionId, completed, req.user?.id);
    await scopeLifecycleItem(userId, def.item_key, 'manual', definitionId);
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
};

export const syncLifecycle = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    await syncLifecycleItems(userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

/** GET /api/lifecycle/checklist-definitions — for document editor + package config dropdowns */
export const listChecklistDefinitions = async (req, res, next) => {
  try {
    const phase = String(req.query.phase || 'onboarding').toLowerCase();
    const defs = phase === 'offboarding'
      ? await LifecycleChecklistDefinition.findByPhase('offboarding')
      : await LifecycleChecklistDefinition.findByPhase('onboarding');

    const grouped = {};
    for (const def of defs) {
      const cat = def.category || 'other';
      if (!grouped[cat]) {
        grouped[cat] = {
          category: cat,
          label: LifecycleChecklistDefinition.categoryLabel(cat),
          items: []
        };
      }
      grouped[cat].items.push({
        id: def.id,
        itemKey: def.item_key,
        label: def.item_label,
        integrationType: def.integration_type,
        integrationRef: def.integration_ref,
        appliesTo: def.applies_to,
        isRequired: !!def.is_required
      });
    }

    const order = LifecycleChecklistDefinition.categoryOrder(phase);
    const groups = order.filter((c) => grouped[c]).map((c) => grouped[c]);

    res.json({ phase, groups, definitions: defs });
  } catch (err) {
    next(err);
  }
};
