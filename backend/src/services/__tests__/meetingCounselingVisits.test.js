import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),requireMonitoredProvider:vi.fn(),revokeClinicalActor:vi.fn(),clinicalMedia:vi.fn(),retryClinicalDisconnections:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:m}));
vi.mock('../clinicalVideo.service.js',()=>m);
vi.mock('../clinicalSessionAudit.service.js',()=>({clinicalAudit:vi.fn()}));
import {requireCounselingAdmission,admitCounselingVisit,leaveCounselingVisit,joinCounselingVisit} from '../counselingSessionVisit.service.js';
const req={user:{id:null},headers:{},counselingInvitationAccess:{clientId:5},ip:'192.0.2.10'},session={id:7,agency_id:3};let current,affected;
beforeEach(()=>{
 vi.clearAllMocks();current={...session,status:'active',vonage_session_id:'media'};affected=1;
 m.getConnection.mockResolvedValue({execute:m.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()});
 m.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM counseling_sessions'))return [[current]];
  if(sql.startsWith('SELECT'))return [[]];
  return [{affectedRows:affected,insertId:3}];
 });
});
it('denies video to an identified client until admitted',async()=>{await expect(requireCounselingAdmission(req,session)).rejects.toMatchObject({status:403});});
it('does not admit a visit from a different session',async()=>{affected=0;await expect(admitCounselingVisit(session,99)).rejects.toMatchObject({status:409});expect(m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE'))[1]).toEqual([99,7]);});
it('records the server IP and its verification source while keeping new arrivals waiting',async()=>{expect(await joinCounselingVisit(req,session)).toEqual({id:3,status:'waiting'});expect(m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT'))[1]).toEqual([7,'client-5','192.0.2.10','unverified_proxy']);});
it('revokes video credentials when the authenticated client leaves',async()=>{await leaveCounselingVisit(req,session);expect(m.revokeClinicalActor).toHaveBeenCalledWith('media','client-5',expect.anything());expect(m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE'))[1]).toEqual([7,'client-5']);expect(m.retryClinicalDisconnections).toHaveBeenCalled();});
it('does not allow a stale session object to join or admit after provider closure',async()=>{current.status='ended';await expect(joinCounselingVisit(req,session)).rejects.toMatchObject({status:410});await expect(admitCounselingVisit(session,3)).rejects.toMatchObject({status:409});});
