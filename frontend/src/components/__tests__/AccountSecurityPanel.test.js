import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,fixture') } }));
import api from '../../services/api';
import Panel from '../AccountSecurityPanel.vue';
const session = {reference:'a'.repeat(64),startedAt:'2026-09-16T14:00:00Z',lastActivityAt:'2026-09-16T14:05:00Z',phase:'unknown',endedAt:null,clientIp:'192.0.2.1',ipSource:'unverified_proxy',browser:'Test browser'};
let state;
beforeEach(() => {
  vi.clearAllMocks(); state={enabled:false,verified:false,required:true,rememberDays:30,devices:[]};
  api.get.mockImplementation(async url => ({data:url==='/account-security'?{...state}:url.endsWith('/events')?{items:[],nextCursor:null}:{items:[session],hasMore:false}}));
});
async function open() { const wrapper=mount(Panel);await flushPromises();return wrapper; }
describe('personal security screen', () => {
  it('explains the optional rollout and lets enrolled users return without verification',async()=>{
    state={...state,required:false,enabled:true};
    const wrapper=await open();
    expect(wrapper.text()).toContain('Setup is optional for now');
    expect(wrapper.text()).toContain('over the next few months');
    expect(wrapper.text()).toContain('Google SSO users do not need additional app verification');
    expect(wrapper.text()).not.toContain('You can keep using client codes and initials');
    expect(wrapper.text()).toContain('Return to your workspace');wrapper.unmount();
  });
  it('tells Google SSO users no additional app verification is required',async()=>{
    state={...state,required:false,ssoAuthenticated:true};
    const wrapper=await open();
    expect(wrapper.text()).toContain('You’re signed in with Google. No additional app verification is required.');
    expect(wrapper.find('button.btn-primary').exists()).toBe(true);wrapper.unmount();
  });
  it('offers school staff email verification without authenticator enrollment or device remembering',async()=>{
    state={...state,method:'email',enabled:true,authenticatorEnabled:false,rememberDays:0,maskedEmail:'s•••@school.example'};
    api.post.mockImplementation(async url=>{if(url.endsWith('/verify'))state.verified=true;return {data:{sent:true,verified:state.verified}};});
    const wrapper=await open();
    expect(wrapper.text()).toContain('s•••@school.example');expect(wrapper.text()).not.toContain('Set up authenticator');expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    await wrapper.findAll('button').find(b=>b.text()==='Email me a code').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/account-security/email/send',{},expect.anything());expect(wrapper.text()).toContain('Code sent.');expect(wrapper.text()).not.toContain('Your current sign-in is verified.');
    await wrapper.find('input[autocomplete="one-time-code"]').setValue('012345');await wrapper.find('form').trigger('submit');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/account-security/email/verify',{code:'012345'},expect.anything());expect(wrapper.text()).toContain('Your current sign-in is verified.');wrapper.unmount();
  });
  it('does not claim email delivery or unlock access when sending fails',async()=>{
    state={...state,method:'email',enabled:true,authenticatorEnabled:false,rememberDays:0};
    api.post.mockRejectedValue({response:{data:{error:{message:'The code could not be sent.'}}}});
    const wrapper=await open();await wrapper.findAll('button').find(b=>b.text()==='Email me a code').trigger('click');await flushPromises();
    expect(wrapper.text()).toContain('The code could not be sent.');expect(wrapper.text()).not.toContain('Code sent.');expect(wrapper.text()).not.toContain('Your current sign-in is verified.');wrapper.unmount();
  });
  it('explains protected access clearly and does not remember shared devices by default',async()=>{
    state.enabled=true;const wrapper=await open();
    expect(wrapper.text()).toContain('You can keep using client codes and initials');
    expect(wrapper.text()).toContain('No text message or phone number is needed');
    expect(wrapper.findAll('input[type="checkbox"]').every(input=>!input.element.checked)).toBe(true);
    wrapper.unmount();
  });
  it('does not invent an ending for a historical session',async()=>{
    const wrapper=await open();expect(wrapper.text()).toContain('No confirmed end recorded');expect(wrapper.text()).toContain('Source address not verified');wrapper.unmount();
  });
  it('requires successful enrollment confirmation before claiming protection and displays recovery codes once',async()=>{
    api.post.mockImplementation(async url=>{
      if(url.endsWith('/begin'))return{data:{secret:'PRIVATE_SETUP_KEY',uri:'otpauth://totp/test?secret=PRIVATE_SETUP_KEY'}};
      state.enabled=true;state.verified=true;return{data:{verified:true,recoveryCodes:['one-use-private-recovery']}};
    });
    const wrapper=await open();await wrapper.find('input[type="password"]').setValue('private-password');await wrapper.find('form').trigger('submit');await flushPromises();
    expect(wrapper.find('img').attributes('src')).toMatch(/^data:/);expect(wrapper.text()).not.toContain('Your current sign-in is verified.');
    await wrapper.find('input[autocomplete="one-time-code"]').setValue('123456');await wrapper.find('form').trigger('submit');await flushPromises();
    expect(wrapper.text()).toContain('Your current sign-in is verified.');expect(wrapper.text()).toContain('one-use-private-recovery');expect(wrapper.text()).not.toContain('PRIVATE_SETUP_KEY');
    const sent=api.post.mock.calls.find(([url])=>url.endsWith('/confirm'));expect(sent[1]).toMatchObject({rememberDevice:false,personalDevice:false});expect(sent[2].headers['X-Account-Security']).toBe('1');
    await wrapper.findAll('button').find(button=>button.text()==='I have saved these codes').trigger('click');expect(wrapper.text()).not.toContain('one-use-private-recovery');wrapper.unmount();
  });
  it('keeps protected access locked after a rejected code',async()=>{
    state.enabled=true;api.post.mockRejectedValue({response:{data:{error:{message:'That code was already used.'}}}});
    const wrapper=await open();await wrapper.find('input[autocomplete="one-time-code"]').setValue('123456');await wrapper.find('form').trigger('submit');await flushPromises();
    expect(wrapper.text()).toContain('That code was already used.');expect(wrapper.text()).not.toContain('Your current sign-in is verified.');wrapper.unmount();
  });
  it('shows a recoverable error when account security cannot be loaded',async()=>{
    api.get.mockRejectedValue(new Error('offline'));const wrapper=await open();expect(wrapper.find('[role="alert"]').exists()).toBe(true);expect(wrapper.find('form').exists()).toBe(false);wrapper.unmount();
  });
});
