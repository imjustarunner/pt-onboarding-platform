import { beforeEach, describe, expect, it, vi } from 'vitest';
const { pool, db } = vi.hoisted(() => {
  const db={execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
  return {db,pool:{execute:vi.fn(),getConnection:vi.fn()}};
});
vi.mock('../../config/database.js',()=>({default:pool}));
import Awards from '../EmployeeServiceMilestone.model.js';
import { notifyEligibleAwards } from '../../services/employeeAwardNotifications.service.js';
beforeEach(()=>{vi.resetAllMocks();pool.getConnection.mockResolvedValue(db);db.execute.mockResolvedValue([{affectedRows:1,insertId:10}]);});
const dinner={milestoneIds:[10,11],scheduledOn:'2026-10-29',title:'October dinner'};
const candidates=[{id:10,user_id:5,milestone_years:2,status:'owed',milestone_date:'2026-01-01'},{id:11,user_id:6,milestone_years:2,status:'owed',milestone_date:'2026-02-01'}];
describe('year award persistence',()=>{
  it('syncs in a batch using the earlier date while preserving completed gifts and flagging missing dates', async () => {
    pool.execute.mockResolvedValueOnce([[
      {id:5,provider_start_date:'2024-01-01',first_client_date:'2023-10-01'},
      {id:6,hired_at:'2020-01-01'}
    ]]).mockResolvedValueOnce([[{timezone:'America/Denver'}]])
      .mockResolvedValueOnce([[{user_id:5,milestone_years:1,milestone_date:'2024-10-01',status:'gift_sent'}]])
      .mockResolvedValue([{affectedRows:1}]);
    const result=await Awards.syncFromStartDates(2);
    expect(result).toMatchObject({created:5,updated:0,missingDates:1});
    const inserts=pool.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO employee_service_milestones'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1].slice(0,5)).toEqual([2,5,2,'2025-10-01','owed']);
    expect(pool.execute.mock.calls.find(([sql])=>sql.includes('SET milestone_date=NULL'))[1]).toEqual([2,6]);
  });
  it('rejects a batch containing an award outside the selected agency atomically',async()=>{
    db.execute.mockResolvedValueOnce([[candidates[0]]]);
    await expect(Awards.createDinner(2,dinner,507)).rejects.toThrow('this agency');
    expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();
  });
  it('records all invitees without completing their awards',async()=>{
    db.execute.mockResolvedValueOnce([candidates]).mockResolvedValueOnce([[{id:5},{id:6}]]).mockResolvedValueOnce([[{timezone:'America/Denver'}]]).mockResolvedValueOnce([[{n:0}]]);
    await Awards.createDinner(2,dinner,507);
    expect(db.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO employee_award_dinner_attendees'))).toHaveLength(2);
    expect(db.execute.mock.calls.some(([sql])=>sql.includes('UPDATE employee_service_milestones'))).toBe(false);
    expect(db.commit).toHaveBeenCalled();
  });
  it('does not invite a person before their anniversary or after fulfillment',async()=>{
    db.execute.mockResolvedValueOnce([[{...candidates[0],milestone_date:'2027-01-01'}]]).mockResolvedValueOnce([[{id:5}]]);
    await expect(Awards.createDinner(2,{...dinner,milestoneIds:[10]},507)).rejects.toThrow('on or after');
    db.execute.mockResolvedValueOnce([[{...candidates[0],status:'gift_sent'}]]);
    await expect(Awards.createDinner(2,{...dinner,milestoneIds:[10]},507)).rejects.toThrow('unfinished');
  });
  it('marks only the selected attendee fulfilled on the dinner date',async()=>{
    db.execute.mockResolvedValueOnce([[{attendance:'invited',scheduled_on:'2020-10-29',title:'Dinner'}]]).mockResolvedValueOnce([[{timezone:'America/Denver'}]]);
    await Awards.attendance(2,8,10,'attended',507);
    const update=db.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE employee_service_milestones'));
    expect(update[1]).toEqual(['2020-10-29',10]);
    expect(db.commit).toHaveBeenCalled();
  });
  it('never records future dinner attendance',async()=>{
    db.execute.mockResolvedValueOnce([[{attendance:'invited',scheduled_on:'2099-10-29',title:'Dinner'}]]).mockResolvedValueOnce([[{timezone:'America/Denver'}]]);
    await expect(Awards.attendance(2,8,10,'attended',507)).rejects.toThrow('on or after');
    expect(db.rollback).toHaveBeenCalled();
  });
  it('records admin notifications and deduplication markers in the same transaction',async()=>{
    db.execute.mockResolvedValueOnce([[{timezone:'America/Denver'}]])
      .mockResolvedValueOnce([[{id:10,first_name:'Alex',last_name:'One',milestone_years:2}]])
      .mockResolvedValueOnce([[{id:507},{id:501}]]);
    expect(await notifyEligibleAwards(2)).toBe(1);
    expect(db.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO notifications'))).toHaveLength(2);
    expect(db.execute.mock.calls.find(([sql])=>sql.includes('SET eligibility_notified_at'))[1]).toEqual([2,10]);
    expect(db.commit).toHaveBeenCalled();
  });
  it('does not repeat notices or mark delivery when nobody can receive them',async()=>{
    db.execute.mockResolvedValueOnce([[{timezone:'America/Denver'}]]).mockResolvedValueOnce([[]]);
    expect(await notifyEligibleAwards(2)).toBe(0);
    db.execute.mockResolvedValueOnce([[{timezone:'America/Denver'}]]).mockResolvedValueOnce([[{id:10}]]).mockResolvedValueOnce([[]]);
    expect(await notifyEligibleAwards(2)).toBe(0);
    expect(db.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO notifications')||sql.includes('SET eligibility_notified_at'))).toBe(false);
  });
  it('rolls back the delivery marker if notification insertion fails',async()=>{
    db.execute.mockResolvedValueOnce([[{timezone:'America/Denver'}]]).mockResolvedValueOnce([[{id:10}]]).mockResolvedValueOnce([[{id:507}]]).mockRejectedValueOnce(new Error('write failed'));
    await expect(notifyEligibleAwards(2)).rejects.toThrow('write failed');
    expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();
  });
});
