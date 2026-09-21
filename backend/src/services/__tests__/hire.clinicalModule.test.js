import { describe, it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), content: vi.fn(), values: vi.fn(), bulk: vi.fn(), dedicated: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/ModuleContent.model.js', () => ({ default: { findByModuleId: m.content } }));
vi.mock('../../models/UserInfoValue.model.js', () => ({ default: { findByUserAndFieldIds: m.values, bulkUpdate: m.bulk } }));
vi.mock('../portalTraining.service.js', () => ({ hasPortalClinicalProfile: m.dedicated }));
vi.mock('../../models/ProviderSearchIndex.model.js', () => ({ default: { upsertForUserInAgency: vi.fn() } }));
import { getModuleFormDefinition, submitModuleForm } from '../../controllers/moduleForm.controller.js';
const req = () => ({ params: { moduleId: '5' }, user: { id: 8 }, query: {} });
const response = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis() });
const definitions = [
  { id: 1, field_key: 'specialties_general', field_type: 'textarea', field_label: 'Specialties', options: null },
  { id: 2, field_key: 'groups', field_type: 'textarea', field_label: 'Groups', options: null },
  { id: 3, field_key: 'research', field_type: 'textarea', field_label: 'Research', options: null }
];
beforeEach(() => {
  vi.clearAllMocks();
  m.execute.mockResolvedValue([definitions]);
  m.content.mockResolvedValue([{ id: 2, content_type: 'form', content_data: { fieldDefinitionIds: [1, 2, 3] } }]);
  m.values.mockResolvedValue([{ field_definition_id: 1, value: '["Anxiety"]' }]);
  m.dedicated.mockResolvedValue(false);
});
describe('clinical options in assigned questionnaires', () => {
  it('hydrates raw field definitions with current catalogs and saved answers', async () => {
    const res = response(), next = vi.fn();
    await getModuleFormDefinition(req(), res, next);
    expect(next).not.toHaveBeenCalled();
    const fields = res.json.mock.calls[0][0].fields;
    expect(fields[0]).toMatchObject({ field_type: 'multi_select', clinical_profile: true, value: '["Anxiety"]' });
    expect(fields[0].options).toContain('Executive Functioning');
    expect(fields[1].options).toContain('Student Athletes');
    expect(fields[1].options).not.toContain('Teen');
  });
  it('moves repeated questions into the dedicated step while keeping unrelated fields', async () => {
    m.dedicated.mockResolvedValue(true);
    const res = response(), next = vi.fn();
    await getModuleFormDefinition({ ...req(), portalUser: { id: 8 } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ clinicalProfileStep: true, fields: [{ id: 3 }] });
    expect(res.json.mock.calls[0][0].fields).toHaveLength(1);
  });
  it('persists intentional empty clinical choices without wiping unrelated blanks', async () => {
    const res = response(), next = vi.fn();
    await submitModuleForm({ ...req(), body: { skipBlanks: true, values: [{ fieldDefinitionId: 1, value: '[]' }, { fieldDefinitionId: 3, value: '' }] } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(m.bulk).toHaveBeenCalledWith(8, [{ fieldDefinitionId: 1, value: '[]' }]);
  });
});
