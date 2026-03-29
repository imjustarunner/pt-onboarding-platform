import { validationResult } from 'express-validator';
import AgencyIntakeFieldTemplate from '../models/AgencyIntakeFieldTemplate.model.js';

export const listIntakeFieldTemplates = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.query.agencyId, 10);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const templateType = req.query.type || null;
    const rows = await AgencyIntakeFieldTemplate.listByAgency(agencyId, templateType);
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
    const templateType = String(req.body.templateType || 'field_template').trim();
    const template = await AgencyIntakeFieldTemplate.create({
      agencyId,
      name: String(req.body.name || '').trim(),
      fieldsJson,
      templateType,
      isActive: req.body.isActive !== false
    });
    res.status(201).json({ template });
  } catch (error) {
    next(error);
  }
};

export const updateIntakeFieldTemplate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });

    const { name, fieldsJson, isActive } = req.body;
    const template = await AgencyIntakeFieldTemplate.update(id, { name, fieldsJson, isActive });
    if (!template) return res.status(404).json({ error: { message: 'Template not found' } });
    res.json({ template });
  } catch (error) {
    next(error);
  }
};

export const deleteIntakeFieldTemplate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    await AgencyIntakeFieldTemplate.delete(id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
