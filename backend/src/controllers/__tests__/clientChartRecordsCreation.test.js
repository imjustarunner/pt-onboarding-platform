import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),create:vi.fn(),history:vi.fn(),agencies:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,query:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/Client.model.js',()=>({default:{create:m.create}}));
vi.mock('../../models/ClientStatusHistory.model.js',()=>({default:{create:m.history}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:m.agencies}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async id=>({id,organization_type:Number(id)===2?'agency':'clinical'}))}}));
vi.mock('../../models/OrganizationAffiliation.model.js',()=>({default:{listActiveOrganizationsForAgency:vi.fn(async()=>[{id:4,organization_type:'clinical'}])}}));
vi.mock('../../services/clientAccessLog.service.js',()=>({logClientAccess:vi.fn(async()=>{})}));
vi.mock('../../services/officeBillingSites.service.js',()=>({setClientDefaultFromSchool:vi.fn()}));
import {createClient} from '../client.controller.js';
const request=()=>({user:{id:10,role:'support'},body:{recordsImport:true,agency_id:2,organization_id:4,full_name:'Synthetic Client',date_of_birth:'2013-01-01',gender:'Male',client_type:'clinical',submission_date:'2026-11-17',identifier_code:'123456'}});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{
 vi.clearAllMocks();m.agencies.mockResolvedValue([{id:2}]);
 m.execute.mockImplementation(async(sql)=>{
  if(sql.includes("LOWER(status_key)='current'"))return [[{id:11,label:'Current'}]];
  if(sql.includes('LOWER(status_key) = ?'))return [[{id:7}]];
  return [[]];
 });
 m.create.mockImplementation(async payload=>({id:12,...payload}));
});
it('creates a records client as Current with the selected organization, birthdate and canonical sex',async()=>{
 const res=response(),next=vi.fn();await createClient(request(),res,next);expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(201);
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({status:'ACTIVE',client_status_id:11,organization_id:4,agency_id:2,date_of_birth:'2013-01-01',gender:'male'}));
 expect(JSON.parse(m.create.mock.calls[0][0].onboarding_docs_json)).toMatchObject({recordsImport:{status:'pending',revision:0,sections:[],startedByUserId:10}});
 expect(JSON.parse(m.history.mock.calls[0][0].to_value)).toMatchObject({status:'ACTIVE',client_status_id:11});
});
it('retains the Received default for ordinary new-intake creation',async()=>{
 const req=request();delete req.body.recordsImport;await createClient(req,response(),vi.fn());
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({status:'PENDING_REVIEW',client_status_id:7}));
});
it('checks agency access before resolving Current or creating a chart',async()=>{
 m.agencies.mockResolvedValue([{id:9}]);const res=response();await createClient(request(),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(403);expect(m.execute).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
});
