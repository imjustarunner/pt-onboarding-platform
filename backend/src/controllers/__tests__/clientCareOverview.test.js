import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),agency:vi.fn(),save:vi.fn(),fiscal:vi.fn(async()=>({total:3})),plan:vi.fn(async()=>({eligible:true})),alerts:vi.fn(async()=>[])}));
vi.mock('../clientQuickView.controller.js',()=>({requireOverviewAccess:m.access}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.agency}}));
vi.mock('../../services/clientFiscalSessions.service.js',()=>({recordFiscalBaseline:m.save,loadClientFiscalSessions:m.fiscal}));
vi.mock('../../services/treatmentPlanEncounterEligibility.service.js',()=>({loadEncounterTreatmentPlanEligibility:m.plan}));
vi.mock('../../services/clinicalDiagnosisPolicy.service.js',()=>({listClientDiagnosisAlerts:m.alerts}));
const essentials = vi.hoisted(() => ({
  db: vi.fn(async (_query, params) => params.length === 1
    ? [[{ timezone: 'America/Denver' }]] : [[{ submitted_at: '2026-11-12T17:00:00Z' }]]),
  permission: vi.fn(), payment: vi.fn(), verification: vi.fn(),
  disclosure: vi.fn(async () => ({ signed_at: '2026-11-12', providers: [{ id: 9 }, { id: 11 }] }))
}));
vi.mock('../../config/database.js', () => ({default: {execute: essentials.db}}));
vi.mock('../../services/clientInsurance.service.js', () => ({
  readClientInsurance: async () => ({
    primary: { insurerName: 'Test insurer', programType: 'commercial', memberId: 'redact-member' },
    secondary: { insurerName: 'Test Medicaid', programType: 'medicaid', memberId: 'redact-secondary' }
  })
}));
vi.mock('../../services/schedulingBillingAccess.service.js', () => ({hasSchedulingBillingAccess: essentials.permission}));
vi.mock('../../services/clientPaymentSetup.service.js', () => ({clientPaymentSetup: essentials.payment}));
vi.mock('../../services/coverageVerificationSummary.service.js', () => ({readCoverageVerificationSummary: essentials.verification}));
vi.mock('../../services/smartDisclosure.service.js', () => ({getLatestDisclosureAcknowledgement: essentials.disclosure}));
vi.mock('../../services/clientSessionSnapshot.service.js', () => ({clientSessionSnapshots: async () => [{lastCompletedAt: '2026-11-20', nextAt: '2026-11-29'}]}));
vi.mock('../../services/clientAccessLog.service.js', () => ({logClientAccess: vi.fn()}));

import {clientCareOverview,clientOverviewEssentials,saveClientFiscalBaseline} from '../clientCareOverview.controller.js';
function response(){const res={set:vi.fn(),json:vi.fn()};res.set.mockReturnValue(res);return res;}
it('requires both chart and agency clinical authorization before exposing counts or alerts',async()=>{
 m.access.mockRejectedValueOnce(Object.assign(Error('Wrong chart'),{status:403}));const next=vi.fn();m.fiscal.mockClear();
 await clientCareOverview({user:{id:9,role:'provider'},params:{id:'12'},query:{agencyId:'3'}},response(),next);expect(next.mock.calls[0][0].status).toBe(403);expect(m.fiscal).not.toHaveBeenCalled();
});
it('attributes a staff-entered historical revision to the authenticated actor, never an input actor',async()=>{
 m.access.mockResolvedValue();m.agency.mockResolvedValue();m.save.mockResolvedValue();const res=response(),input={agencyId:2,count:22,actorUserId:99};
 await saveClientFiscalBaseline({user:{id:9,role:'provider'},params:{id:'12'},query:{},body:input},res,vi.fn());expect(m.save).toHaveBeenCalledWith({agencyId:2,clientId:12,actorUserId:9,input});expect(m.agency).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,requireClinicalService:true}));
});

it('returns only insurance labels to a provider and checks disclosure membership against the viewer', async () => {
  m.access.mockResolvedValue();
  essentials.permission.mockResolvedValue(false);
  const res = response(), next = vi.fn();
  await clientOverviewEssentials({user:{id:9,role:'provider'},params:{id:'12'},query:{agencyId:'2'}},res,next);
  expect(next).not.toHaveBeenCalled();
  const [payload] = res.json.mock.calls[0];
  expect(payload).toMatchObject({
    billing: null, disclosure: { signedAt: '2026-11-12', providerIds: [9, 11] },
    intakeAt: '2026-11-12T17:00:00Z', sessions: { lastAt: '2026-11-20', nextAt: '2026-11-29' }
  });
  expect(payload.policies).toEqual([
    { slot: 'primary', insurerName: 'Test insurer', programType: 'commercial' },
    { slot: 'secondary', insurerName: 'Test Medicaid', programType: 'medicaid' }
  ]);
  expect(essentials.payment).not.toHaveBeenCalled();
  expect(essentials.verification).not.toHaveBeenCalled();
});

it('projects billing verification and payment status without exposing transaction or card details', async () => {
  essentials.permission.mockResolvedValue(true);
  essentials.payment.mockResolvedValue({summary:{cardOnFile:true,medicaid:true,paymentUrl:'redact-payment-url'}});
  essentials.verification.mockResolvedValue({current:true,verifiedAt:'2026-11-23',memberId:'redact-member'});
  const res = response(), next = vi.fn();
  await clientOverviewEssentials({user:{id:10,role:'admin'},params:{id:'12'},query:{agencyId:'2'}},res,next);
  expect(next).not.toHaveBeenCalled();
  const [payload] = res.json.mock.calls[0];
  expect(payload.billing).toEqual({payment:{cardOnFile:true,medicaid:true},verification:{current:true,verifiedAt:'2026-11-23'},verificationUnavailable:false});
  expect(payload.disclosure.providerIds).toEqual([9, 11]);
  expect(JSON.stringify(payload)).not.toContain('redact-');
});
