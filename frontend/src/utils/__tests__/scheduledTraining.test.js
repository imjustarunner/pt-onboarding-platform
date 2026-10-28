import {it,expect} from 'vitest';
import {trainingWallInstant,canScheduleTraining,trainingLogCredit} from '../scheduledTraining';
it('uses Mountain time on both sides of daylight saving time for multi-day training',()=>{expect(trainingWallInstant('2026-10-27','17:00','America/Denver')).toBe('2026-10-27T23:00:00.000Z');expect(trainingWallInstant('2026-11-03','17:00','America/Denver')).toBe('2026-11-04T00:00:00.000Z');expect(()=>trainingWallInstant('2026-03-08','02:30','America/Denver')).toThrow(/does not exist/);});
it('limits the schedule training option to requested roles',()=>{for(const role of ['admin','super_admin','provider_plus','clinical_practice_assistant'])expect(canScheduleTraining({role})).toBe(true);for(const role of ['provider','intern','support','staff','supervisor'])expect(canScheduleTraining({role})).toBe(false);});
it('shows approved hours without treating an intern credit as pay',()=>{
 const log={attendance_seconds:600,credit_type:'indirect',credited_seconds:7200,credited_type:'indirect',credit_approved_by_user_id:1,credit_approved_at:'2026-10-28 01:00:00'};
 expect(trainingLogCredit(log)).toEqual({hours:2,label:'Indirect · unpaid',approved:true});
 expect(trainingLogCredit({...log,credit_approved_at:null})).toEqual({hours:1/6,label:'Indirect · unpaid',approved:false});
 expect(trainingLogCredit({...log,credited_seconds:null}).approved).toBe(false);
 expect(trainingLogCredit({...log,credited_type:'group_supervision'}).label).toBe('Eligible group supervision · unpaid');
});
