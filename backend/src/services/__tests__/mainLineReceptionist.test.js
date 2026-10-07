import {describe, it, expect} from 'vitest';
import {defaultPhoneWorkflow} from '../phoneWorkflow.service.js';
import {previewMainLineReceptionist} from '../mainLineReceptionist.service.js';
const preview = (scenario, intent = 'support') => previewMainLineReceptionist(defaultPhoneWorkflow('ITSCO'), {scenario, intent});

describe('main-line receptionist preparation', () => {
  it.each(['unknown', 'known_no_appointments', 'shared_number', 'lookup_unavailable'])('keeps the %s greeting general', scenario => {
    const result = preview(scenario);
    expect(result.greeting).toContain('Thank you for calling ITSCO.');
    expect(result.greeting).not.toMatch(/cancel|reschedule|appointment/i);
    expect(result.options).toEqual(['Support', 'Scheduling', 'Billing']);
  });
  it('offers appointment help only for the recognized upcoming-appointments scenario', () => {
    const result = preview('known_appointments');
    expect(result.greeting).toContain('cancel or reschedule an appointment');
    expect(result.greeting).not.toContain('your appointment');
    expect(result.greeting).toContain('press zero');
    expect(result.greeting).toContain('If no one is available, you can leave a message.');
    expect(result).toMatchObject({simulation:true, callsPlaced:false, callerLookupConnected:false, appointmentActionsConnected:false});
  });
  it.each(['unknown', 'known_appointments', 'shared_number'])('requires verification and confirmation for a %s cancellation request', scenario => {
    const result = preview(scenario, 'cancel');
    expect(result.steps[0]).toContain('Caller ID alone is not verification');
    expect(result.steps[1]).toContain('never select one automatically');
    expect(result.steps[2]).toContain('explicit confirmation');
    expect(result.steps.at(-1)).toContain('has not been changed');
  });
  it('keeps the original appointment until a replacement is saved', () => {
    expect(preview('known_appointments', 'reschedule').steps[2]).toContain('Keep the original appointment');
  });
  it('routes billing without exposing account information', () => {
    expect(preview('known_appointments', 'billing').steps[0]).toContain('billing-tagged');
    expect(preview('known_appointments', 'billing').steps[0]).toContain('Verify identity');
  });
  it.each([{scenario:'verified'}, {scenario:{name:'someone'}}, {intent:'delete'}, {intent:null}])('rejects unsupported preview values', options => {
    expect(() => previewMainLineReceptionist(defaultPhoneWorkflow(), options)).toThrow();
  });
});
