import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import pool from '../config/database.js';
import Module from '../models/Module.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import UserInfoFieldDefinition from '../models/UserInfoFieldDefinition.model.js';
import { resolveOptionSource } from '../config/formOptionSources.js';

function findRepoFileCandidates(relativePathFromRepoRoot) {
  // The backend runs with cwd=backend/ in most scripts; be defensive.
  const cwd = process.cwd();
  return [
    path.join(cwd, relativePathFromRepoRoot),
    path.join(cwd, '..', relativePathFromRepoRoot),
    path.join(cwd, '..', '..', relativePathFromRepoRoot)
  ];
}

async function readRepoFile(relativePathFromRepoRoot) {
  const candidates = findRepoFileCandidates(relativePathFromRepoRoot);
  for (const p of candidates) {
    try {
      return await fs.readFile(p, 'utf8');
    } catch {
      // try next
    }
  }
  throw new Error(`Unable to find ${relativePathFromRepoRoot} (tried: ${candidates.join(', ')})`);
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function mapSpecRoleToUserRoles(specRole) {
  const r = normalizeRole(specRole);
  // This is the v1 mapping; tweak as needed.
  if (r === 'all_staff') {
    return [
      'provider',
      'clinician',
      'intern',
      'facilitator',
      'school_staff',
      'staff',
      'supervisor',
      'clinical_practice_assistant',
      'admin',
      'support',
      'super_admin'
    ];
  }
  if (r === 'clinical_provider') return ['provider', 'clinician', 'supervisor', 'admin', 'support', 'super_admin'];
  if (r === 'clinical_intern') return ['intern', 'supervisor', 'admin', 'support', 'super_admin'];
  if (r === 'facilitator') return ['facilitator', 'supervisor', 'admin', 'support', 'super_admin'];
  if (r === 'admin') return ['admin', 'support', 'super_admin'];
  if (r === 'operations') return ['admin', 'support', 'super_admin'];
  return [];
}

function mapSpecFieldTypeToUserInfoType(specType) {
  const t = String(specType || '').trim().toLowerCase();
  if (t === 'single_select') return 'select';
  if (t === 'multi_select') return 'multi_select';
  if (t === 'textarea') return 'textarea';
  if (t === 'text') return 'text';
  if (t === 'email') return 'email';
  if (t === 'phone') return 'phone';
  if (t === 'date') return 'date';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';

  // v1 fallbacks (supported by runner, no schema changes):
  if (t === 'schedule_grid') return 'textarea';
  if (t === 'file') return 'text';

  return 'text';
}

function extractInlineOptions(field) {
  const raw = field?.options_inline;
  if (!raw) return null;
  if (Array.isArray(raw)) {
    // YAML uses [{value,label}] in many places.
    return raw
      .map((o) => (o && typeof o === 'object' ? (o.label ?? o.value) : o))
      .map((v) => String(v || '').trim())
      .filter(Boolean);
  }
  if (Array.isArray(raw?.options)) {
    return raw.options.map((v) => String(v || '').trim()).filter(Boolean);
  }
  return null;
}

async function dedupePlatformFieldKey(fieldKey) {
  const key = String(fieldKey || '').trim();
  if (!key) return;
  const [rows] = await pool.execute(
    `SELECT id
     FROM user_info_field_definitions
     WHERE field_key = ?
       AND agency_id IS NULL`,
    [key]
  );
  const ids = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
  // IMPORTANT: agency_id is nullable, so duplicates can exist. We do NOT delete duplicates here
  // because that could cascade-delete user_info_values. We just return the smallest id to use.
  if (ids.length === 0) return null;
  ids.sort((a, b) => a - b);
  return ids[0];
}

async function upsertPlatformFieldDefinition({
  fieldKey,
  fieldLabel,
  fieldType,
  options,
  isRequired,
  categoryKey,
  orderIndex = 0
}) {
  const key = String(fieldKey || '').trim();
  if (!key) throw new Error('Missing field_key');

  const primaryId = await dedupePlatformFieldKey(key);

  const [existingRows] = await pool.execute(
    `SELECT id
     FROM user_info_field_definitions
     WHERE field_key = ?
       AND agency_id IS NULL
     ORDER BY is_platform_template DESC, id ASC
     LIMIT 1`,
    [key]
  );
  const existing = existingRows?.[0] || null;

  const payload = {
    fieldKey: key,
    fieldLabel: String(fieldLabel || key),
    fieldType,
    options: options || null,
    isRequired: !!isRequired,
    isPlatformTemplate: true,
    agencyId: null,
    parentFieldId: null,
    orderIndex: Number.isInteger(orderIndex) ? orderIndex : 0
  };

  if (existing?.id) {
    // Update directly using model so JSON options are handled consistently.
    const updated = await UserInfoFieldDefinition.update(existing.id, {
      fieldKey: payload.fieldKey,
      fieldLabel: payload.fieldLabel,
      fieldType: payload.fieldType,
      options: payload.options,
      isRequired: payload.isRequired,
      isPlatformTemplate: true,
      agencyId: null,
      parentFieldId: null,
      orderIndex: payload.orderIndex,
      categoryKey
    });
    return updated;
  }

  // If we found duplicates, prefer updating the primary instead of creating a new one.
  if (primaryId) {
    const updated = await UserInfoFieldDefinition.update(primaryId, {
      fieldKey: payload.fieldKey,
      fieldLabel: payload.fieldLabel,
      fieldType: payload.fieldType,
      options: payload.options,
      isRequired: payload.isRequired,
      isPlatformTemplate: true,
      agencyId: null,
      parentFieldId: null,
      orderIndex: payload.orderIndex,
      categoryKey
    });
    return updated;
  }

  // Create with category_key via raw SQL (model.create doesn't currently accept categoryKey).
  const [result] = await pool.execute(
    `INSERT INTO user_info_field_definitions
     (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)`,
    [
      payload.fieldKey,
      payload.fieldLabel,
      payload.fieldType,
      payload.options ? JSON.stringify(payload.options) : null,
      payload.isRequired ? 1 : 0,
      1,
      categoryKey || null,
      payload.orderIndex
    ]
  );
  const createdId = result.insertId;
  return await UserInfoFieldDefinition.findById(createdId);
}

async function ensureModuleForForm({ formSlug, title }) {
  const marker = `FORM_SPEC:${String(formSlug || '').trim()}`;
  const [rows] = await pool.execute(
    `SELECT id
     FROM modules
     WHERE description LIKE ?
     ORDER BY id ASC
     LIMIT 1`,
    [`%${marker}%`]
  );
  const existingId = rows?.[0]?.id ? Number(rows[0].id) : null;

  if (existingId) {
    await Module.update(existingId, {
      title: String(title || formSlug || 'Form'),
      description: marker
    });
    return await Module.findById(existingId);
  }

  const created = await Module.create({
    title: String(title || formSlug || 'Form'),
    description: marker,
    orderIndex: 0,
    isActive: true,
    agencyId: null,
    trackId: null,
    isShared: true,
    isAlwaysAccessible: false,
    isPublic: false,
    isStandalone: false,
    standaloneCategory: null,
    estimatedTimeMinutes: null,
    iconId: null,
    createdByUserId: null
  });
  return created;
}

async function upsertFormPages({ moduleId, formSlug, sections, fieldKeyToId }) {
  const existing = await ModuleContent.findByModuleId(moduleId);
  const existingFormPages = (existing || []).filter((c) => c.content_type === 'form');

  const bySection = new Map();
  for (const row of existingFormPages) {
    let data = row.content_data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        data = {};
      }
    }
    const sec = String(data?.specSectionSlug || '').trim();
    if (sec) bySection.set(sec, { row, data });
  }

  let order = 0;
  const keepIds = new Set();

  for (const section of sections || []) {
    order += 1;
    const sectionSlug = String(section.section_slug || '').trim();
    if (!sectionSlug) continue;

    const specVisibleRoles = Array.isArray(section.visible_to_roles) ? section.visible_to_roles : [];
    const mappedVisibleToRoles = Array.from(
      new Set(specVisibleRoles.flatMap(mapSpecRoleToUserRoles).map(normalizeRole).filter(Boolean))
    );

    const fieldIds = (section.fields || [])
      .map((f) => fieldKeyToId.get(String(f.field_key || '').trim()))
      .filter((id) => Number.isInteger(id) && id > 0);

    // Track which fields should behave as file uploads in the UI (v1: stored as text URLs).
    const fileFieldDefinitionIds = (section.fields || [])
      .filter((f) => String(f?.type || '').trim().toLowerCase() === 'file')
      .map((f) => fieldKeyToId.get(String(f.field_key || '').trim()))
      .filter((id) => Number.isInteger(id) && id > 0);

    const contentData = {
      specFormSlug: String(formSlug || '').trim(),
      specSectionSlug: sectionSlug,
      categoryKey: sectionSlug,
      title: String(section.title || sectionSlug),
      fieldDefinitionIds: fieldIds,
      fileFieldDefinitionIds: fileFieldDefinitionIds,
      requireAll: false,
      visibleToRoles: mappedVisibleToRoles
    };

    const existingEntry = bySection.get(sectionSlug);
    if (existingEntry?.row?.id) {
      keepIds.add(existingEntry.row.id);
      await ModuleContent.update(existingEntry.row.id, {
        contentType: 'form',
        contentData,
        orderIndex: order - 1
      });
    } else {
      const created = await ModuleContent.create({
        moduleId,
        contentType: 'form',
        contentData,
        orderIndex: order - 1
      });
      keepIds.add(created.id);
    }
  }

  // Remove form pages that were previously spec-generated but no longer exist in spec.
  for (const row of existingFormPages) {
    if (!keepIds.has(row.id)) {
      let data = row.content_data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          data = {};
        }
      }
      if (String(data?.specFormSlug || '').trim() === String(formSlug || '').trim()) {
        await ModuleContent.delete(row.id);
      }
    }
  }
}

