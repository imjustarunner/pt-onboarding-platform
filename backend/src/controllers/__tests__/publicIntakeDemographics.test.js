import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../services/clientInsurance.service.js', async original => ({ ...await original(), applySubmittedClientInsurance: vi.fn() }));
vi.mock('../../services/intakeEligibility.service.js', () => ({ enqueueIntakeEligibility: vi.fn() }));
vi.mock('../../utils/resolveInsuranceTypeId.js', () => ({ resolveInsuranceTypeIdForAgency: vi.fn(async () => null) }));
import pool from '../../config/database.js';
import { applySubmittedClientInsurance } from '../../services/clientInsurance.service.js';
import { persistChildIntakeData } from '../publicIntake.controller.js';

let chart;
beforeEach(() => {
  vi.clearAllMocks();
  chart = { agency_id: 2, full_name: 'QA Client', gender: '', date_of_birth: '2015-03-14' };
  pool.execute.mockImplementation(async (sql, values) => {
    if (sql.startsWith('UPDATE clients SET')) {
      const index = sql.indexOf('gender = COALESCE');
      if (index >= 0 && !chart.gender) chart.gender = values[(sql.slice(0, index).match(/\?/g) || []).length];
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT agency_id')) return [[{ ...chart }]];
    throw new Error(`Unexpected database request: ${sql}`);
  });
});
async function persist(responses, clientIndex = 0, intakeForSelf = false) {
  return persistChildIntakeData({ clientId: 4, clientIndex, documentsComplete: false,
    intakeData: { intakeForSelf, clients: [{ firstName: 'QA', lastName: 'Client' }], responses: {
      ...responses, submission: { insuranceInfo: { primary: { insurerName: 'Sample Plan', memberId: 'SAMPLE-MEMBER' },
        clientCoverages: [{ clientIndex, confirmed: true }] }, ...(responses.submission || {}) }
    } }
  });
}

it.each([
  ['dependent questionnaire', { clients: [{ child_sex: 'female' }] }, 'female', 'F'],
  ['self questionnaire', { submission: { sex: 'male' } }, 'male', 'M'],
  ['shared clinical answers', { submission: { clinicalResponses: { child_sex: 'female' } } }, 'female', 'F'],
  ['per-client demographics', { clients: [{ demographicsInfo: { gender: 'Male' } }] }, 'Male', 'M']
])('saves sex from the %s and maps it into claim identity', async (_name, responses, gender, sex) => {
  await persist(responses);
  expect(chart.gender).toBe(gender);
  expect(applySubmittedClientInsurance).toHaveBeenCalledWith(expect.objectContaining({ patient: expect.objectContaining({ sex }) }));
});

it('uses the selected child’s own sex instead of the sibling or shared answer', async () => {
  await persist({ clients: [{ child_sex: 'male' }, { child_sex: 'female' }], submission: { demographicsInfo: { gender: 'male' } } }, 1);
  expect(chart.gender).toBe('female');
  expect(applySubmittedClientInsurance).toHaveBeenCalledWith(expect.objectContaining({ patient: expect.objectContaining({ sex: 'F' }) }));
});

it('keeps existing chart sex and maps that existing value into claims', async () => {
  chart.gender = 'male';
  await persist({ clients: [{ child_sex: 'female' }] });
  expect(chart.gender).toBe('male');
  expect(applySubmittedClientInsurance).toHaveBeenCalledWith(expect.objectContaining({ patient: expect.objectContaining({ sex: 'M' }) }));
});

it('leaves an unanswered sex blank rather than copying the guardian or inventing a claim value', async () => {
  await persist({ clients: [{}], guardian: { sex: 'female' } });
  expect(chart.gender).toBe('');
  expect(applySubmittedClientInsurance).toHaveBeenCalledWith(expect.objectContaining({ patient: expect.objectContaining({ sex: '' }) }));
});

it('persists school self-enrollment sex from the signer’s own answers', async () => {
  await persist({ guardian: { client_sex: 'female' } }, 0, true);
  expect(chart.gender).toBe('female');
  expect(applySubmittedClientInsurance).toHaveBeenCalledWith(expect.objectContaining({ patient: expect.objectContaining({ sex: 'F' }) }));
});
