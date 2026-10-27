import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/SupervisorAssignment.model.js', () => ({ default: { findByAgency: vi.fn(async()=>[]), findBySupervisee: vi.fn(async()=>[]) } }));
import pool from '../../config/database.js';
import Agency from '../../models/Agency.model.js';
import { listDisclosureProviders } from '../smartDisclosure.service.js';
import { listEnrolledProviders } from '../../controllers/publicAgencyServices.controller.js';
const approved = { id: 1433, email: 'qa.provider.auricwell@example.com', role: 'provider', agency_role: 'provider', status: 'ACTIVE_EMPLOYEE', is_demo: 1, first_name: 'QA', last_name: 'Provider', sees_clients: 1 };
const roster = [approved, { ...approved, id: 999, email: 'qa.provider.other@example.com' }, { ...approved, id: 998, email: 'real@tenant.test', is_demo: 0 }];
beforeEach(() => {
  vi.clearAllMocks();
  Agency.findById.mockResolvedValue({ id:450, slug:'auricwell-qa-demo', feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviders:[{id:1433,email:approved.email}]}} });
  pool.execute.mockImplementation(async sql => sql.includes('FROM agency_public_service_types') ? [[{service_type:'counseling',is_enabled:1}]]
    : sql.includes('FROM user_agencies ua') || sql.includes('FROM users u') ? [roster] : [[]]);
});
it('includes only approved demo providers in the QA disclosure and booking directory', async () => {
  expect((await listDisclosureProviders({agencyId:450})).map(p=>p.id)).toEqual([1433]);
  expect((await listEnrolledProviders(450,'counseling')).map(p=>p.id)).toEqual([1433]);
});
it('keeps demo providers excluded from real agencies', async () => {
  expect((await listDisclosureProviders({agencyId:2})).map(p=>p.id)).toEqual([998]);
  expect((await listEnrolledProviders(2,'counseling')).map(p=>p.id)).toEqual([998]);
  expect(Agency.findById).not.toHaveBeenCalled();
});
it('does not treat an unverified agency or malformed roster as permission to expose demos', async () => {
  Agency.findById.mockResolvedValue({id:450,slug:'other',feature_flags:{qaSandbox:{syntheticOnly:true}}});
  expect((await listEnrolledProviders(450,'counseling')).map(p=>p.id)).toEqual([998]);
  Agency.findById.mockResolvedValue({id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviders:[]}}});
  expect(await listDisclosureProviders({agencyId:450})).toEqual([]);
  expect(await listEnrolledProviders(450,'counseling')).toEqual([]);
});
