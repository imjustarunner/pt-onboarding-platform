import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import {summarizeFiscalSessions,validateFiscalBaseline,fiscalPeriod,sessionServiceDay} from '../clientFiscalSessions.service.js';
const period={start:'2026-07-01',end:'2027-06-30',today:'2026-11-22'};
const session=(id,extra={})=>({id,scheduled_start_at:'2026-08-01',service_code:'H0004',...extra});
it('counts separate H0004 encounters, never units, and deduplicates calendar/clinical/billing representations',()=>{
 const result=summarizeFiscalSessions({period,sessions:[session(1,{appointment_id:10,billing_encounter_id:20,units:3}),session(2,{units:2}),session(3,{units:2})],encounters:[{id:20,clinical_session_id:1,service_code:'H0004',service_date:'2026-08-01',units:3}],appointments:[{id:10,clinical_session_id:1,start_at:'2026-08-01'}]});
 expect(result.total).toBe(3);expect(result.imported).toBe(1);
});
it('excludes add-on lines, unrecognized codes and dates outside the July fiscal year',()=>{
 const result=summarizeFiscalSessions({period,sessions:[session(1,{service_code:'90837'}),session(2,{service_code:'90840'}),session(3,{service_code:'TUTORING'}),session(4,{scheduled_start_at:'2026-06-30'}),session(5,{scheduled_start_at:'2026-12-01'})]});
 expect(result.total).toBe(1);expect(result.unknownCodeRows).toBe(1);
});
it('replaces the verified earlier period rather than adding it on top of imported visits',()=>{
 const result=summarizeFiscalSessions({period,baseline:{id:8,session_count:22,through_date:'2026-08-31'},sessions:[session(1),session(2,{scheduled_start_at:'2026-09-01'}),session(3,{scheduled_start_at:'2026-09-02'})]});
 expect(result).toMatchObject({total:24,recorded:2,reviewSuggested:true});
});
it('uses explicit cross-source links even when more than one representation joins transitively',()=>{
 const result=summarizeFiscalSessions({period,sessions:[session(1,{appointment_id:10}),session(2,{billing_encounter_id:20})],encounters:[{id:20,clinical_session_id:1,service_code:'H0004',service_date:'2026-08-01'}],appointments:[{id:10,clinical_session_id:2,start_at:'2026-08-01'}]});
 expect(result.total).toBe(1);
});
it('validates dates and counts, with the fiscal year changing on July 1',()=>{
 expect(fiscalPeriod('2026-06-30').start).toBe('2025-07-01');expect(fiscalPeriod('2026-07-01').start).toBe('2026-07-01');
 for(const bad of [{throughDate:'2026-99-01',count:2},{throughDate:'2026-02-30',count:2},{throughDate:'2026-08-01',count:2.5},{throughDate:'2026-08-01',count:-1},{throughDate:'2027-01-01',count:2}])expect(()=>validateFiscalBaseline({...bad,reason:'Verified records'},period.today)).toThrow(expect.objectContaining({status:400}));
 expect(validateFiscalBaseline({throughDate:'2026-08-01',count:12,reason:'Verified records'},period.today)).toMatchObject({count:12});
});

it('uses the encounter timezone at the July 1 boundary and keeps policy sessions separate from H0004 and crisis',()=>{
 expect(sessionServiceDay('2026-07-01T02:00:00Z','America/Denver')).toBe('2026-06-30');
 const total=summarizeFiscalSessions({period,sessions:[session(1,{service_code:'90837'}),session(2,{service_code:'H0004'}),session(3,{service_code:'90839'}),session(4,{scheduled_start_at:'2026-07-01T02:00:00Z',source_timezone:'America/Denver'})]});
 expect(total.total).toBe(3);expect(total.psychotherapyTotal).toBe(1);
});
