import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:m}));
vi.mock('../clientSessionBookingRollout.service.js',()=>({sessionBookingProviders:async()=>[{id:1,name:'Example'}]}));
import {transitionPractices,transitionWorkspaceRoster,transitionClients,assertTransitionClient,transitionMeetings,assertTransitionMeeting} from '../transitionWorkspace.service.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[]]);});
it('only offers three practices with current membership and puts ITSCO first',async()=>{
 m.execute.mockResolvedValue([[{agency_id:6},{agency_id:2},{agency_id:377},{agency_id:999}]]);
 expect((await transitionPractices({id:9,role:'admin'})).map(p=>p.id)).toEqual([2,6,377]);
 expect(m.execute.mock.calls[0][1]).toEqual([9]);expect(m.execute.mock.calls[0][0]).toContain('ua.is_active=1');
 await expect(transitionPractices({id:9,role:'provider'})).rejects.toMatchObject({status:403});
});
it('loads real names and canonical app counts without presenting them as verified source totals',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('FROM appointments WHERE')?[[{provider_user_id:1,completed:8,upcoming:3}]]:[[{id:1,name:'Example',role:'provider'},{id:2,name:'Example staff',role:'staff'}]]);
 const rows=await transitionWorkspaceRoster(2);expect(rows[0]).toMatchObject({id:1,clientFacing:true,appCompleted:8,appUpcoming:3});expect(rows[1].appCompleted).toBe(0);expect(rows[1]).not.toHaveProperty('verified');
 expect(m.execute.mock.calls.find(([sql])=>sql.includes('FROM appointments'))[1]).toEqual([2]);
});
it('loads existing clients only for the chosen practice and active employee, including past charts',async()=>{
 m.execute.mockResolvedValueOnce([[{id:1,name:'Example'}]]).mockResolvedValueOnce([[{id:8,name:'Fictional client',status:'DISCHARGED'}]]);
 expect((await transitionClients(377,1))[0].status).toBe('DISCHARGED');
 const [sql,params]=m.execute.mock.calls[1];expect(sql).toContain('c.agency_id=?');expect(sql).toContain('ca.is_active=1');expect(params).toEqual([1,377,1,1]);
 m.execute.mockResolvedValue([[]]);await expect(transitionClients(2,99)).rejects.toMatchObject({status:404});
});
it('rejects unrelated or foreign charts before checklist mutations commit',async()=>{
 await expect(assertTransitionClient(2,1,8)).rejects.toMatchObject({status:404});
 expect(m.execute.mock.calls[0][1]).toEqual([8,2,1,1]);
});
it('does not expose private meetings or link meetings from another practice',async()=>{
 await transitionMeetings(6,9);const [sql,params]=m.execute.mock.calls[0];expect(params).toEqual([6,9,9]);expect(sql).toContain("<> 'interview'");expect(sql).toContain('e.provider_id=? OR EXISTS');
 await expect(assertTransitionMeeting(6,9,123)).rejects.toMatchObject({status:403});
});
