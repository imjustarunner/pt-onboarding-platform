import multer from 'multer';
import {
  USER_GRID_FIELDS,
  USER_GRID_MAX_COLUMNS,
  defaultUserGridFieldKeys
} from '../constants/userGridFields.js';
import {
  listUserGrid,
  saveUserGridCells,
  bulkSetUserGridField,
  bulkArchiveUsers,
  bulkDeleteUsers,
  uploadUserGridFile
} from '../services/userGrid.service.js';

export const gridUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

export const getUserGridFields = async (req, res) => {
  res.json({
    fields: USER_GRID_FIELDS,
    maxColumns: USER_GRID_MAX_COLUMNS,
    defaults: {
      employees: defaultUserGridFieldKeys('employees'),
      school_staff: defaultUserGridFieldKeys('school_staff'),
      guardians: defaultUserGridFieldKeys('guardians')
    }
  });
};

export const getUserGrid = async (req, res, next) => {
  try {
    const data = await listUserGrid({
      reqUser: req.user,
      agencyId: req.query.agency_id,
      organizationId: req.query.organization_id,
      persona: req.query.persona || 'employees',
      includeArchived: req.query.includeArchived === 'true',
      roleFilter: req.query.role,
      fieldsRaw: req.query.fields
    });
    res.json(data);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    next(err);
  }
};

export const putUserGridCells = async (req, res, next) => {
  try {
    const result = await saveUserGridCells({
      reqUser: req.user,
      updates: req.body?.updates,
      agencyId: req.body?.agencyId || req.query.agency_id
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    next(err);
  }
};

export const putUserGridBulk = async (req, res, next) => {
  try {
    const result = await bulkSetUserGridField({
      reqUser: req.user,
      userIds: req.body?.userIds,
      fieldKey: req.body?.field,
      value: req.body?.value,
      agencyId: req.body?.agencyId || req.query.agency_id
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    next(err);
  }
};

export const postUserGridBulkArchive = async (req, res, next) => {
  try {
    const result = await bulkArchiveUsers({ reqUser: req.user, userIds: req.body?.userIds });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    next(err);
  }
};

export const postUserGridBulkDelete = async (req, res, next) => {
  try {
    const result = await bulkDeleteUsers({ reqUser: req.user, userIds: req.body?.userIds });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    next(err);
  }
};

export const postUserGridFile = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const result = await uploadUserGridFile({
      reqUser: req.user,
      userId,
      fieldKey: req.body?.field || req.query.field,
      file: req.file
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    next(err);
  }
};
