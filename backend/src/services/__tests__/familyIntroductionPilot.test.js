import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),context:vi.fn(),send:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../schoolRoiEmail.service.js',()=>({sendSchoolRoiEmail:m.send}));
vi.mock('../schoolContactPlan.service.js',()=>({getContactPlanContext:m.context}));
vi.mock('../familyWelcomeAssets.service.js',()=>({buildProviderIntroductionPdf:vi.fn(),introductionPdfAttachment:vi.fn(),providerProfileUrl:vi.fn()}));
import {queueFamilyIntroduction,sendPendingFamilyIntroductions} from '../familyIntroductionEmail.service.js';
let agency,plan;
beforeEach(()=>{
 vi.clearAllMocks();agency={id:2,slug:'itsco',is_active:1,is_archived:0,feature_flags:{schoolContactPlanPilot:{enabled:true,providerIds:[8]}}};plan={status:'declined',welcome_seen_at:'2026-11-10T06:00:00Z'};
 m.execute.mockImplementation(async sql=>{
  if(sql.includes('COALESCE(p.provider_user_id'))return [[{id:99,agency_id:2,organization_id:193,provider_user_id:8}]];
  if(sql.startsWith('SELECT id,slug'))return [[agency]];
  if(sql.startsWith('SELECT status'))return [[plan]];
  if(sql.startsWith('SELECT id FROM agencies'))return [[{id:193}]];
  return [{affectedRows:1}];
 });
});
it('queues one support introduction only after a live cohort provider explicitly saves Off',async()=>{
 await queueFamilyIntroduction({execute:m.execute},{clientId:99});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO family_introduction_emails'),[99,2,193,8,expect.any(String)]);
});
it.each([{status:'unconfigured',welcome_seen_at:null},{status:'enabled',welcome_seen_at:'saved'},{status:'declined',welcome_seen_at:null}])('does not substitute support outreach for an unacknowledged or On live plan: $status',async value=>{
 plan=value;await queueFamilyIntroduction({execute:m.execute},{clientId:99});
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO family_introduction_emails'))).toBe(false);
});
it('excludes other providers and does not deliver a queued introduction after access is revoked',async()=>{
 agency.feature_flags.schoolContactPlanPilot.providerIds=[465];await queueFamilyIntroduction({execute:m.execute},{clientId:99});
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO family_introduction_emails'))).toBe(false);
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT intro.*')?[[{id:1,agency_id:2,provider_user_id:8,school_organization_id:193,client_id:99}]]:[{affectedRows:1}]);
 m.context.mockRejectedValue(Object.assign(new Error('Revoked'),{status:403}));
 await sendPendingFamilyIntroductions();expect(m.send).not.toHaveBeenCalled();
});
