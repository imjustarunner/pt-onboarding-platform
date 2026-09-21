import { needsClinicalProfile } from '../utils/hireClinicalProfile.js';
import { clinicalFieldOptions } from '../utils/providerClinicalFieldOptions.js';
import { PREEMPLOYMENT_KEYS } from '../utils/hirePortalWorkflow.js';
import ModuleContent from '../models/ModuleContent.model.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import Acknowledgment from '../models/Acknowledgment.model.js';
import QuizAttempt from '../models/QuizAttempt.model.js';
import ModuleResponseAnswer from '../models/ModuleResponseAnswer.model.js';
import pool from '../config/database.js';
import { parseMetadata } from './hireJourney.service.js';

// Clinical questions move into the dedicated step; old closed journeys retain their forms.
export async function hasPortalClinicalProfile(userId) {
  const [[user]] = await pool.execute(`SELECT u.role, u.status, u.sees_clients, u.has_provider_access,
    j.onboarding_completed_at, s.step_key AS clinical_step
    FROM users u LEFT JOIN hire_journeys j ON j.user_id = u.id
    LEFT JOIN hire_portal_submissions s ON s.user_id = u.id AND s.phase = 'onboarding' AND s.step_key = 'clinical-profile'
    WHERE u.id = ?`, [userId]);
  return !!user?.clinical_step || (user?.status === 'ONBOARDING' && !user?.onboarding_completed_at && needsClinicalProfile(user));
}

export async function portalModuleForms(userId, moduleId) {
  const content = await ModuleContent.findByModuleId(moduleId);
  const pages = content.filter((c) => c.content_type === 'form').map((c) => parseMetadata(c.content_data));
  const ids = [...new Set(pages.flatMap((p) => p.fieldDefinitionIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return { fields: [], pages };
  const [defs] = await pool.execute(`SELECT id, field_key, field_label, field_type, is_required FROM user_info_field_definitions WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  const values = await UserInfoValue.findByUserAndFieldIds(userId, ids);
  const clinicalProfile = await hasPortalClinicalProfile(userId);
  return { pages, fields: defs.filter(d => !PREEMPLOYMENT_KEYS.has(d.field_key) && !(clinicalProfile && clinicalFieldOptions(d.field_key))).map((d) => ({ id: d.id, label: d.field_label, type: d.field_type,
    required: !!Number(d.is_required) || pages.some((p) => p.requireAll && (p.fieldDefinitionIds || []).map(Number).includes(d.id)),
    value: values.find((v) => Number(v.field_definition_id) === Number(d.id))?.value ?? null })) };
}

export async function validatePortalModuleCompletion(userId, moduleId) {
  const content = await ModuleContent.findByModuleId(moduleId);
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!content.length) fail('This training has no published content. Contact People Operations.');
  const { fields } = await portalModuleForms(userId, moduleId);
  const missing = fields.filter((f) => f.required && (f.value == null || ['', '[]'].includes(String(f.value).trim())));
  if (missing.length) fail(`Complete the required profile fields: ${missing.map((f) => f.label).join(', ')}`);
  for (const block of content) {
    const data = parseMetadata(block.content_data);
    const settings = parseMetadata(block.settings);
    if (settings.required === false) continue;
    if (['acknowledgment', 'acknowledgement'].includes(block.content_type) && !await Acknowledgment.hasAcknowledged(userId, moduleId)) {
      fail('Save the training acknowledgment before completing this module.');
    }
    if (block.content_type === 'quiz') {
      const attempts = await QuizAttempt.findByUserAndModule(userId, moduleId);
      if (!attempts.some((a) => Number(a.score) >= Number(data.minimumScore || 0))) fail('Pass the required quiz before completing this module.');
    }
    if (block.content_type === 'knowledge_check') {
      const saved = await ModuleResponseAnswer.findByUserAndContent(userId, block.id);
      const answer = parseMetadata(saved?.response_text);
      if (answer.selected == null || Number(answer.selected) !== Number(data.correctAnswer)) fail('Complete the required knowledge checks.');
    }
  }
}
