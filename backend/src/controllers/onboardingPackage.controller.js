import OnboardingPackage from '../models/OnboardingPackage.model.js';
import { validationResult } from 'express-validator';
import UserTrack from '../models/UserTrack.model.js';
import TaskAssignmentService from '../services/taskAssignment.service.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import Module from '../models/Module.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import pool from '../config/database.js';

export const getAllPackages = async (req, res, next) => {
  try {
    const { agencyId, includeInactive } = req.query;
    const filters = {
      agencyId: agencyId ? parseInt(agencyId) : undefined,
      includeInactive: includeInactive === 'true'
    };

    // If user is admin (not super_admin), filter to their agencies
    if (req.user.role === 'admin' && !agencyId) {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      if (userAgencies.length > 0) {
        // Get packages for user's agencies and platform-wide packages
        const agencyIds = userAgencies.map(a => a.id);
        const [rows] = await pool.execute(
          `SELECT * FROM onboarding_packages 
           WHERE (agency_id IN (${agencyIds.map(() => '?').join(',')}) OR agency_id IS NULL)
           ${!includeInactive ? 'AND is_active = TRUE' : ''}
           ORDER BY name ASC`,
          agencyIds
        );
        return res.json(rows);
      }
    }

    const packages = await OnboardingPackage.findAll(filters);
    res.json(packages);
  } catch (error) {
    next(error);
  }
};

export const getPackageById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pkg = await OnboardingPackage.findById(id);

    if (!pkg) {
      return res.status(404).json({ error: { message: 'Onboarding package not found' } });
    }

    // Get all associated items
    const trainingFocuses = await OnboardingPackage.getTrainingFocuses(id);
    const modules = await OnboardingPackage.getModules(id);
    const documents = await OnboardingPackage.getDocuments(id);
    const checklistItems = await OnboardingPackage.getChecklistItems(id);
    const intakeLinks = await OnboardingPackage.getIntakeLinks(id);

    res.json({
      ...pkg,
      trainingFocuses,
      modules,
      documents,
      checklistItems,
      intakeLinks
    });
  } catch (error) {
    next(error);
  }
};

export const createPackage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { name, description, agencyId, isActive, packageType, lifecycleItemKeys } = req.body;

    const pkg = await OnboardingPackage.create({
      name,
      description,
      agencyId: agencyId || null,
      createdByUserId: req.user.id,
      isActive: isActive !== undefined ? isActive : true,
      packageType: packageType || 'onboarding'
    });

    if (lifecycleItemKeys !== undefined) {
      await OnboardingPackage.update(pkg.id, { lifecycleItemKeys });
    }

    const refreshed = await OnboardingPackage.findById(pkg.id);
    res.status(201).json(refreshed || pkg);
  } catch (error) {
    next(error);
  }
};

export const updatePackage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { name, description, agencyId, isActive, packageType, lifecycleItemKeys } = req.body;

    const pkg = await OnboardingPackage.update(id, {
      name,
      description,
      isActive,
      packageType,
      lifecycleItemKeys
    });

    if (!pkg) {
      return res.status(404).json({ error: { message: 'Onboarding package not found' } });
    }

    // If lifecycle_item_keys changed, retroactively re-scope all assigned users.
    if (lifecycleItemKeys !== undefined) {
      setImmediate(async () => {
        try {
          const { scopeFromPackageAssignment } = await import('../services/lifecycleScope.service.js');
          const [userRows] = await pool.execute(
            `SELECT DISTINCT t.assigned_to_user_id
             FROM tasks t
             WHERE t.assigned_to_user_id IS NOT NULL
               AND t.metadata IS NOT NULL
               AND JSON_VALID(t.metadata) = 1
               AND JSON_EXTRACT(t.metadata, '$.fromPackage') = ?`,
            [parseInt(id, 10)]
          );
          for (const row of userRows || []) {
            await scopeFromPackageAssignment(row.assigned_to_user_id, parseInt(id, 10));
          }
        } catch (scopeErr) {
          console.warn('[updatePackage] retroactive scope failed:', scopeErr?.message);
        }
      });
    }

    res.json(pkg);
  } catch (error) {
    next(error);
  }
};

export const deletePackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await OnboardingPackage.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: { message: 'Onboarding package not found' } });
    }

    res.json({ message: 'Onboarding package deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Training Focus management
export const addTrainingFocusToPackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { trackId, orderIndex } = req.body;

    await OnboardingPackage.addTrainingFocus(id, trackId, orderIndex || 0);
    const trainingFocuses = await OnboardingPackage.getTrainingFocuses(id);

    res.json(trainingFocuses);
  } catch (error) {
    next(error);
  }
};

export const removeTrainingFocusFromPackage = async (req, res, next) => {
  try {
    const { id, trackId } = req.params;
    await OnboardingPackage.removeTrainingFocus(id, trackId);
    res.json({ message: 'Training focus removed from package' });
  } catch (error) {
    next(error);
  }
};

