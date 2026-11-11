import { beforeEach,describe,expect,it,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../companyEventAudience.service.js',()=>({listCompanyEventInvitees:vi.fn(),isCompanyEventInvitee:vi.fn(),listEventManagedAgencies:vi.fn()}));
vi.mock('../companyEventOperations.service.js',()=>({isEventCoordinator:vi.fn()}));
import { listCompanyEventInvitees,isCompanyEventInvitee,listEventManagedAgencies } from '../companyEventAudience.service.js';
import { isEventCoordinator } from '../companyEventOperations.service.js';
import { assertCompanyEventConversationMember,syncCompanyEventConversation,pruneUserCompanyEventConversations } from '../companyEventConversation.service.js';
const event={id:7,agency_id:2,title:'Anniversary',is_active:1,created_by_user_id:9};
beforeEach(()=>{vi.resetAllMocks();isCompanyEventInvitee.mockResolvedValue(false);isEventCoordinator.mockResolvedValue(false);listEventManagedAgencies.mockResolvedValue([]);listCompanyEventInvitees.mockResolvedValue([{id:5},{id:6}]);});

describe('event group conversation membership',()=>{
  it('permits current invitees across agencies through the shared audience rule',async()=>{
    isCompanyEventInvitee.mockResolvedValue(true);const db={execute:vi.fn().mockResolvedValue([[event]])};
    expect(await assertCompanyEventConversationMember({threadId:12,userId:5,db})).toBe(true);
    expect(isCompanyEventInvitee).toHaveBeenCalledWith({event,userId:5,db});expect(db.execute).toHaveBeenCalledTimes(1);
  });
  it('blocks a removed invitee even if their old chat participant row exists',async()=>{
    const db={execute:vi.fn().mockResolvedValueOnce([[event]]).mockResolvedValueOnce([[]])};
    await expect(assertCompanyEventConversationMember({threadId:12,userId:5,db})).rejects.toHaveProperty('status',403);
  });
  it('requires present event manager privileges after checking active membership',async()=>{
    const actor={id:5,role:'provider'},db={execute:vi.fn().mockResolvedValueOnce([[event]]).mockResolvedValueOnce([[actor]])};
    await expect(assertCompanyEventConversationMember({threadId:12,userId:5,db})).rejects.toHaveProperty('status',403);
    expect(listEventManagedAgencies).toHaveBeenCalledWith(actor,db);
    expect(isEventCoordinator).toHaveBeenCalledWith({userId:5,agencyId:2,eventId:7});
  });
  it('permits current event coordinators but never inactive events',async()=>{
    const actor={id:5,role:'provider'},db={execute:vi.fn().mockResolvedValueOnce([[event]]).mockResolvedValueOnce([[actor]])};isEventCoordinator.mockResolvedValue(true);
    expect(await assertCompanyEventConversationMember({threadId:12,userId:5,db})).toBe(true);
    const inactive={execute:vi.fn().mockResolvedValue([[{...event,is_active:0}]])};
    await expect(assertCompanyEventConversationMember({threadId:12,userId:5,db:inactive})).rejects.toHaveProperty('status',403);
  });
  it('leaves ordinary group chat authorization to its existing path',async()=>{
    const db={execute:vi.fn().mockResolvedValue([[]])};expect(await assertCompanyEventConversationMember({threadId:12,userId:5,db})).toBe(false);
  });
  it('prunes stale event participants before aggregate views can expose their content',async()=>{
    const db={execute:vi.fn().mockResolvedValueOnce([[{id:12}]]).mockResolvedValueOnce([[event]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{affectedRows:1}])};
    await pruneUserCompanyEventConversations(5,db);
    expect(db.execute.mock.calls.at(-1)).toEqual(['DELETE FROM chat_thread_participants WHERE thread_id=? AND user_id=?',[12,5]]);
  });
});

describe('one durable event conversation',()=>{
  function fixture(thread={id:12}){
    const conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql)=>{
      if(sql.startsWith('SELECT * FROM company_events'))return[[event]];
      if(sql.startsWith('SELECT id FROM chat_threads'))return[[...(thread?[thread]:[])]];
      if(sql.startsWith('SELECT DISTINCT u.id'))return[[{id:9}]];
      return[{insertId:12,affectedRows:1}];
    })};return{conn,db:{getConnection:vi.fn().mockResolvedValue(conn)}};
  }
  it('reuses the event group and synchronizes named membership without sending a message',async()=>{
    const {db,conn}=fixture();const result=await syncCompanyEventConversation({eventId:7,create:true,db});
    expect(result).toMatchObject({threadId:12,name:'Anniversary',participantCount:3});
    expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO chat_threads'))).toBe(false);
    expect(conn.execute.mock.calls.some(([sql])=>sql.includes('chat_messages'))).toBe(false);
    expect(conn.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT IGNORE INTO chat_thread_participants'))[1]).toEqual([12,5,12,6,12,9]);
    expect(conn.commit).toHaveBeenCalledTimes(1);expect(conn.release).toHaveBeenCalledTimes(1);
  });
  it('creates at most one thread inside the event row lock',async()=>{
    const {db,conn}=fixture(null);await syncCompanyEventConversation({eventId:7,create:true,db});
    expect(conn.execute.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(conn.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO chat_threads'))).toHaveLength(1);
  });
  it('does not create a group when merely syncing an event without an existing group',async()=>{
    const {db,conn}=fixture(null);expect(await syncCompanyEventConversation({eventId:7,db})).toBeNull();
    expect(listCompanyEventInvitees).not.toHaveBeenCalled();expect(conn.commit).toHaveBeenCalledTimes(1);
  });
  it('rolls back and releases the connection when no current member is eligible',async()=>{
    const {db,conn}=fixture(null);listCompanyEventInvitees.mockResolvedValue([]);const original=conn.execute.getMockImplementation();
    conn.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT DISTINCT u.id')?[[]]:original(sql,args));
    await expect(syncCompanyEventConversation({eventId:7,create:true,db})).rejects.toHaveProperty('status',400);
    expect(conn.rollback).toHaveBeenCalledTimes(1);expect(conn.release).toHaveBeenCalledTimes(1);
  });
});
