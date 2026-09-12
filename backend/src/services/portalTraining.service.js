import ModuleContent from '../models/ModuleContent.model.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import Acknowledgment from '../models/Acknowledgment.model.js';
import QuizAttempt from '../models/QuizAttempt.model.js';
import ModuleResponseAnswer from '../models/ModuleResponseAnswer.model.js';
import pool from '../config/database.js';
import { parseMetadata } from './hireJourney.service.js';

export async function portalModuleForms(userId, moduleId) {
  const content = await ModuleContent.findByModuleId(moduleId);
  const pages = content.filter((c) => c.content_type === 'form').map((c) => parseMetadata(c.content_data));
  const ids = [...new Set(pages.flatMap((p) => p.fieldDefinitionIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return { fields: [], pages };
  const [defs] = await pool.execute(`SELECT id, field_label, field_type, is_required FROM user_info_field_definitions WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  const values = await UserInfoValue.findByUserAndFieldIds(userId, ids);
  return { pages, fields: defs.map((d) => ({ id: d.id, label: d.field_label, type: d.field_type,
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
