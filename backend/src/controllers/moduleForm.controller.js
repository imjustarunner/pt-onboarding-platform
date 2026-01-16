import pool from '../config/database.js';
import ModuleContent from '../models/ModuleContent.model.js';
import UserInfoFieldDefinition from '../models/UserInfoFieldDefinition.model.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import { validationResult } from 'express-validator';

function parseContentData(contentRow) {
  const data = contentRow?.content_data;
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

function normalizeIdArray(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => (x === null || x === undefined ? null : parseInt(x)))
    .filter((x) => Number.isInteger(x) && x > 0);
}

async function loadFieldDefinitionsByIds(fieldDefinitionIds) {
  if (!fieldDefinitionIds || fieldDefinitionIds.length === 0) return [];
  const placeholders = fieldDefinitionIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT * FROM user_info_field_definitions WHERE id IN (${placeholders})`,
    fieldDefinitionIds
  );
  return rows;
}

function isMissingValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  // boolean false is valid, number 0 is valid, objects should be JSON-stringified by caller
  return false;
}

export const getModuleFormDefinition = async (req, res, next) => {
  try {
    const moduleId = parseInt(req.params.moduleId);
    if (!Number.isInteger(moduleId)) {
      return res.status(400).json({ error: { message: 'Invalid moduleId' } });
    }

    const content = await ModuleContent.findByModuleId(moduleId);
    const formPagesRaw = (content || []).filter((c) => c.content_type === 'form');

    const pages = formPagesRaw.map((row) => {
      const data = parseContentData(row) || {};
      return {
        contentId: row.id,
        orderIndex: row.order_index,
        categoryKey: data.categoryKey || null,
        fieldDefinitionIds: normalizeIdArray(data.fieldDefinitionIds),
        requireAll: data.requireAll === true
      };
    });

    const fieldDefinitionIds = Array.from(
      new Set(pages.flatMap((p) => p.fieldDefinitionIds))
    );

    const fieldDefs = await loadFieldDefinitionsByIds(fieldDefinitionIds);
    const fieldDefMap = new Map(fieldDefs.map((f) => [f.id, f]));

    // Preserve the module page ordering for fields
    const orderedFields = fieldDefinitionIds
      .map((id) => fieldDefMap.get(id))
      .filter(Boolean)
      .map((f) => ({
        ...f,
        options: f.options ? (typeof f.options === 'string' ? JSON.parse(f.options) : f.options) : null
      }));

    // Include current user's existing values for these fields (helps the module runner)
    const existingValues = await UserInfoValue.findByUserAndFieldIds(req.user.id, fieldDefinitionIds);
    const valueMap = new Map(existingValues.map((v) => [v.field_definition_id, v.value]));

    const fields = orderedFields.map((f) => ({
      ...f,
      value: valueMap.has(f.id) ? valueMap.get(f.id) : null
    }));

    res.json({
      moduleId,
      pages,
      fields
    });
  } catch (error) {
    next(error);
  }
};

export const submitModuleForm = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const moduleId = parseInt(req.params.moduleId);
    if (!Number.isInteger(moduleId)) {
      return res.status(400).json({ error: { message: 'Invalid moduleId' } });
    }

    const shouldValidate = String(req.query.validate || '').toLowerCase() === 'true';

    const { values } = req.body;
    if (!Array.isArray(values)) {
      return res.status(400).json({ error: { message: 'Values must be an array' } });
    }

    // Persist submitted values for the current user
    const normalizedValues = values
      .map((v) => ({
        fieldDefinitionId: parseInt(v?.fieldDefinitionId),
        value: v?.value ?? null
      }))
      .filter((v) => Number.isInteger(v.fieldDefinitionId) && v.fieldDefinitionId > 0);

    await UserInfoValue.bulkUpdate(req.user.id, normalizedValues);

    if (!shouldValidate) {
      return res.json({ ok: true, validated: false });
    }

    // Compute required fields from the module's form pages
    const content = await ModuleContent.findByModuleId(moduleId);
    const formPagesRaw = (content || []).filter((c) => c.content_type === 'form');

    const pages = formPagesRaw.map((row) => {
      const data = parseContentData(row) || {};
      return {
        fieldDefinitionIds: normalizeIdArray(data.fieldDefinitionIds),
        requireAll: data.requireAll === true
      };
    });

    const referencedFieldIds = Array.from(new Set(pages.flatMap((p) => p.fieldDefinitionIds)));
    const referencedFieldDefs = await loadFieldDefinitionsByIds(referencedFieldIds);
    const referencedDefMap = new Map(referencedFieldDefs.map((f) => [f.id, f]));

    const requiredFieldIds = Array.from(
      new Set(
        pages.flatMap((p) => {
          if (p.requireAll) return p.fieldDefinitionIds;
          return p.fieldDefinitionIds.filter((id) => {
            const def = referencedDefMap.get(id);
            return def && (def.is_required === 1 || def.is_required === true);
          });
        })
      )
    );

    if (requiredFieldIds.length === 0) {
      return res.json({ ok: true, validated: true });
    }

    const requiredValues = await UserInfoValue.findByUserAndFieldIds(req.user.id, requiredFieldIds);
    const requiredValueMap = new Map(requiredValues.map((v) => [v.field_definition_id, v.value]));

    const missingIds = requiredFieldIds.filter((id) => isMissingValue(requiredValueMap.get(id)));

    if (missingIds.length > 0) {
      const missingDefs = await loadFieldDefinitionsByIds(missingIds);
      const missingFields = missingDefs.map((f) => ({
        id: f.id,
        field_key: f.field_key,
        field_label: f.field_label,
        field_type: f.field_type,
        is_required: f.is_required === 1 || f.is_required === true,
        category_key: f.category_key || null
      }));
      return res.status(400).json({
        error: {
          message: 'Missing required fields',
          missingFieldDefinitionIds: missingIds,
          missingFields
        }
      });
    }

    res.json({ ok: true, validated: true });
  } catch (error) {
    next(error);
  }
};

