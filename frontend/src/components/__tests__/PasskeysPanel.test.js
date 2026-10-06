import {beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),delete:vi.fn()}}));
vi.mock('@simplewebauthn/browser',()=>({browserSupportsWebAuthn:()=>true,startRegistration:vi.fn(),startAuthentication:vi.fn()}));
import api from '../../services/api';import {startRegistration,startAuthentication} from '@simplewebauthn/browser';
import Panel from '../PasskeysPanel.vue';import SignIn from '../PasskeySignIn.vue';
let state;
beforeEach(()=>{vi.clearAllMocks();Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});state={eligible:true,enabled:false,keys:[],recentlyVerified:false,recoveryCodesRemaining:0};api.get.mockImplementation(async()=>({data:{...state}}));startRegistration.mockResolvedValue({id:'registration'});startAuthentication.mockResolvedValue({id:'assertion'});});
async function open(){const w=mount(Panel);await flushPromises();return w;}
describe('passkey enrollment and sign-in',()=>{
 it('hides enrollment for schools and SSO accounts',async()=>{state.eligible=false;const w=await open();expect(w.find('form').exists()).toBe(false);w.unmount();});
 it('shows success and recovery codes only after server verification',async()=>{
  api.post.mockImplementation(async url=>url.endsWith('/options')?{data:{challengeId:'challenge',options:{challenge:'webauthn'}}}:{data:{registered:true,recoveryCodes:['private-once']}});
  const w=await open();await w.find('input[type=password]').setValue('account-password');await w.find('form').trigger('submit');await flushPromises();
  expect(startRegistration).toHaveBeenCalledWith({optionsJSON:{challenge:'webauthn'}});expect(api.post).toHaveBeenCalledWith('/account-security/passkeys/register/verify',{challengeId:'challenge',response:{id:'registration'}},expect.anything());expect(w.text()).toContain('private-once');expect(w.find('input[type=password]').element.value).toBe('');expect(w.attributes('data-analytics-ignore')).toBeDefined();
  await w.findAll('button').find(b=>b.text()==='I saved my codes').trigger('click');expect(w.text()).not.toContain('private-once');w.unmount();
 });
 it('handles cancellation without submitting an attestation',async()=>{api.post.mockResolvedValue({data:{challengeId:'c',options:{}}});startRegistration.mockRejectedValue({name:'NotAllowedError'});const w=await open();await w.find('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledTimes(1);expect(w.text()).toContain('canceled or timed out');expect(w.text()).not.toContain('Passkey saved.');w.unmount();});
 it('requires confirmation before recovery and clears its secrets afterward',async()=>{state.enabled=true;const w=await open();let form=w.findAll('form').at(-1);expect(form.find('button').attributes('disabled')).toBeDefined();await form.find('input[type=password]').setValue('password');await form.find('input[autocomplete=off]').setValue('one-use-code');await form.find('input[type=checkbox]').setValue(true);api.post.mockResolvedValue({data:{recovered:true}});await form.trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/account-security/passkeys/recover',{password:'password',code:'one-use-code'},expect.anything());expect(startRegistration).not.toHaveBeenCalled();expect(w.findAll('form').at(-1).find('input[type=password]').element.value).toBe('');w.unmount();});
 it('emits a sign-in only after the server confirms the assertion',async()=>{api.post.mockImplementation(async url=>url.endsWith('/options')?{data:{challengeId:'c',options:{challenge:'w'}}}:{data:{user:{id:1},sessionId:'session'}});const w=mount(SignIn);await w.find('button').trigger('click');await flushPromises();expect(w.emitted('signed-in')[0][0]).toEqual({user:{id:1},sessionId:'session'});expect(startAuthentication).toHaveBeenCalledWith({optionsJSON:{challenge:'w'}});w.unmount();});
 it('does not emit a sign-in after server rejection',async()=>{api.post.mockImplementation(async url=>{if(url.endsWith('/options'))return {data:{challengeId:'c',options:{}}};throw {response:{data:{error:{message:'Your organization requires Google sign-in.'}}}};});const w=mount(SignIn);await w.find('button').trigger('click');await flushPromises();expect(w.emitted('signed-in')).toBeUndefined();expect(w.text()).toContain('requires Google');w.unmount();});
});
