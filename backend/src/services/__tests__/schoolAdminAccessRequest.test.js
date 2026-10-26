import {it,expect,vi,beforeEach} from 'vitest';
const h=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:h.execute,getConnection:vi.fn(async()=>h)}}));
import {schoolAdminRequestStatus,requestSchoolAdminAccess,reviewSchoolAdminAccess} from '../schoolAdminAccessRequest.service.js';
let role,memberships,admin,request,eligible;
beforeEach(()=>{
 vi.clearAllMocks();role='school_staff';memberships=[{agency_id:357}];admin=false;request=null;eligible=true;
 h.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('FROM agencies'))return [[{id:357,name:'Montbello'}]];
  if(sql.includes('FROM users')&&!sql.includes('JOIN'))return [[{id:8,role,email:'staff@example.test'}]];
  if(sql.includes('FROM user_agencies'))return [memberships];
  if(sql.includes('FROM organization_affiliations'))return [[{agency_id:2}]];
  if(sql.includes('SELECT sc.id'))return [admin?[{id:1}]:[]];
  if(sql.includes('FROM users u JOIN'))return [eligible?[{id:8,email:'staff@example.test',first_name:'Test',last_name:'Staff'}]:[]];
  if(sql.includes('SELECT')&&sql.includes('school_admin_access_requests'))return [request?[request]:[]];
  return [{insertId:12,affectedRows:1}];
 });
});
const scope={schoolId:357,actorUserId:8};
it('allows an active school member to request, audits it, and never self-promotes',async()=>{
 expect(await schoolAdminRequestStatus(scope)).toMatchObject({canRequest:true,canReview:false});
 expect(await requestSchoolAdminAccess(scope)).toMatchObject({id:12,status:'pending'});
 expect(h.execute.mock.calls.some(([s])=>s.includes('INSERT INTO school_contacts'))).toBe(false);
 expect(h.execute.mock.calls.some(([s,a])=>s.includes('user_activity_log')&&a[0]==='school_admin_access_requested')).toBe(true);
 expect(h.commit).toHaveBeenCalled();
});
it('rejects another school member and requests when an active admin already exists',async()=>{
 memberships=[{agency_id:99}];await expect(requestSchoolAdminAccess(scope)).rejects.toMatchObject({status:403});
 memberships=[{agency_id:357}];admin=true;await expect(requestSchoolAdminAccess(scope)).rejects.toMatchObject({status:409});
 expect(h.commit).not.toHaveBeenCalled();expect(h.rollback).toHaveBeenCalledTimes(2);
});
it('returns an existing pending request on repeat clicks',async()=>{
 request={id:10,status:'pending'};expect(await requestSchoolAdminAccess(scope)).toMatchObject({id:10,alreadyRequested:true});
 expect(h.execute.mock.calls.some(([s])=>s.startsWith('INSERT INTO school_admin_access_requests'))).toBe(false);
});
it.each(['admin','support','super_admin'])('allows %s to approve within their agency',async reviewer=>{
 role=reviewer;memberships=[{agency_id:2}];request={id:10,requester_user_id:8,status:'pending'};
 expect(await reviewSchoolAdminAccess({...scope,requestId:10,decision:'approve'})).toMatchObject({status:'approved',userId:8});
 expect(h.execute.mock.calls.some(([s])=>s.includes('INSERT INTO school_contacts'))).toBe(true);
 expect(h.execute.mock.calls.some(([s])=>s.includes("status='superseded'"))).toBe(true);
});
it('rejects self-approval, cross-agency reviewers, inactive requesters, and stale approvals',async()=>{
 request={id:10,requester_user_id:8,status:'pending'};
 const input={...scope,requestId:10,decision:'approve'};
 await expect(reviewSchoolAdminAccess(input)).rejects.toMatchObject({status:403});
 role='support';memberships=[{agency_id:99}];await expect(reviewSchoolAdminAccess(input)).rejects.toMatchObject({status:403});
 memberships=[{agency_id:2}];eligible=false;await expect(reviewSchoolAdminAccess(input)).rejects.toMatchObject({status:409});
 eligible=true;admin=true;await expect(reviewSchoolAdminAccess(input)).rejects.toMatchObject({status:409});
 admin=false;request.status='approved';await expect(reviewSchoolAdminAccess(input)).rejects.toMatchObject({status:409});
 expect(h.commit).not.toHaveBeenCalled();
});
it('records denial without granting access and filters ordinary staff to their own requests',async()=>{
 await schoolAdminRequestStatus(scope);
 const [sql,args]=h.execute.mock.calls.find(([s])=>s.includes('SELECT r.id'));
 expect(sql).toContain('r.requester_user_id=?');expect(args).toEqual([357,8]);
 role='admin';memberships=[{agency_id:2}];request={id:10,requester_user_id:8,status:'pending'};
 await reviewSchoolAdminAccess({...scope,requestId:10,decision:'deny',note:'Please contact the office.'});
 expect(h.execute.mock.calls.some(([s])=>s.includes('INSERT INTO school_contacts'))).toBe(false);
 expect(h.execute.mock.calls.some(([s,a])=>s.includes('SET status=?')&&a[0]==='denied'&&a[2]==='Please contact the office.')).toBe(true);
});
