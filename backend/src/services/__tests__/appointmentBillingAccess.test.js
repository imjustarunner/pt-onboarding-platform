import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({db:vi.fn(),agency:vi.fn(),client:vi.fn(),billing:vi.fn(),insurance:vi.fn(),policy:vi.fn(),history:vi.fn(),prepare:vi.fn(),change:vi.fn(),documentation:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.db}}));
vi.mock('../clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.agency}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:m.client}));
vi.mock('../schedulingBillingAccess.service.js',()=>({hasSchedulingBillingAccess:m.billing}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:m.insurance}));
vi.mock('../claimMdWorkflow.service.js',()=>({claimEventHistory:m.history}));
vi.mock('../../controllers/claimMdWorkflow.controller.js',()=>({prepareClaimReview:m.prepare}));
vi.mock('../claimServiceChanges.service.js',()=>({hasPendingClaimChange:m.change}));
vi.mock('../claimContentReview.service.js',()=>({claimDocumentation:m.documentation}));
vi.mock('../appointmentFinancials.service.js',()=>({appointmentFinancials:vi.fn().mockResolvedValue({lines:[],patient:null})}));
vi.mock('../clientAccessLog.service.js',()=>({logClientAccess:vi.fn().mockResolvedValue()}));
vi.mock('../supervisedBillingPolicy.service.js',()=>({resolveDocumentationPolicy:m.policy,hasCurrentSupervisorCosign:()=>true,hasClinicalAmendments:()=>false,isNonBillableDocument:()=>false}));
import {getAppointmentBilling} from '../../controllers/appointmentBilling.controller.js';
const req=()=>({user:{id:3,role:'provider'},query:{agencyId:377},params:{sessionId:5}});
const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()});
beforeEach(()=>{
  vi.clearAllMocks();m.agency.mockResolvedValue();m.client.mockResolvedValue({ok:true});m.billing.mockResolvedValue(false);
  m.db.mockImplementation(async sql=>{
    if(sql.includes('FROM clinical_sessions'))return [[{id:5,client_id:9,provider_user_id:3,service_code:'90837'}]];
    if(sql.includes('FROM clinical_claims'))return [[{id:2,claim_lifecycle:'rejected',clinical_note_id:4,amount_cents:88800,claim_payload:'SECRET'}]];
    return [[{id:4,provider_signed_at:'now'}]];
  });
  m.insurance.mockResolvedValue({primary:{insurerName:'Synthetic',memberId:'member',patientBalance:800},patient:{ssn:'PRIVATE'}});
  m.policy.mockResolvedValue({});m.history.mockResolvedValue([{type:'response',messages:[{fields:'diag_1',message:'CONFIDENTIAL $888.00'}]}]);m.prepare.mockResolvedValue({readiness:{ready:false,blockers:['CONFIDENTIAL $888.00']}});m.change.mockResolvedValue(false);m.documentation.mockResolvedValue({note:{id:4,provider_signed_at:'now'}});
});
it('returns a strict provider projection without amounts, raw messages or payloads',async()=>{
  const r=res(),next=vi.fn();await getAppointmentBilling(req(),r,next);expect(next).not.toHaveBeenCalled();
  const data=r.json.mock.calls[0][0];expect(data.financialAccess).toBe(false);expect(data.progress[0].actions.join(' ')).toContain('Diagnosis');expect(JSON.stringify(data)).not.toMatch(/CONFIDENTIAL|SECRET|PRIVATE|888|patientBalance|financial":/);
});
it('denies another agency before reading session or insurance data',async()=>{
  m.agency.mockRejectedValue(Object.assign(new Error('Forbidden'),{status:403}));const next=vi.fn();await getAppointmentBilling(req(),res(),next);expect(next.mock.calls[0][0].status).toBe(403);expect(m.db).not.toHaveBeenCalled();expect(m.insurance).not.toHaveBeenCalled();
});
it('denies an unassigned client before reading claims or insurance',async()=>{
  m.client.mockResolvedValue({ok:false,status:403,message:'No client access'});const r=res();await getAppointmentBilling(req(),r,vi.fn());expect(r.status).toHaveBeenCalledWith(403);expect(m.db).toHaveBeenCalledTimes(1);expect(m.insurance).not.toHaveBeenCalled();
});
it('denies guardians even if their client relationship would allow a portal profile',async()=>{
  const r=res();await getAppointmentBilling({...req(),user:{id:3,role:'guardian'}},r,vi.fn());expect(r.status).toHaveBeenCalledWith(403);expect(m.db).not.toHaveBeenCalled();
});
it('returns financial evidence only after server authorization',async()=>{
  m.billing.mockResolvedValue(true);const r=res();await getAppointmentBilling({...req(),user:{id:3,role:'staff'}},r,vi.fn());expect(r.json.mock.calls[0][0].progress[0].financial.chargeCents).toBe(88800);
});
