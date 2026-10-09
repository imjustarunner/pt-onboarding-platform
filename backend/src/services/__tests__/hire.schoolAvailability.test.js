import { describe, it, expect, vi } from 'vitest';
import { hasSchoolServiceFocus, schoolAvailabilityStep, validateSchoolServiceAvailability, schoolAvailabilitySummary } from '../../utils/schoolServiceAvailability.js';
import { persistSchoolServiceAvailability } from '../schoolServiceAvailability.service.js';
import { sanitizeWorkflow, onboardingPasswordReady, summarizeSteps } from '../../utils/hirePortalWorkflow.js';
const valid = () => ({ available:true,notes:' Travel between schools ',blocks:[{dayOfWeek:'Monday',startTime:'08:00',endTime:'15:00'}] });
describe('school focus onboarding', () => {
  it.each(['School','school-based counseling','School-Based Skill Development','School-Based Mentorship','Office & Schools'])('includes %s', service_focus => {
    expect(hasSchoolServiceFocus({service_focus})).toBe(true);
    expect(schoolAvailabilityStep({service_focus}, null)).toMatchObject({required:true,complete:false});
  });
  it.each(['','Office-Based Counseling','Community','Clinical Practice & Mentorship'])('does not require school hours for %s', service_focus => {
    expect(schoolAvailabilityStep({service_focus}, null)).toBe(null);
  });
  it('does not add new requirements to closed packages and preserves saved answers', () => {
    expect(schoolAvailabilityStep({service_focus:'School'},null,true)).toBe(null);
    const saved = {value:valid(),completedAt:'2026-10-09'};
    expect(schoolAvailabilityStep({service_focus:'Office'},saved,true)).toMatchObject({complete:true,required:false,values:saved.value});
  });
  it('requires completion before onboarding/password readiness and reserves its step key', () => {
    const step = schoolAvailabilityStep({service_focus:'School'});
    expect(summarizeSteps([step]).allDone).toBe(false);
    expect(onboardingPasswordReady({status:'ONBOARDING'},{steps:{onboarding:[step]}})).toBe(false);
    expect(sanitizeWorkflow({resources:[{id:'school-availability',title:'Resource'}]}).resources[0].id).toBe('resource-school-availability');
  });
});
describe('school hours validation and persistence', () => {
  it('normalizes valid hours and notes', () => {
    expect(validateSchoolServiceAvailability(valid()).notes).toBe('Travel between schools');
    expect(schoolAvailabilitySummary(valid())).toContain('Monday: 8:00 a.m.–3:00 p.m.');
  });
  it('requires an explicit answer and at least one weekday when available', () => {
    expect(()=>validateSchoolServiceAvailability({...valid(),available:null})).toThrow('Choose whether');
    expect(()=>validateSchoolServiceAvailability({...valid(),blocks:[]})).toThrow('at least one');
    expect(validateSchoolServiceAvailability({...valid(),available:false}).blocks).toEqual([]);
  });
  it.each([
    [{dayOfWeek:'Saturday',startTime:'08:00',endTime:'15:00'}],
    [{dayOfWeek:'Monday',startTime:'15:00',endTime:'08:00'}],
    [{dayOfWeek:'Monday',startTime:'08:00',endTime:'08:00'}],
    [{dayOfWeek:'Monday',startTime:'25:00',endTime:'26:00'}],
    [{dayOfWeek:'Monday',startTime:'8am',endTime:'3pm'}],
    [null],
    [...valid().blocks,...valid().blocks]
  ])('rejects invalid or duplicate blocks %#', (...blocks) => {
    expect(()=>validateSchoolServiceAvailability({...valid(),blocks})).toThrow();
  });
  it('writes readable profile hours using the supplied transaction and keeps placements separate', async () => {
    const db = {execute:vi.fn(async sql => sql.startsWith('SELECT') ? [[{id:15}]] : [{affectedRows:1}])};
    await persistSchoolServiceAvailability(db,8,2,validateSchoolServiceAvailability(valid()));
    const values = db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO user_info_values')).map(([,params])=>params);
    expect(values).toEqual([[8,15,'["Monday"]'],[8,15,'Monday: 8:00 a.m.–3:00 p.m.\nNotes: Travel between schools']]);
    expect(db.execute.mock.calls.some(([sql])=>/provider_school_assignments|office_events/.test(sql))).toBe(false);
  });
});
