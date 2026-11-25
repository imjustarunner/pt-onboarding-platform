import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),membership:vi.fn(),audit:vi.fn(),connection:vi.fn(),begin:vi.fn(),school:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection}}));
vi.mock('../../services/enrollmentAgencyAccess.service.js',()=>({assertEnrollmentAgencyMembership:m.membership}));
vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:m.audit}));
vi.mock('../../services/clientChartImportProgress.service.js',()=>({beginClientChartImport:m.begin}));
vi.mock('../../services/clientImportSchoolSetup.service.js',()=>({resolveClientImportSchool:m.school,syncClientImportSchoolSetup:vi.fn()}));
import {getClientImportCandidates,mergeClientRecordsImport} from '../clientImportCandidates.controller.js';
const request=()=>({user:{id:7,role:'support'},get:()=> '6',body:{fullName:'Example Child',dateOfBirth:'2015-01-01',email:'parent@example.test',phone:'303-555-0101',addressStreet:'1 Test St',addressZip:'80202'}});
function response(){return {set:vi.fn().mockReturnThis(),json:vi.fn()};}
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue([[{id:1,full_name:'Example Child',date_of_birth:'2015-01-01',status:'ACTIVE'},{id:2,full_name:'Sibling Example',date_of_birth:'2013-01-01',status:'ACTIVE'}]]);});
it('limits results to the authorized agency and distinguishes duplicate from household suggestions',async()=>{
 const req=request(),res=response(),next=vi.fn();await getClientImportCandidates(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(m.membership).toHaveBeenCalledWith(req.user,6);
 const [sql,args]=m.execute.mock.calls[0];expect(sql).toContain('WHERE c.agency_id=? AND (');expect(sql).toContain('LIMIT 25');expect(sql).toContain('ac.agency_id=c.agency_id');expect(args[0]).toBe(6);expect(args).toContain('+13035550101');
 expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(res.json).toHaveBeenCalledWith({candidates:[expect.objectContaining({id:1,kind:'possible_duplicate',canMerge:true}),expect.objectContaining({id:2,kind:'shared_household',canMerge:false})]});expect(JSON.stringify(m.audit.mock.calls[0][1])).not.toContain('parent@example.test');
});
it('does not query clients for an unauthorized agency or clinical-only actor',async()=>{
 m.membership.mockRejectedValueOnce(Object.assign(Error('Forbidden'),{status:403}));const next=vi.fn();await getClientImportCandidates(request(),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.execute).not.toHaveBeenCalled();
 await getClientImportCandidates({...request(),user:{id:7,role:'provider'}},response(),next);expect(m.execute).not.toHaveBeenCalled();
});
it('returns no suggestions for empty identifiers and rejects a missing agency',async()=>{
 const req=request(),res=response(),next=vi.fn();req.body={};await getClientImportCandidates(req,res,next);expect(res.json).toHaveBeenCalledWith({candidates:[]});expect(m.execute).not.toHaveBeenCalled();await getClientImportCandidates({...req,get:()=>''},response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));
});

function proposedMerge(overrides={}) {
 const req=request();
 req.params={id:1};
 req.body={...req.body,confirmed:true,expectedName:'Example Child',expectedDateOfBirth:'2015-01-01',...overrides};
 return req;
}
function mockChart(overrides={}) {
 const row={id:1,agency_id:6,full_name:'Example Child',date_of_birth:'2015-01-01',status:'ACTIVE',organization_id:42,client_type:'school',...overrides};
 const db={execute:vi.fn().mockResolvedValueOnce([[row]]).mockResolvedValue([{affectedRows:1}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
 m.connection.mockResolvedValue(db);
 return db;
}
it('begins import on the existing chart and keeps its school affiliation',async()=>{
 const db=mockChart();m.school.mockResolvedValue({id:42});
 const res=response(),next=vi.fn();
 await mergeClientRecordsImport(proposedMerge(),res,next);
 expect(next).not.toHaveBeenCalled();
 expect(db.execute.mock.calls[0][0]).toContain('WHERE c.id=? AND c.agency_id=?');
 expect(m.begin).toHaveBeenCalledWith({clientId:1,agencyId:6},[],7,{db});
 expect(res.json).toHaveBeenCalledWith({id:1,agency_id:6,organization_id:42,client_type:'school'});
 expect(db.commit).toHaveBeenCalledOnce();
});
it.each([
 [{records_import_status:'complete'},{}], [{is_archived:1},{}],
 [{},{expectedName:'Wrong chart'}], [{},{dateOfBirth:'2015-01-02'}],
 [{},{fullName:'Sibling Example',dateOfBirth:'2013-01-01'}]
])('rejects a completed, archived, stale, or different chart',async (stored,incoming)=>{
 const db=mockChart(stored),next=vi.fn();
 await mergeClientRecordsImport(proposedMerge(incoming),response(),next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
 expect(db.rollback).toHaveBeenCalledOnce();
 expect(db.commit).not.toHaveBeenCalled();
 expect(m.begin).not.toHaveBeenCalled();
});
