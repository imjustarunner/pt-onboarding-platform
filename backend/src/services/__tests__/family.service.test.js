import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),requireHousehold:vi.fn(),db:{execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:async()=>mocks.db}}));
vi.mock('../../models/User.model.js',()=>({default:{_resolveUserStatus:async()=> 'PENDING'}}));
vi.mock('../familyAuth.service.js',()=>({requireHousehold:mocks.requireHousehold,familyHash:vi.fn()}));
import { actOnEntry, saveFamilyEntry, addChild } from '../family.service.js';
const session={userId:1,agencyId:4};
beforeEach(()=>{vi.clearAllMocks();mocks.requireHousehold.mockResolvedValue({id:7,role:'parent',timezone:'America/Denver'});});
describe('household writes and points',()=>{
  it.each(['member','pet'])('adds a %s profile without creating credentials or workplace membership',async role=>{
    mocks.db.execute.mockResolvedValue([{insertId:42}]);
    await expect(addChild(session,7,{name:role==='pet'?'Rover':'Child',role,color:'#aabbcc'})).resolves.toEqual({id:42});
    const writes=mocks.db.execute.mock.calls.filter(([sql])=>sql.includes('INSERT'));
    expect(writes).toHaveLength(2);
    expect(writes[0][0]).toContain('NULL');
    expect(writes[1][1][2]).toBe(role);
    expect(mocks.db.commit).toHaveBeenCalled();
  });
  it('rejects foreign assignees before creating events or tasks',async()=>{
    mocks.db.execute.mockImplementation(async sql=>sql.includes('SELECT user_id')?[[{user_id:1}]]:[[]]);
    await expect(saveFamilyEntry(session,7,{kind:'chore',title:'Dishes',memberUserId:999})).rejects.toThrow('household');
    expect(mocks.db.rollback).toHaveBeenCalled();expect(mocks.db.execute.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);
  });
  it('locks the household and rolls back duplicate completions without another point award',async()=>{
    mocks.db.execute.mockImplementation(async sql=>{
      if(sql.includes('SELECT * FROM family_entries'))return [[{id:5,kind:'chore',member_user_id:1,metadata:{points:10,recurrence:'none'}}]];
      if(sql.includes('SELECT user_id'))return [[{user_id:1}]];
      if(sql.includes('INSERT INTO family_activity'))throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
      return [[]];
    });
    await expect(actOnEntry(session,7,5,{action:'complete'})).rejects.toMatchObject({status:409});
    expect(mocks.db.execute.mock.calls[0][0]).toContain('FOR UPDATE');expect(mocks.db.rollback).toHaveBeenCalled();expect(mocks.db.commit).not.toHaveBeenCalled();
  });
  it('reserves pending redemptions before spending more points',async()=>{
    mocks.db.execute.mockImplementation(async sql=>{
      if(sql.includes('SELECT * FROM family_entries'))return [[{id:5,kind:'reward',metadata:{points:50}}]];
      if(sql.includes('SELECT user_id'))return [[{user_id:1}]];
      if(sql.includes('AS total'))return [[{total:20}]];
      return [[]];
    });
    await expect(actOnEntry(session,7,5,{action:'redeem',requestId:'abc'})).rejects.toThrow('Not enough');
    const sql=mocks.db.execute.mock.calls.find(([s])=>s.includes('AS total'))[0];expect(sql).toContain("state='pending' AND points<0");expect(mocks.db.commit).not.toHaveBeenCalled();
  });
  it('requires a parent to approve and protects point configuration',async()=>{
    mocks.requireHousehold.mockResolvedValue({id:7,role:'member',timezone:'America/Denver'});
    mocks.db.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM family_entries')?[[{id:5,kind:'chore',member_user_id:1,metadata:{points:10}}]]:sql.includes('SELECT user_id')?[[{user_id:1}]]:[[]]);
    await expect(actOnEntry(session,7,5,{action:'approve',activityId:2})).rejects.toMatchObject({status:403});
    await expect(saveFamilyEntry(session,7,{kind:'reward',title:'Free stuff',metadata:{points:1}})).rejects.toMatchObject({status:403});
  });
  it('creates generic private schedule rows atomically for each household member',async()=>{
    let id=40;
    mocks.db.execute.mockImplementation(async sql=>sql.includes('SELECT user_id')?[[{user_id:1},{user_id:2}]]:[{insertId:++id}]);
    await saveFamilyEntry(session,7,{kind:'event',title:'Private appointment',startAt:'2026-09-15T20:00:00Z',endAt:'2026-09-15T21:00:00Z'});
    const calls=mocks.db.execute.mock.calls.filter(([s])=>s.includes('INSERT INTO provider_schedule_events'));
    expect(calls).toHaveLength(2);for(const[sql,values]of calls){expect(sql).toContain("'Personal event'");expect(values).not.toContain('Private appointment');}expect(mocks.db.commit).toHaveBeenCalled();
  });
});
