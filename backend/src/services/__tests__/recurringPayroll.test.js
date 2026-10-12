import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:m}));
import {occurrenceDates,normalizeRecurring,materializeRecurring} from '../recurringPayroll.service.js';
it('anchors recurrence without changing old payroll',()=>{
 const s={starts_on:'2026-10-10',cadence:'weekly'};
 expect(occurrenceDates(s,'2026-09-26','2026-10-09')).toEqual([]);
 expect(occurrenceDates(s,'2026-10-10','2026-10-23')).toEqual(['2026-10-10','2026-10-17']);
 expect(occurrenceDates({...s,cadence:'biweekly'},'2026-10-10','2026-10-23')).toEqual(['2026-10-10']);
 expect(occurrenceDates({...s,cadence:'once'},'2026-10-24','2026-11-06')).toEqual([]);
});
it('preserves month-end dates and leap years',()=>{expect(occurrenceDates({starts_on:'2028-01-31',cadence:'monthly',ends_on:'2028-03-31'},'2028-01-01','2028-04-30')).toEqual(['2028-01-31','2028-02-29','2028-03-31']);});
it('prices minutes at the agreed rate and rejects invalid entries',()=>{
 expect(normalizeRecurring({label:'Office',cadence:'weekly',startsOn:'2026-10-10',minutes:15,hourlyRate:23})).toMatchObject({amount:5.75});
 for(const override of [{amount:-1},{startsOn:'2026-02-31'},{cadence:'daily'},{endsOn:'2026-01-01'}])expect(()=>normalizeRecurring({label:'Stipend',cadence:'monthly',startsOn:'2026-10-10',amount:10,...override})).toThrow();
});
beforeEach(()=>{vi.clearAllMocks();m.getConnection.mockResolvedValue(m);});
it('never duplicates an occurrence on rerun',async()=>{m.execute.mockImplementation(async sql=>{
 if(sql.startsWith('SELECT * FROM payroll_periods'))return [[{status:'ran',period_start:'2026-10-10',period_end:'2026-10-23'}]];
 if(sql.includes('SELECT r.*'))return [[{id:1,user_id:5,starts_on:'2026-10-10',cadence:'biweekly',minutes:15,amount:5.75,hourly_rate:23,created_by_user_id:9}]];
 if(sql.includes('SELECT id FROM payroll_recurring_occurrences'))return [[{id:2}]];throw Error(sql);
 });await materializeRecurring({agencyId:2,payrollPeriodId:147});expect(m.execute.mock.calls.some(([s])=>s.startsWith('INSERT'))).toBe(false);expect(m.commit).toHaveBeenCalledOnce();});
it('never mutates posted payroll',async()=>{m.execute.mockResolvedValue([[{status:'posted'}]]);await materializeRecurring({agencyId:2,payrollPeriodId:146});expect(m.execute).toHaveBeenCalledTimes(1);expect(m.rollback).toHaveBeenCalledOnce();});
it('rolls back if recording the occurrence fails',async()=>{m.execute.mockImplementation(async sql=>{
 if(sql.startsWith('SELECT * FROM payroll_periods'))return [[{status:'draft',period_start:'2026-10-10',period_end:'2026-10-23'}]];
 if(sql.includes('SELECT r.*'))return [[{id:1,user_id:5,starts_on:'2026-10-10',cadence:'once',minutes:0,amount:100,created_by_user_id:9}]];
 if(sql.startsWith('SELECT id'))return [[]];if(sql.includes('INSERT INTO payroll_manual'))return [{insertId:4}];throw Error('write failed');});await expect(materializeRecurring({agencyId:2,payrollPeriodId:147})).rejects.toThrow('write failed');expect(m.rollback).toHaveBeenCalledOnce();expect(m.commit).not.toHaveBeenCalled();});
