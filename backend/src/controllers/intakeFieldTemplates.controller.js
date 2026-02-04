import { validationResult } from 'express-validator';
import AgencyIntakeFieldTemplate from '../models/AgencyIntakeFieldTemplate.model.js';

export const listIntakeFieldTemplates = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.query.agencyId, 10);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const rows = await AgencyIntakeFieldTemplate.listByAgency(agencyId);
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const createIntakeFieldTemplate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseInt(req.body.agencyId, 10);
    const fieldsJson = req.body.fieldsJson || [];
    const template = await AgencyIntakeFieldTemplate.create({
      agencyId,
      name: String(req.body.name || '').trim(),
      fieldsJson,
      isActive: req.body.isActive !== false
    });
    res.status(201).json({ template });
  } catch (error) {
    next(error);
  }
};
