import { expect, it, vi } from 'vitest';
import { resolveLearningChargeDomain } from '../learningChargeClassification.service.js';
const charge={agency_id:6,client_id:40,learning_class_session_id:90,charge_type:'SESSION_FEE',amount_cents:4500,total_cents:4500,currency:'USD'};
const session={status:'ended',actual_started_at:'2025-01-01 20:00:00',ends_at:'2025-01-01 21:00:00',metadata_json:{learningServiceCode:'TUTORING'},appointment_status:'completed',business_type:'tutoring',appointment_service_code:'TUTORING IN PERSON',payment_policy:'POST_SESSION',session_rate_cents:4500};
it('classifies only a durably linked completed academic appointment at its existing customer price',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[session]])};
 expect(await resolveLearningChargeDomain(charge,6,db)).toBe('tutoring');
 expect(db.execute.mock.calls[0][1]).toEqual([6,40,90,6,6]);
 const sql=db.execute.mock.calls[0][0];
 expect(sql).toContain('a.provider_user_id=s.provider_user_id');expect(sql).toContain('ca.is_active=1');expect(sql).toContain('student.client_id=c.id');expect(sql).toContain('FOR UPDATE');
});
it.each([
 {status:'live'},{actual_started_at:null},{ends_at:'2025-01-01 19:00:00'},{ends_at:'2099-01-01 21:00:00'},
 {appointment_status:'no_show'},{appointment_status:'canceled'},{business_type:'mental_health'},
 {metadata_json:{learningServiceCode:'HOMEWORK HELP'}},{metadata_json:{}},{appointment_service_code:'HOMEWORK HELP'},
 {appointment_service_code:'H2014'},{appointment_service_code:null},{payment_policy:'MANUAL'},{session_rate_cents:null},{session_rate_cents:4600}
])('requires review before collection when the source is incomplete or changed: %j',async change=>{
 const db={execute:vi.fn().mockResolvedValue([[{...session,...change}]])};
 await expect(resolveLearningChargeDomain(charge,6,db)).rejects.toHaveProperty('status',409);
});
it.each([{agency_id:2},{learning_program_session_id:8},{charge_type:'NO_SHOW_FEE'},{total_cents:5000},{amount_cents:5},{currency:'EUR'}])('does not widen a mismatched or differently priced charge: %j',async change=>{
 await expect(resolveLearningChargeDomain({...charge,...change},6,{execute:vi.fn().mockResolvedValue([[session]])})).rejects.toHaveProperty('status',409);
});
it.each([{rows:[]},{rows:[session,session]}])('requires exactly one verified source appointment',async ({rows})=>{
 await expect(resolveLearningChargeDomain(charge,6,{execute:vi.fn().mockResolvedValue([rows])})).rejects.toHaveProperty('status',409);
});
it('preserves the existing legacy classification and does not infer a service for an unlinked charge',async()=>{
 const db={execute:vi.fn().mockResolvedValueOnce([[{service_type:'coaching'}]]).mockResolvedValueOnce([[]])};
 expect(await resolveLearningChargeDomain({learning_program_session_id:12},6,db)).toBe('coaching');
 expect(db.execute.mock.calls[0][1]).toEqual([12,6]);
 expect(await resolveLearningChargeDomain({},6,db)).toBe('');
});
