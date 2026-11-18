import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),membership:vi.fn(),audit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../services/enrollmentAgencyAccess.service.js',()=>({assertEnrollmentAgencyMembership:m.membership}));
vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:m.audit}));
import {getClientImportCandidates} from '../clientImportCandidates.controller.js';
const request=()=>({user:{id:7,role:'support'},get:()=> '6',body:{fullName:'Example Child',dateOfBirth:'2015-01-01',email:'parent@example.test',phone:'303-555-0101',addressStreet:'1 Test St',addressZip:'80202'}});
function response(){return {set:vi.fn().mockReturnThis(),json:vi.fn()};}
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue([[{id:1,full_name:'Example Child',date_of_birth:'2015-01-01',status:'ACTIVE'},{id:2,full_name:'Sibling Example',date_of_birth:'2013-01-01',status:'ACTIVE'}]]);});
it('limits results to the authorized agency and distinguishes duplicate from household suggestions',async()=>{
 const req=request(),res=response(),next=vi.fn();await getClientImportCandidates(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(m.membership).toHaveBeenCalledWith(req.user,6);
 const [sql,args]=m.execute.mock.calls[0];expect(sql).toContain('WHERE c.agency_id=? AND (');expect(sql).toContain('LIMIT 25');expect(sql).toContain('ac.agency_id=c.agency_id');expect(args[0]).toBe(6);expect(args).toContain('+13035550101');
 expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(res.json).toHaveBeenCalledWith({candidates:[expect.objectContaining({id:1,kind:'possible_duplicate'}),expect.objectContaining({id:2,kind:'shared_household'})]});expect(JSON.stringify(m.audit.mock.calls[0][1])).not.toContain('parent@example.test');
});
it('does not query clients for an unauthorized agency or clinical-only actor',async()=>{
 m.membership.mockRejectedValueOnce(Object.assign(Error('Forbidden'),{status:403}));const next=vi.fn();await getClientImportCandidates(request(),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.execute).not.toHaveBeenCalled();
 await getClientImportCandidates({...request(),user:{id:7,role:'provider'}},response(),next);expect(m.execute).not.toHaveBeenCalled();
});
it('returns no suggestions for empty identifiers and rejects a missing agency',async()=>{
 const req=request(),res=response(),next=vi.fn();req.body={};await getClientImportCandidates(req,res,next);expect(res.json).toHaveBeenCalledWith({candidates:[]});expect(m.execute).not.toHaveBeenCalled();await getClientImportCandidates({...req,get:()=>''},response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));
});
