import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute:vi.fn(), beginTransaction:vi.fn(), commit:vi.fn(), rollback:vi.fn(), release:vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { getConnection:async()=>m } }));
import Claim from '../../models/clinical/ClinicalClaim.model.js';
const input = {clinicalSessionId:7,agencyId:2,clientId:8,createdByUserId:9};
beforeEach(() => { vi.resetAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-08T12:00:00Z')); });
afterEach(() => vi.useRealTimers());

it.each(['2026-12-03 17:00:00',new Date('2026-12-03T17:00:00Z')])('refuses to draft a claim for a future reserved session (%s)',async start=>{
  m.execute.mockResolvedValue([[{id:7,scheduled_start_at:start}]]);
  await expect(Claim.create(input)).rejects.toMatchObject({status:409,code:'FUTURE_SESSION_RESERVED'});
  expect(m.execute).toHaveBeenCalledTimes(1);
  expect(m.rollback).toHaveBeenCalledOnce();expect(m.release).toHaveBeenCalledOnce();expect(m.commit).not.toHaveBeenCalled();
});

it('keeps the past-session claim workflow and checks the date again in the insert',async()=>{
  m.execute.mockImplementation(async sql=>{
    if(sql.includes('FOR UPDATE'))return [[{id:7,scheduled_start_at:'2026-10-01 17:00:00'}]];
    if(sql.includes('INSERT INTO'))return [{affectedRows:1,insertId:42}];
    if(sql.includes('SELECT *'))return [[{id:42}]];
    return [[]];
  });
  expect(await Claim.create(input)).toEqual({id:42});
  expect(m.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO'))[0]).toContain('s.scheduled_start_at <= UTC_TIMESTAMP()');
  expect(m.commit).toHaveBeenCalledOnce();
});
