import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import { loadMileageBenefitTiers, resolveMileageBenefitTier } from '../mileageBenefitTier.service.js';
it('uses each employee’s latest posted agency benefit, including grace, with an optional target-period cutoff',async()=>{
 const db=new DatabaseSync(':memory:');
 try {
 db.exec(`CREATE TABLE payroll_periods(id INTEGER,agency_id INTEGER,period_end TEXT,status TEXT);
 CREATE TABLE payroll_summaries(payroll_period_id INTEGER,agency_id INTEGER,user_id INTEGER,breakdown TEXT);
 INSERT INTO payroll_periods VALUES(1,2,'2026-10-09','posted'),(2,2,'2026-10-23','posted'),(3,2,'2026-11-06','ran'),(4,6,'2026-10-23','posted');
 INSERT INTO payroll_summaries VALUES(1,2,7,'{"__tier":{"tierLevel":1}}'),(2,2,7,'{"__tier":{"tierLevel":2}}'),(3,2,7,'{"__tier":{"tierLevel":3}}'),(4,6,7,'{"__tier":{"tierLevel":3}}'),(2,2,8,'{"__tier":{"tierLevel":3,"status":"Grace"}}');`);
 const execute=async(sql,params)=>[db.prepare(sql).all(...params)];
 const tiers=await loadMileageBenefitTiers({agencyId:2,userIds:[7,8,7],db:{execute}});
 expect(tiers.get(7)).toEqual({tierLevel:2,periodEnd:'2026-10-23'});
 expect(tiers.get(8).tierLevel).toBe(3);
 expect((await loadMileageBenefitTiers({agencyId:2,userIds:[7],periodEnd:'2026-10-10',db:{execute}})).get(7).tierLevel).toBe(1);
 }finally{db.close();}
});
it('defaults to the recorded entitlement and rejects stale Tier 1 rather than underpaying a Tier 2 employee',()=>{
 expect(resolveMileageBenefitTier({tierLevel:2},null)).toBe(2);
 expect(()=>resolveMileageBenefitTier({tierLevel:2},1)).toThrow('current mileage benefit is Tier 2');
 expect(()=>resolveMileageBenefitTier({tierLevel:0},1)).toThrow('eligible mileage benefit');
 expect(()=>resolveMileageBenefitTier(null,null)).toThrow('No posted benefit tier');
 expect(resolveMileageBenefitTier(null,3)).toBe(3);
});