// Module management
export const addModuleToPackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { moduleId, orderIndex } = req.body;

    await OnboardingPackage.addModule(id, moduleId, orderIndex || 0);
    const modules = await OnboardingPackage.getModules(id);

    res.json(modules);
  } catch (error) {
    next(error);
  }
};

export const removeModuleFromPackage = async (req, res, next) => {
  try {
    const { id, moduleId } = req.params;
    await OnboardingPackage.removeModule(id, moduleId);
    res.json({ message: 'Module removed from package' });
  } catch (error) {
    next(error);
  }
};

// Document management
export const addDocumentToPackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { documentTemplateId, orderIndex, actionType, dueDateDays } = req.body;

    await OnboardingPackage.addDocument(
      id,
      documentTemplateId,
      orderIndex || 0,
      actionType || 'signature',
      dueDateDays || null
    );
    const documents = await OnboardingPackage.getDocuments(id);

    // Retroactively scope lifecycle items for all users already assigned this package.
    // Runs async so the response is not delayed.
    setImmediate(async () => {
      try {
        const { scopeFromPackageAssignment } = await import('../services/lifecycleScope.service.js');
        const [userRows] = await pool.execute(
          `SELECT DISTINCT t.assigned_to_user_id
           FROM tasks t
           WHERE t.assigned_to_user_id IS NOT NULL
             AND t.metadata IS NOT NULL
             AND JSON_VALID(t.metadata) = 1
             AND JSON_EXTRACT(t.metadata, '$.fromPackage') = ?`,
          [parseInt(id, 10)]
        );
        for (const row of userRows || []) {
          await scopeFromPackageAssignment(row.assigned_to_user_id, parseInt(id, 10));
        }
      } catch (scopeErr) {
        console.warn('[addDocumentToPackage] retroactive scope failed:', scopeErr?.message);
      }
    });

    res.json(documents);
  } catch (error) {
    next(error);
  }
};

export const removeDocumentFromPackage = async (req, res, next) => {
  try {
    const { id, documentTemplateId } = req.params;
    await OnboardingPackage.removeDocument(id, documentTemplateId);
    res.json({ message: 'Document removed from package' });
  } catch (error) {
    next(error);
  }
};

export const reorderDocumentsInPackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ids = req.body?.documentTemplateIds || req.body?.orderedIds || [];
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: { message: 'documentTemplateIds array is required' } });
    }
    const documents = await OnboardingPackage.reorderDocuments(id, ids);
    res.json(documents);
  } catch (error) {
    next(error);
  }
};

export const addChecklistItemToPackage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { checklistItemId, orderIndex } = req.body;

    const checklistItems = await OnboardingPackage.addChecklistItem(id, parseInt(checklistItemId), orderIndex || 0);
    res.json(checklistItems);
  } catch (error) {
    next(error);
  }
};

export const removeChecklistItemFromPackage = async (req, res, next) => {
  try {
    const { id, checklistItemId } = req.params;
    await OnboardingPackage.removeChecklistItem(id, parseInt(checklistItemId));
    res.json({ message: 'Checklist item removed from package' });
  } catch (error) {
    next(error);
  }
};

// Intake Link management
export const addIntakeLinkToPackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { intakeLinkId, orderIndex } = req.body;
    if (!intakeLinkId) return res.status(400).json({ error: { message: 'intakeLinkId is required' } });
    const links = await OnboardingPackage.addIntakeLink(id, parseInt(intakeLinkId), orderIndex || 0);
    res.json(links);
  } catch (error) { next(error); }
};

export const removeIntakeLinkFromPackage = async (req, res, next) => {
  try {
    const { id, intakeLinkId } = req.params;
    await OnboardingPackage.removeIntakeLink(id, parseInt(intakeLinkId));
    res.json({ message: 'Intake link removed from package' });
  } catch (error) { next(error); }
};

// Assign package to user(s)
export const assignPackage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    const { userIds, agencyId, dueDate } = req.body;
    const User = (await import('../models/User.model.js')).default;
    if (req.user.role !== 'super_admin') {
      const agencies = await User.getAgencies(req.user.id);
      if (!agencies.some((a) => Number(a.id) === Number(agencyId))) return res.status(403).json({ error: { message: 'Organization access required.' } });
    }
    const { assignPackageToUser } = await import('../services/packageAssignment.service.js');
    const results = [];
    for (const userId of userIds) {
      results.push(await assignPackageToUser({ packageId: Number(req.params.id), userId: Number(userId),
        agencyId: Number(agencyId), dueDate, assignedByUserId: req.user.id }));
    }
    res.json({ message: 'Package assigned. Use Promote to onboarding when pre-hire review is complete.', assignments: results,
      summary: { usersAssigned: results.length } });
  } catch (error) { next(error); }
};