export class FormSpecSyncService {
  static async syncFromProviderOnboardingModulesMd() {
    const raw = await readRepoFile('PROVIDER_ONBOARDING_MODULES.md');
    const spec = YAML.parse(raw);
    if (!spec || typeof spec !== 'object') {
      throw new Error('Invalid YAML in PROVIDER_ONBOARDING_MODULES.md');
    }

    const forms = Array.isArray(spec.forms) ? spec.forms : [];
    if (!forms.length) return { ok: true, forms: 0, fieldsUpserted: 0, modulesUpserted: 0 };

    let fieldsUpserted = 0;
    let modulesUpserted = 0;

    for (const form of forms) {
      const formSlug = String(form.form_slug || '').trim();
      if (!formSlug) continue;

      const sections = Array.isArray(form.sections) ? form.sections : [];

      // Upsert field definitions for all fields in this form.
      const fieldKeyToId = new Map();
      let fieldOrder = 0;
      for (const section of sections) {
        const sectionSlug = String(section.section_slug || '').trim() || null;
        const fields = Array.isArray(section.fields) ? section.fields : [];
        for (const f of fields) {
          fieldOrder += 1;
          const fieldKey = String(f.field_key || '').trim();
          if (!fieldKey) continue;

          const fieldType = mapSpecFieldTypeToUserInfoType(f.type);
          const inlineOptions = extractInlineOptions(f);
          const sourceKey = String(f.options_source || '').trim();
          const sourceOptions = sourceKey ? await resolveOptionSource(sourceKey) : null;
          const options = inlineOptions || sourceOptions || null;

          const upserted = await upsertPlatformFieldDefinition({
            fieldKey,
            fieldLabel: f.label || f.question || fieldKey,
            fieldType,
            options,
            isRequired: f.required === true,
            categoryKey: sectionSlug,
            orderIndex: fieldOrder
          });
          fieldKeyToId.set(fieldKey, Number(upserted.id));
          fieldsUpserted += 1;
        }
      }

      // Ensure a module exists for the form, and create/update form pages.
      const mod = await ensureModuleForForm({ formSlug, title: form.title || formSlug });
      await upsertFormPages({ moduleId: mod.id, formSlug, sections, fieldKeyToId });
      modulesUpserted += 1;
    }

    return { ok: true, forms: forms.length, fieldsUpserted, modulesUpserted };
  }
}

