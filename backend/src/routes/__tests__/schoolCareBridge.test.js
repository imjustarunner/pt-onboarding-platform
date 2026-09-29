import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),find:vi.fn(),byId:vi.fn(),access:vi.fn(),account:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findByPortalUrl:m.find,findById:m.byId}}));
vi.mock('../../models/AgencyBillingAccount.model.js',()=>({default:{getByAgencyId:m.account}}));
vi.mock('../../controllers/schoolPortalIntakeLinks.controller.js',()=>({assertSchoolPortalAccess:m.access}));
vi.mock('../../middleware/auth.middleware.js',()=>({authenticate:(_q,_r,n)=>n(),requireSuperAdmin:(_q,_r,n)=>n()}));
vi.mock('../../middleware/loginProtection.middleware.js',()=>({sharedLoginLimiter:()=>((_q,_r,n)=>n())}));
import router from '../schoolCareBridge.routes.js';
const school={id:12,slug:'ashley',portal_url:'ashley',name:'Ashley',organization_type:'school',is_active:1,theme_settings:{},color_palette:{},private_note:'never public'};
async function request(path,req={}){const res={json:vi.fn(),status:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis()};const next=vi.fn();const route=router.stack.find(layer=>layer.route?.path===path && layer.route.methods[req.method||'get']).route;await route.stack.at(-1).handle({params:{slug:'ashley'},body:{},user:{id:5,role:'school_staff'},...req},res,next);return {res,next};}
beforeEach(()=>{vi.clearAllMocks();m.find.mockResolvedValue(school);m.execute.mockResolvedValue([[]]);m.access.mockResolvedValue({org:school});});
describe('SchoolCareBridge school and billing boundaries',()=>{
 it('returns all affiliated brands without private organization fields',async()=>{
  m.execute.mockResolvedValue([[{id:1,name:'ITSCO',slug:'itsco',private_note:'hidden'},{id:2,name:'NLU',slug:'nlu'}]]);
  const {res,next}=await request('/schools/:slug');expect(next).not.toHaveBeenCalled();const payload=res.json.mock.calls[0][0];expect(payload.school.agencies).toHaveLength(2);expect(JSON.stringify(payload)).not.toContain('private_note');
 });
 it('rejects inactive schools and non-school records',async()=>{
  for(const record of [{...school,is_active:0},{...school,organization_type:'agency'},null]){m.find.mockResolvedValue(record);const {res}=await request('/schools/:slug');expect(res.status).toHaveBeenCalledWith(404);}
 });
 it('checks server permissions even when a public school exists',async()=>{
  const denied=Object.assign(new Error('Denied'),{statusCode:403});m.access.mockRejectedValue(denied);const {res,next}=await request('/access/:slug');expect(m.access).toHaveBeenCalled();expect(next).toHaveBeenCalledWith(denied);expect(res.json).not.toHaveBeenCalled();
 });
 it('lists only schools allowed by the existing access evaluator',async()=>{
  m.execute.mockResolvedValue([[school,{...school,id:13,slug:'other'}]]);m.access.mockImplementation(async(_req,id)=>{if(id===13)throw Object.assign(new Error('Denied'),{statusCode:403});});const {res}=await request('/my-schools');expect(res.json.mock.calls[0][0].schools.map(s=>s.id)).toEqual([12]);
 });
 it('fails closed when access checks fail unexpectedly',async()=>{
  m.execute.mockResolvedValue([[school]]);m.access.mockRejectedValue(new Error('database unavailable'));const {res,next}=await request('/my-schools');expect(next).toHaveBeenCalled();expect(res.json).not.toHaveBeenCalled();
 });
 it('reports unlinked billing as incomplete and never enables financial transactions',async()=>{
  m.execute.mockResolvedValue([[{id:1,operator_agency_id:null}]]);const {res}=await request('/program-config');expect(res.json).toHaveBeenCalledWith(expect.objectContaining({setupComplete:false,chargesEnabled:false,invoiceIssuanceEnabled:false,operatorName:'MH4Kidz',invoiceIssuer:'Plot Twist Co'}));
 });
 it('rejects another tenant as program revenue owner',async()=>{
  m.byId.mockResolvedValue({id:9,slug:'itsco',organization_type:'agency',is_active:1});const {res}=await request('/program-config',{method:'put',body:{operatorAgencyId:9}});expect(res.status).toHaveBeenCalledWith(400);expect(m.execute).not.toHaveBeenCalled();
 });
});
