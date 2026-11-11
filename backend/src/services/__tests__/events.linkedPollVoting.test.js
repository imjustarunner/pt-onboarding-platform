import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn()}}));
vi.mock('../companyEventLinkedPolls.service.js',()=>({linkedCompanyEventId:vi.fn(),linkedCompanyEventPollAudience:vi.fn()}));
import {linkedCompanyEventId,linkedCompanyEventPollAudience} from '../companyEventLinkedPolls.service.js';
import {saveStaffPollVote} from '../staffPollLifecycle.service.js';
const row={id:20,agency_id:2,is_active:1,event_type:'team_poll',ends_at:'2099-01-01T00:00:00Z',voting_config_json:{enabled:true,linkedEventId:7}};
const args={eventId:20,agencyId:2,userId:5,response:{key:'1',label:'Friday',raw:'1'},source:'in_app'};
const fixture=()=>{const conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.startsWith('SELECT *')?[[row]]:[{affectedRows:1}])};return{conn,db:{getConnection:vi.fn().mockResolvedValue(conn)}};};
beforeEach(()=>{vi.resetAllMocks();linkedCompanyEventId.mockReturnValue(7);linkedCompanyEventPollAudience.mockResolvedValue({userIds:[5]});});
describe('linked votes recheck parent invitation under the vote lock',()=>{
  it('accepts a cross-agency vote through the same current invitation rule',async()=>{
    const{db,conn}=fixture();await saveStaffPollVote(args,db);expect(linkedCompanyEventPollAudience).toHaveBeenCalledWith({poll:row,db:conn});expect(conn.commit).toHaveBeenCalledTimes(1);
  });
  it('does not write a response if invitation access expired after page load',async()=>{
    linkedCompanyEventPollAudience.mockResolvedValue({userIds:[]});const{db,conn}=fixture();
    await expect(saveStaffPollVote(args,db)).rejects.toHaveProperty('status',403);expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
    expect(conn.rollback).toHaveBeenCalledTimes(1);expect(conn.release).toHaveBeenCalledTimes(1);
  });
});
