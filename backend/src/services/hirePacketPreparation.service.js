import { assertHireFormReady } from '../utils/hireDocumentFields.js';
import pool from '../config/database.js';
import { isAssignableSupervisor } from '../utils/staffEligibility.js';
import { composeWorkflow, jsonObject } from '../utils/hirePortalWorkflow.js';
import { mergePrehireDocuments } from '../utils/prehireConfigSanitize.js';

export async function prepareHirePacket({ userId, agencyId, body }) {
  const [[agency]] = await pool.execute('SELECT prehire_settings FROM agencies WHERE id = ?', [agencyId]);
  const settings = jsonObject(agency?.prehire_settings);
  const [[job]] = await pool.execute(`SELECT jd.id, jd.title, jd.description_text, jd.description_sections_json, jd.schedule_text, jd.prehire_config_json, jd.default_contract_config_id FROM hiring_profiles hp JOIN hiring_job_descriptions jd
    ON jd.id = hp.job_description_id AND jd.agency_id = ? WHERE hp.candidate_user_id = ?`, [agencyId, userId]);
  const jobConfig = jsonObject(job?.prehire_config_json);
  const preset = (settings.hire_packet_templates || []).find((p) => p.id === body.packetTemplateId);
  const workflow = composeWorkflow(settings.portal_workflow, jobConfig.workflow, { ...(preset?.workflow || {}), ...(body.portalWorkflow || {}) });
  workflow.resources = workflow.resources.filter(resource => resource.phase === 'pre_hire');
  const availableDocs = mergePrehireDocuments(jobConfig, { documents: settings.default_prehire_docs || [] }).documents;
  const selected = Array.isArray(body.selectedJobDocs) ? new Set(body.selectedJobDocs.map((d) => String(d.id))) : null;
  const documents = selected ? availableDocs.filter((d) => selected.has(String(d.id))) : availableDocs;
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!job || (!String(job.description_text || '').trim() && !Object.keys(jsonObject(job.description_sections_json)).length)) fail('Attach the job description this person is being hired for before sending pre-hire.');
  if (workflow.supervisorUserId) {
    const [[supervisor]] = await pool.execute(`SELECT u.first_name, u.last_name, u.role, u.status, u.is_active, u.has_supervisor_privileges FROM users u JOIN user_agencies ua ON ua.user_id = u.id
      WHERE u.id = ? AND ua.agency_id = ? AND COALESCE(ua.is_active, 1) = 1 AND u.is_active = 1`, [workflow.supervisorUserId, agencyId]);
    if (!isAssignableSupervisor(supervisor) || Number(workflow.supervisorUserId) === Number(userId)) fail('Choose an active employee marked as a supervisor in this organization.');
    workflow.supervisorName = `${supervisor.first_name} ${supervisor.last_name}`.trim();
  }
  if (workflow.supervisorRole) {
    if (!Number(body.contractConfigId || job.default_contract_config_id || settings.default_contract_config_id)) fail('Select a Contract Generator configuration so supervisory duties can be included in the agreement.');
    if (!workflow.supervisorClause || !workflow.supervisorTemplateId) fail('Configure the supervisor duties clause and supervisor acknowledgement template before selecting a supervisory role.');
    const [[document]] = await pool.execute('SELECT agency_id, document_action_type, is_active FROM document_templates WHERE id = ?', [workflow.supervisorTemplateId]);
    if (!document || Number(document.agency_id) !== Number(agencyId) || !document.is_active || document.document_action_type !== 'signature') fail('Choose an active supervisor acknowledgement signature template belonging to this organization.');
  }
  for (const resource of workflow.resources) {
    if (resource.kind === 'document') {
      const [[document]] = await pool.execute('SELECT * FROM document_templates WHERE id = ?', [resource.templateId]);
      if (!document || Number(document.agency_id) !== Number(agencyId) || !document.is_active) fail(`Select an active template for ${resource.title} in this organization.`);
      assertHireFormReady(document);
    } else if (resource.required && !resource.url) fail(`Attach a link for ${resource.title} before sending this packet.`);
  }
  for (const doc of documents) {
    if (doc.templateId) {
      const [[template]] = await pool.execute('SELECT * FROM document_templates WHERE id = ?', [doc.templateId]);
      if (!template || (template.agency_id != null && Number(template.agency_id) !== Number(agencyId)) || !template.is_active) fail(`Choose an available document template for ${doc.title}.`);
      assertHireFormReady(template);
    }
    if (doc.kind === 'receipt' && !doc.filePath) fail(`Upload ${doc.title} before sending this packet.`);
    if (doc.kind === 'company_document') {
      if (!doc.bodyHtml && !doc.filePath && !doc.templateId) fail(`Write or attach ${doc.title} before sending this packet.`);
      if (doc.bodyHtml) {
        const { validateDocumentBranding } = await import('./libraryDocument.service.js');
        await validateDocumentBranding({ agencyId, brandingMode: doc.brandingMode, letterheadTemplateId: doc.letterheadTemplateId });
      }
    }
  }
  const packet = { workflow, documents, contractConfigId: Number(job.default_contract_config_id) || null, jobDescription: job ? { id: job.id, title: job.title, descriptionText: job.description_text, descriptionSections: jsonObject(job.description_sections_json), scheduleText: job.schedule_text } : null, handbookUrl: workflow.handbookUrl || settings.handbook_full_url || '',
    onboardingPackageId: null,
    prehirePackageId: Object.hasOwn(body, 'packageId') ? Number(body.packageId) || null : Number(preset?.prehirePackageId || settings.default_prehire_package_id) || null };
  if (!packet.handbookUrl) fail('Add the workplace handbook viewer link in Hiring & Pre-Hire settings before sending.');
  for (const [key, type] of [['prehirePackageId','pre_hire'],['onboardingPackageId','onboarding']]) {
    if (!packet[key]) continue;
    const [[pkg]] = await pool.execute('SELECT agency_id, package_type, is_active FROM onboarding_packages WHERE id = ?', [packet[key]]);
    if (!pkg || Number(pkg.agency_id) !== Number(agencyId) || pkg.package_type !== type || !pkg.is_active) fail(`Select an active ${type.replace('_', '-')} package in this organization.`);
  }
  return packet;
}
export async function retainHirePacket({ userId, agencyId, packet, actorId }) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[user]] = await db.execute('SELECT status FROM users WHERE id = ? FOR UPDATE', [userId]);
    const [[journey]] = await db.execute('SELECT prehire_completed_at FROM hire_journeys WHERE user_id = ?', [userId]);
    if (!['PROSPECTIVE','PENDING_SETUP','PREHIRE_OPEN'].includes(user.status) || journey?.prehire_completed_at) throw Object.assign(new Error('The pre-hire packet is closed. Reopen it before changing its contents.'), { status: 409 });
    await db.execute(`INSERT INTO hire_portal_packets (user_id, agency_id, config_json) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)`, [userId, agencyId, JSON.stringify(packet)]);
    if (packet.workflow.supervisorRole) await db.execute('UPDATE users SET has_supervisor_privileges = 1 WHERE id = ?', [userId]);
    if (packet.workflow.supervisorUserId) {
      const [[existing]] = await db.execute("SELECT id FROM supervisor_assignments WHERE supervisee_id = ? AND agency_id = ? AND supervisor_type = 'clinical' LIMIT 1", [userId, agencyId]);
      if (existing) await db.execute('UPDATE supervisor_assignments SET supervisor_id = ? WHERE id = ?', [packet.workflow.supervisorUserId, existing.id]);
      else await db.execute(`INSERT INTO supervisor_assignments (supervisor_id, supervisee_id, agency_id, supervisor_type, is_primary, created_by_user_id)
        VALUES (?, ?, ?, 'clinical', 1, ?)`, [packet.workflow.supervisorUserId, userId, agencyId, actorId]);
    }
    await db.commit();
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
