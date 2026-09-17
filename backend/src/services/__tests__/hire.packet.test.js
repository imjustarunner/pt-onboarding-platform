import { describe, it, expect, vi, beforeEach } from 'vitest';
const execute = vi.hoisted(() => vi.fn());
vi.mock('../../config/database.js', () => ({ default: { execute } }));
import { prepareHirePacket } from '../hirePacketPreparation.service.js';
let settings, job;
beforeEach(() => {
  settings = { handbook_full_url: 'https://drive.google.com/file/d/handbook/preview', portal_workflow: { supervisorClause: 'Approved duties', supervisorTemplateId: 12 } };
  job = { id: 3, title: 'Counselor', description_text: 'Provide school-based counseling.', default_contract_config_id: 4 };
  execute.mockImplementation(async (sql) => {
    if (sql.includes('SELECT prehire_settings')) return [[{ prehire_settings: settings }]];
    if (sql.includes('FROM hiring_profiles')) return [[job].filter(Boolean)];
    if (sql.includes('FROM users u JOIN user_agencies')) return [[{ first_name: 'Sam', last_name: 'Supervisor' }]];
    if (sql.includes('FROM document_templates')) return [[{ agency_id: 2, document_action_type: 'signature', is_active: 1 }]];
    return [[]];
  });
});
describe('packet readiness before inviting an applicant', () => {
  const request = (body = {}) => prepareHirePacket({ userId: 1, agencyId: 2, body });
  it('retains the applied job description and inherits approved supervisory documents', async () => {
    const packet = await request({ portalWorkflow: { supervisorRole: true } });
    expect(packet.jobDescription).toMatchObject({ id: 3, title: 'Counselor', descriptionText: job.description_text });
    expect(packet.workflow).toMatchObject({ supervisorRole: true, supervisorClause: 'Approved duties', supervisorTemplateId: 12 });
  });
  it('assigns a supervisor without granting supervisory duties to the new hire', async () => {
    expect((await request({ portalWorkflow: { supervisorUserId: 7 } })).workflow).toMatchObject({ supervisorName: 'Sam Supervisor', supervisorRole: false });
  });
  it('blocks a packet with no actual job description', async () => {
    job = null; await expect(request()).rejects.toThrow('job description');
  });
  it('blocks a required resource whose source has not been attached', async () => {
    await expect(request({ portalWorkflow: { resources: [{ id: 'd11', title: 'D11', kind: 'upload', required: true }] } })).rejects.toThrow('Attach a link for D11');
  });
  it('requires approved supervisor content and rejects another tenant’s acknowledgement', async () => {
    settings.portal_workflow.supervisorClause = '';
    await expect(request({ portalWorkflow: { supervisorRole: true } })).rejects.toThrow('supervisor duties clause');
    settings.portal_workflow.supervisorClause = 'Approved';
    const original = execute.getMockImplementation();
    execute.mockImplementation((sql, params) => sql.includes('FROM document_templates') ? [[{ agency_id: 9, document_action_type: 'signature', is_active: 1 }]] : original(sql, params));
    await expect(request({ portalWorkflow: { supervisorRole: true } })).rejects.toThrow('belonging to this organization');
  });
});
