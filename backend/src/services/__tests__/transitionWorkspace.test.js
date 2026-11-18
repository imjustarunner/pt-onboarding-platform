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
it('ranks provider payroll and never reads app appointments or includes general staff',async()=>{
 m.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM users'))return [[{id:1,name:'Example',role:'provider'},{id:2,name:'Coordinator',role:'staff'}]];
  if(sql.includes('FROM payroll_periods pp'))return [[{id:8,periodStart:'2026-10-24',periodEnd:'2026-11-06',status:'posted'}]];
  if(sql.includes('FROM payroll_summaries WHERE'))return [[{user_id:1,direct_hours:'3.25',total_hours:4,tier_credits_current:3.25,total_units:9},{user_id:2,direct_hours:1,total_hours:1}]];
  if(sql.includes('FROM payroll_import_rows'))return [[{user_id:1,service_entries:2}]];
  return [[]];
 });
 const rows=await transitionWorkspaceRoster(2);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id:1,directCreditHours:3.25,totalCreditHours:4,serviceEntries:2,rank:1,cohort:1});
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('FROM appointments'))).toBe(false);
 const [periodSql,params]=m.execute.mock.calls.find(([sql])=>sql.includes('FROM payroll_periods pp'));
 expect(periodSql).toContain('LIMIT 3');expect(periodSql).toContain('pp.period_end<?');expect(params[0]).toBe(2);
 expect(m.execute.mock.calls.find(([sql])=>sql.includes('FROM payroll_summaries WHERE'))[1]).toEqual([2,8]);
});
it('leaves the provider list empty when there are no completed payroll periods',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('FROM users')?[[{id:1,name:'Example'}]]:[[]]);
 expect(await transitionWorkspaceRoster(2)).toEqual([]);expect(m.execute.mock.calls.some(([sql])=>sql.includes('FROM payroll_import_rows'))).toBe(false);
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
