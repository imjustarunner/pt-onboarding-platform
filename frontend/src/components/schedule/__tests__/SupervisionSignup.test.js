import { afterEach, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SupervisionSignupCountdown from '../SupervisionSignupCountdown.vue';
import SupervisionRsvpSummary from '../SupervisionRsvpSummary.vue';
import { supervisionSignupState, supervisionSignupLabel } from '../../../utils/supervisionSignupState.js';
afterEach(()=>vi.useRealTimers());
const event={enrollmentMode:'signup_only',startAt:'2026-10-22T00:00:00Z',signupClosesAt:'2026-10-19T18:00:00Z'};
it('distinguishes upcoming signup from closed signup using the current session, not a stale copied deadline',()=>{
  expect(supervisionSignupState(event,Date.parse('2026-10-20T23:59:59Z'))).toBe('upcoming');
  expect(supervisionSignupLabel(event,Date.parse('2026-10-20T23:59:59Z'))).toBe('Signup opens 24 hours before');
  expect(supervisionSignupState(event,Date.parse('2026-10-21T00:00:00Z'))).toBe('open');
  expect(supervisionSignupState(event,Date.parse('2026-10-21T23:00:00Z'))).toBe('closed');
  expect(supervisionSignupState({...event,enrollmentMode:'invited'},Date.parse('2026-10-21T00:00:00Z'))).toBe('none');
});
it('shows time until opening, then time left to sign up without needing a reload',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-20T23:59:00Z'));
  const wrapper=mount(SupervisionSignupCountdown,{props:{opensAt:'2026-10-21T00:00:00Z',closesAt:'2026-10-21T23:00:00Z'}});
  expect(wrapper.text()).toBe('Signup opens in 1m');
  await vi.advanceTimersByTimeAsync(60000);
  expect(wrapper.text()).toBe('Signup closes in 23h 0m');
  wrapper.unmount();
});
it('shows confirmed attendees to everyone and declined responses only to authorized viewers',async()=>{
  const people=[{userId:1,name:'Confirmed person',status:'SIGNED_UP'},{userId:2,name:'Declined person',status:'DECLINED',declineReason:'Private reason'},{userId:3,name:'Pending person',status:'INVITED'}];
  const wrapper=mount(SupervisionRsvpSummary,{props:{people}});
  expect(wrapper.text()).toContain('Confirmed person');expect(wrapper.text()).not.toContain('Pending person');
  expect(wrapper.text()).not.toContain('Declined person');expect(wrapper.text()).not.toContain('Private reason');
  await wrapper.setProps({canSeeDeclined:true});expect(wrapper.text()).toContain('Declined person');expect(wrapper.text()).toContain('Private reason');
  wrapper.unmount();
});
