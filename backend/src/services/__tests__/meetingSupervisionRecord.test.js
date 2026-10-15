import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({execute:vi.fn(),find:vi.fn(),membership:vi.fn(),join:vi.fn(),hours:vi.fn(),claim:vi.fn(),rollups:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn()}));
vi.mock('../../config/database.js',() => ({default:{execute:m.execute}}));
vi.mock('../../models/SupervisionSession.model.js',() => ({default:{findById:m.find,listAttendanceRollupsForSession:m.rollups}}));
vi.mock('../meetingJoinPolicy.service.js',() => ({hasActiveMeetingMembership:m.membership,canJoinSupervision:m.join}));
vi.mock('../supervisionReviewTime.service.js',() => ({withSupervisorTimeLock:async(_ids,work) => work(m),assertNoReviewTimeOverlap:async() => {}}));
vi.mock('../supervisionFinalizePipeline.service.js',() => ({creditSuperviseeHoursFromFinalizedSession:m.hours,createSupervisorSupervisionTimeClaim:m.claim}));
import { getSupervisionRecord, submitSupervisionTimeCorrection, validateSupervisionTimeCorrection, reviewSupervisionTimeCorrection } from '../supervisionTimeCorrection.service.js';
const host = {id:10,role:'provider'}, student = {id:20,role:'provider'};
const session = {id:1,agency_id:2,supervisor_user_id:10,supervisee_user_id:20,co_facilitator_user_id:null,start_at:'2026-01-01 16:00:00',end_at:'2026-01-01 17:00:00',status:'FINALIZED'};
const input = () => ({userIds:[10,20],startAt:'2026-01-01T10:00:00-06:00',endAt:'2026-01-01T11:00:00-06:00',minutes:55,reason:'Continued by phone after the video dropped.',modality:'MIXED',attested:true,requestKey:'test-key-123'});
let pending, duplicate, active, overlap;
beforeEach(() => {
  vi.resetAllMocks(); pending=[];duplicate=false;active=false;overlap=false;
  m.find.mockResolvedValue({...session});m.membership.mockResolvedValue(true);m.join.mockResolvedValue(true);m.claim.mockResolvedValue({ok:true});m.rollups.mockResolvedValue([]);
  m.execute.mockImplementation(async(sql,args) => {
    if(sql.startsWith('SELECT * FROM supervision_sessions'))return [[session]];
    if(sql.includes('FROM users u LEFT JOIN'))return [[{userId:10,name:'Host',role:'Supervisor'},{userId:20,name:'Student',role:'Supervisee'}]];
    if(sql.includes('SELECT name FROM agencies'))return [[{name:'ITSCO'}]];
    if(sql.includes('FROM supervision_session_join_presence'))return [active?[{active:1}]:[]];
    if(sql.includes('SELECT r.session_id'))return [overlap?[{session_id:3}]:[]];
    if(sql.startsWith('SELECT id FROM supervision_time_corrections'))return [duplicate?[{id:3}]:[]];
    if(sql.startsWith('SELECT id,start_at,end_at,total_seconds,reason,modality'))return [duplicate?[{id:3,start_at:'2026-01-01 16:00:00',end_at:'2026-01-01 17:00:00',total_seconds:3300,reason:input().reason,modality:'MIXED'}]:[]];
    if(sql.startsWith('INSERT INTO supervision_time_corrections')) {pending.push({id:pending.length+1,user_id:args[1]});return [{insertId:pending.length}];}
    if(sql.startsWith('SELECT * FROM supervision_session_attendance_rollups'))return [[{total_seconds:600}]];
    if(sql.startsWith('SELECT id,user_id FROM supervision_time_corrections'))return [pending];
    if(sql.includes('SELECT * FROM supervision_time_corrections'))return [[{id:2,session_id:1,user_id:20,status:'pending',start_at:'2026-01-01 16:00:00',end_at:'2026-01-01 17:00:00',total_seconds:3300}]];
    if(sql.startsWith('SELECT'))return [[]];
    return [{affectedRows:1}];
  });
});
const writes = () => m.execute.mock.calls.filter(([sql]) => /^(INSERT|UPDATE|DELETE)/.test(sql));
describe('supervision actual time corrections', () => {
  it('requires a reason, explicit attestation and bounded past time with a timezone',() => {
    expect(validateSupervisionTimeCorrection(input())).toMatchObject({startAt:'2026-01-01 16:00:00',totalSeconds:3300});
    for(const change of [{reason:''},{attested:false},{minutes:61},{minutes:0},{minutes:1.5},{startAt:'2026-01-01T16:00'},{endAt:'2099-01-01T17:00:00Z'},{userIds:[]}])expect(() => validateSupervisionTimeCorrection({...input(),...change})).toThrow();
  });
  it('shows actual saved status and attendance without requiring a video join',async() => {
    const result = await getSupervisionRecord(1,host);
    expect(result.session).toMatchObject({status:'FINALIZED',agencyName:'ITSCO'});expect(result.canManage).toBe(true);
    expect(writes()).toEqual([]);
  });
  it('blocks unrelated users, cross-tenant administrators and access to other participants',async() => {
    m.join.mockResolvedValue(false);m.membership.mockResolvedValue(false);
    await expect(getSupervisionRecord(1,{id:99,role:'admin'})).rejects.toMatchObject({status:403});
    m.join.mockResolvedValue(true);
    await expect(submitSupervisionTimeCorrection(1,student,input())).rejects.toMatchObject({status:403});
    expect(writes()).toEqual([]);
  });
  it('keeps a supervisee submission pending without changing attendance or payroll',async() => {
    expect(await submitSupervisionTimeCorrection(1,student,{...input(),userIds:[20]})).toMatchObject({status:'pending'});
    expect(writes()).toHaveLength(1);expect(m.hours).not.toHaveBeenCalled();expect(m.claim).not.toHaveBeenCalled();
  });
  it('preserves old attendance and applies host corrections to selected people only, then reconciles hours',async() => {
    const result = await submitSupervisionTimeCorrection(1,host,input());
    expect(result).toMatchObject({status:'approved',synced:true});
    const updates = writes().filter(([sql]) => sql.startsWith('INSERT INTO supervision_session_attendance_rollups'));
    expect(updates.map(([,args]) => args[1])).toEqual([10,20]);expect(updates[0][1][4]).toBe(3300);
    expect(writes().find(([sql]) => sql.includes('previous_record_json'))[1][0]).toContain('600');
    expect(writes().some(([sql]) => sql.includes('attendance_events'))).toBe(false);
    expect(m.hours).toHaveBeenCalledOnce();expect(m.claim).toHaveBeenCalledOnce();
    expect(writes().some(([sql]) => /SET start_at|SET end_at/.test(sql))).toBe(false);
  });
  it('does not change supervisor pay when only a supervisee’s time changes',async() => {
    await submitSupervisionTimeCorrection(1,host,{...input(),userIds:[20]});
    expect(m.hours).toHaveBeenCalledOnce();expect(m.claim).not.toHaveBeenCalled();
  });
  it('does not duplicate a retried submission',async() => {
    duplicate=true;await submitSupervisionTimeCorrection(1,host,input());
    expect(writes().some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it.each(['active','overlap','future','cancelled'])('rejects %s sessions before writing',async(kind) => {
    if(kind==='active')active=true;if(kind==='overlap')overlap=true;
    const oldStatus=session.status,oldEnd=session.end_at;
    if(kind==='future')session.end_at='2099-01-01 17:00:00';if(kind==='cancelled')session.status='CANCELLED';
    try {await expect(submitSupervisionTimeCorrection(1,host,input())).rejects.toMatchObject({status:409});expect(writes()).toEqual([]);expect(m.rollback).toHaveBeenCalled();}
    finally{session.status=oldStatus;session.end_at=oldEnd;}
  });
  it('records a visible retry state when payroll reconciliation fails after saving attendance',async() => {
    m.claim.mockRejectedValue(new Error('Unavailable'));
    expect(await submitSupervisionTimeCorrection(1,host,input())).toMatchObject({status:'approved',synced:false});
    expect(writes().some(([sql]) => sql.includes("sync_status='complete'"))).toBe(false);
  });
  it('prevents an older pending request from replacing a newer approved correction',async() => {
    duplicate=true;
    await expect(reviewSupervisionTimeCorrection(1,2,host,'approve')).rejects.toMatchObject({status:409});
    expect(writes()).toEqual([]);
  });
});
