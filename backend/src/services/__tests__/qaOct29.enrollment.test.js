import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute:vi.fn() }));
vi.mock('../../config/database.js', () => ({ default:{execute:m.execute}, onTableWrite:vi.fn() }));
vi.mock('../../models/SupervisorAssignment.model.js', () => ({ default:{findByAgency:async()=>[],findBySupervisee:async()=>[]} }));
vi.mock('../../models/Agency.model.js', () => ({ default:{} }));
import { listDisclosureProviders } from '../smartDisclosure.service.js';
import { ensureOfficeProviderStep } from '../../utils/intakeProviderPreference.js';
import { appointmentResponseUrl } from '../../utils/appointmentResponseUrl.js';
import { enrollmentConfirmationContent } from '../enrollmentReceiptContent.js';
import { buildClientLifecycleHistory } from '../../utils/clientLifecycleHistory.js';

it('uses AuricWell for clinical responses and retains the nonclinical tenant origin',()=>{
 expect(appointmentResponseUrl('token',{clinical:true})).toBe('https://auricwell.com/api/public/appointment-response/token');
 expect(appointmentResponseUrl('token',{clinical:false,url:()=> 'https://app.learning.test/nlu'})).toBe('https://app.learning.test/api/public/appointment-response/token');
});
it('preserves a submission calendar date instead of inventing midnight UTC for the care timeline',()=>{
 const history=buildClientLifecycleHistory({client:{submission_date:new Date('2026-10-29T00:00:00Z'),school_year:'2026-2027'}});
 expect(history.years[0].events[0].completedAt).toBe('2026-10-29');
});
it.each(['en','es'])('adds provider choice to a legacy full %s office master without replacing any saved question IDs',language_code=>{
 const steps=[{id:'legacy_questions',type:'questions',fields:[{key:'existing_answer'}]},{id:'consent',type:'packet_informed_group_consent'}];
 const link={form_type:'intake',scope_type:'agency',inherits_office_master:1,language_code};
 const result=ensureOfficeProviderStep(link,steps);
 expect(result.map(s=>s.id)).toEqual(['legacy_questions','office_available_providers','consent']);
 expect(result[0]).toBe(steps[0]);expect(steps).toHaveLength(2);expect(ensureOfficeProviderStep(link,result)).toBe(result);
});
it.each([{scope_type:'school',form_type:'intake'}, {scope_type:'agency',form_type:'quick_intake'}, {scope_type:'agency',form_type:'registration'}])('keeps provider choice out of ineligible forms %j',link=>{
 const steps=[{id:'existing',type:'questions'}];expect(ensureOfficeProviderStep({...link,inherits_office_master:1},steps)).toBe(steps);
});
it('welcomes families in both languages with a team signature, safe portal button, and no claimed booking',()=>{
 for(const locale of ['en','es']) {
  const content=enrollmentConfirmationContent({locale,agencyName:'Example <Care>',portalLoginUrl:'https://app.itsco.health/demo/login'});
  expect(content.html).toContain('Example &lt;Care&gt;');expect(content.html).not.toContain('Example <Care>');
  expect(content.html).toContain('href="https://app.itsco.health/demo/login"');expect(content.attachments).toBeNull();
  expect(content.text).toMatch(/does not confirm an appointment|no confirma una cita/);
 }
});
beforeEach(()=>{ m.execute.mockReset(); });
it('lists a school-assigned provider once even when the agency roster includes the same person',async()=>{
 const a={id:1,first_name:'Avery',last_name:'QA',role:'provider',status:'ACTIVE_EMPLOYEE',is_demo:0};
 const b={...a,id:2,first_name:'Alex'};
 m.execute.mockImplementation(async sql=>sql.includes('FROM provider_school_assignments')?[[a,b]]:sql.includes('FROM user_agencies')?[[a,b,{...a,id:3,first_name:'Cameron'}]]:[[]]);
 const providers=await listDisclosureProviders({agencyId:2,schoolOrganizationId:3});
 expect(providers.map(p=>p.id)).toEqual([1,2,3]);expect(providers.filter(p=>p.schoolAssigned).map(p=>p.id)).toEqual([1,2]);
});
