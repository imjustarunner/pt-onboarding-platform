import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import Start from '../NoteworthyStartView.vue';
import { isPublicAuthFormActive } from '../../../utils/publicAuthForm';
import { publicSitePaths } from '../../../utils/publicDomainRouting';

const mocks=vi.hoisted(()=>({auth:{isAuthenticated:false,logout:vi.fn()},post:vi.fn()}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>mocks.auth}));
vi.mock('../../../services/api',()=>({default:{post:mocks.post}}));
const wrappers=[];
async function render(path='/fundthred/noteworthy/start') {
  const router=createRouter({history:createMemoryHistory(),routes:[
    {path:'/fundthred/noteworthy/start',name:'NoteworthyStart',component:Start},
    {path:'/fundthred/noteworthy/verify',name:'NoteworthyVerify',component:Start},
    {path:'/fundthred/noteworthy/accept-invite',name:'NoteworthyInvite',component:Start},
    {path:'/:pathMatch(.*)*',component:{template:'<div>Destination</div>'}}
  ]});
  await router.push(path);await router.isReady();
  const wrapper=mount(Start,{global:{plugins:[router]}});wrappers.push(wrapper);
  return {wrapper,router};
}
async function fillAccount(wrapper){
  await wrapper.get('input[autocomplete=organization]').setValue('Example Therapy');
  await wrapper.get('input[autocomplete=given-name]').setValue('Alex');
  await wrapper.get('input[autocomplete=family-name]').setValue('Example');
  await wrapper.get('input[autocomplete=email]').setValue('alex@example.test');
}
beforeEach(()=>{mocks.auth.isAuthenticated=false;mocks.auth.logout.mockReset();mocks.post.mockReset();});
afterEach(()=>{for(const wrapper of wrappers.splice(0))wrapper.unmount();vi.restoreAllMocks();});

describe('public-domain NoteWorthy URLs',()=>{
  it('round trips the standalone host routes without changing fragments or signup choices',()=>{
    const paths=publicSitePaths('fundthred.com');
    for(const path of ['/noteworthy','/noteworthy/demo?view=provider','/noteworthy/start?plan=growth','/noteworthy/app/71','/noteworthy/verify#token=demo-secret','/noteworthy/accept-invite#token=invite-secret']){
      expect(paths.internal(path)).toBe(`/fundthred${path}`);
      expect(paths.clean(paths.internal(path))).toBe(path);
    }
    expect(paths.internal('/api/noteworthy/signup')).toBe('/api/noteworthy/signup');
  });
});

describe('NoteWorthy account setup',()=>{
  it('opens resend recovery when this email already has a pending request',async()=>{
    mocks.post.mockRejectedValueOnce({response:{data:{error:{code:'VERIFICATION_PENDING',message:'Use Resend verification.'}}}}).mockResolvedValueOnce({data:{message:'Verification requested.'}});
    const {wrapper}=await render();await fillAccount(wrapper);await wrapper.get('form').trigger('submit');await flushPromises();
    const resend=wrapper.findAll('button').find(button=>button.text()==='Resend verification');
    expect(resend).toBeDefined();await resend.trigger('click');await flushPromises();
    expect(mocks.post).toHaveBeenLastCalledWith('/noteworthy/resend-verification',{email:'alex@example.test'},expect.any(Object));
  });
  it('requests email verification with the selected approved plan before collecting any account password',async()=>{
    mocks.post.mockResolvedValue({data:{message:'If the account can be created, check your email.'}});
    const {wrapper}=await render('/fundthred/noteworthy/start?plan=growth');
    expect(isPublicAuthFormActive()).toBe(true);
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
    await fillAccount(wrapper);await wrapper.get('form').trigger('submit');await flushPromises();
    expect(mocks.post).toHaveBeenCalledWith('/noteworthy/signup',{practiceName:'Example Therapy',firstName:'Alex',lastName:'Example',email:'alex@example.test',plan:'growth'},expect.objectContaining({headers:{'X-Noteworthy-Request':'1'},skipGlobalLoading:true}));
    expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('password');
    expect(wrapper.text()).toContain('Check your email.');
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Only-a-fictional-passphrase!');
  });
  it('keeps practice agreements separate and does not invite clinical report uploads on signup',async()=>{
    const {wrapper}=await render('/fundthred/noteworthy/start?plan=unsupported');
    expect(wrapper.get('select').element.value).toBe('essential');
    expect(wrapper.text()).toContain('No payment is collected here.');
    expect(wrapper.text()).toContain('before billing-report uploads');
    expect(wrapper.find('input[type=file]').exists()).toBe(false);
  });
  it('prevents duplicate signups while the initial request is still pending',async()=>{
    let resolve;mocks.post.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    const {wrapper}=await render();await fillAccount(wrapper);
    await wrapper.get('form').trigger('submit');await wrapper.get('form').trigger('submit');
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(wrapper.get('button.nw-submit').attributes('disabled')).toBeDefined();
    resolve({data:{message:'Check your email.'}});await flushPromises();
    expect(wrapper.text()).toContain('Check your email.');
  });
  it('creates an authenticated practice without submitting account credentials again',async()=>{
    mocks.auth.isAuthenticated=true;mocks.post.mockResolvedValue({data:{agencyId:71}});
    const {wrapper,router}=await render('/fundthred/noteworthy/start?plan=enterprise');
    await wrapper.get('input[autocomplete=organization]').setValue('Example Therapy');
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
    await wrapper.get('form').trigger('submit');await flushPromises();
    expect(mocks.post).toHaveBeenCalledWith('/noteworthy/practices',{practiceName:'Example Therapy',plan:'enterprise'},expect.any(Object));
    expect(router.currentRoute.value.fullPath).toBe('/fundthred/noteworthy/app/71');
  });
  it('offers account verification when the authenticated practice owner still needs it',async()=>{
    mocks.auth.isAuthenticated=true;
    mocks.post.mockRejectedValueOnce({response:{data:{error:{code:'EMAIL_VERIFICATION_REQUIRED',message:'Verify this email before creating a practice.'}}}}).mockResolvedValueOnce({data:{verificationSent:true}});
    const {wrapper}=await render();await wrapper.get('input[autocomplete=organization]').setValue('Example Therapy');
    await wrapper.get('form').trigger('submit');await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('Verify this email');
    const verify=wrapper.findAll('button').find(button=>button.text()==='Send account verification email');
    await verify.trigger('click');await flushPromises();
    expect(mocks.post).toHaveBeenLastCalledWith('/noteworthy/request-account-verification',{},expect.any(Object));
    expect(wrapper.text()).toContain('Verification email sent.');
  });
});

describe('verification and provider invitation secrets',()=>{
  it('strips a verification fragment from the browser URL and sends the token only in a POST body on confirmation',async()=>{
    const history=vi.spyOn(window.history,'replaceState');const storage=vi.spyOn(Storage.prototype,'setItem');
    mocks.post.mockResolvedValue({data:{verified:true}});
    const {wrapper}=await render('/fundthred/noteworthy/verify#token=verification-secret');
    expect(history).toHaveBeenCalled();expect(String(history.mock.calls.at(-1)[2])).not.toContain('verification-secret');
    expect(storage).not.toHaveBeenCalled();expect(mocks.post).not.toHaveBeenCalled();
    await wrapper.get('form').trigger('submit');await flushPromises();
    expect(mocks.post).toHaveBeenCalledWith('/noteworthy/verify',{token:'verification-secret'},expect.any(Object));
    expect(mocks.post.mock.calls[0][0]).not.toContain('secret');
    expect(wrapper.text()).toContain('Email verified.');
    expect(wrapper.find('button.nw-submit').exists()).toBe(false);
  });
  it('never treats query-string tokens as valid verification credentials',async()=>{
    const {wrapper}=await render('/fundthred/noteworthy/verify?token=do-not-use-query');
    expect(wrapper.find('button.nw-submit').exists()).toBe(false);expect(mocks.post).not.toHaveBeenCalled();
    expect(wrapper.findAll('a').some(link=>link.attributes('href')?.includes('redirect=/fundthred/noteworthy/app'))).toBe(true);
  });
  it('keeps a pending email token in memory until password setup succeeds and never stores the new password',async()=>{
    const storage=vi.spyOn(Storage.prototype,'setItem');
    mocks.post.mockResolvedValueOnce({data:{passwordRequired:true}})
      .mockRejectedValueOnce({response:{data:{error:{code:'PASSWORD_POLICY',message:'Choose a stronger password.'}}}})
      .mockResolvedValueOnce({data:{verified:true}});
    const {wrapper}=await render('/fundthred/noteworthy/verify#token=pending-account-secret');
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
    await wrapper.get('form').trigger('submit');await flushPromises();
    expect(mocks.post).toHaveBeenNthCalledWith(1,'/noteworthy/verify',{token:'pending-account-secret'},expect.any(Object));
    expect(wrapper.text()).not.toContain('Email verified.');
    expect(wrapper.text()).toContain('Choose your password');
    await wrapper.get('input[autocomplete=new-password]').setValue('A-fictional-verified-password!');
    await wrapper.get('form').trigger('submit');await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('Choose a stronger password.');
    expect(wrapper.text()).not.toContain('Email verified.');
    await wrapper.get('form').trigger('submit');await flushPromises();
    expect(mocks.post).toHaveBeenNthCalledWith(3,'/noteworthy/verify',{token:'pending-account-secret',password:'A-fictional-verified-password!'},expect.any(Object));
    expect(storage).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Email verified.');
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
    expect(wrapper.html()).not.toContain('pending-account-secret');
    expect(wrapper.html()).not.toContain('A-fictional-verified-password!');
  });
  it('signs out an unrelated principal after verification requires the invited account to sign in',async()=>{
    mocks.auth.isAuthenticated=true;mocks.post.mockResolvedValue({data:{verified:true,signInRequired:true}});
    const {wrapper}=await render('/fundthred/noteworthy/verify#token=account-verification');
    await wrapper.get('form').trigger('submit');await flushPromises();
    expect(mocks.auth.logout).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Email verified.');
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
  });
  it('accepts a provider invitation with a new password without retaining the secret in visible markup or storage',async()=>{
    const storage=vi.spyOn(Storage.prototype,'setItem');mocks.post.mockResolvedValue({data:{accepted:true}});
    const {wrapper}=await render('/fundthred/noteworthy/accept-invite#token=invitation-secret');
    await wrapper.get('input[type=password]').setValue('A-fictional-provider-password!');
    await wrapper.get('form').trigger('submit');await flushPromises();
    expect(mocks.post).toHaveBeenCalledWith('/noteworthy/accept-invite',{token:'invitation-secret',password:'A-fictional-provider-password!'},expect.any(Object));
    expect(storage).not.toHaveBeenCalled();expect(wrapper.html()).not.toContain('invitation-secret');
    expect(wrapper.text()).toContain('Your payroll portal is ready.');
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
  });
  it('accepts an invitation for the signed-in user without sending a new password',async()=>{
    mocks.auth.isAuthenticated=true;mocks.post.mockResolvedValue({data:{accepted:true}});
    const {wrapper}=await render('/fundthred/noteworthy/accept-invite#token=existing-user-invite');
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
    await wrapper.get('form').trigger('submit');await flushPromises();
    expect(mocks.post).toHaveBeenCalledWith('/noteworthy/accept-invite',{token:'existing-user-invite'},expect.any(Object));
  });
  it('lets an unrelated signed-in account supply the password required by a new invitation, then signs out that account',async()=>{
    mocks.auth.isAuthenticated=true;
    mocks.post.mockRejectedValueOnce({response:{data:{error:{code:'PASSWORD_REQUIRED',message:'Set a password for the invited account.'}}}}).mockResolvedValueOnce({data:{accepted:true,signInRequired:true}});
    const {wrapper}=await render('/fundthred/noteworthy/accept-invite#token=new-provider-invite');
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
    await wrapper.get('form').trigger('submit');await flushPromises();
    await wrapper.get('input[type=password]').setValue('Fictional-new-provider-password!');
    await wrapper.get('form').trigger('submit');await flushPromises();
    expect(mocks.post).toHaveBeenLastCalledWith('/noteworthy/accept-invite',{token:'new-provider-invite',password:'Fictional-new-provider-password!'},expect.any(Object));
    expect(mocks.auth.logout).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Your payroll portal is ready.');
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
  });
  it('lets the wrong account sign out and use the invited existing account without accepting as that wrong user',async()=>{
    mocks.auth.isAuthenticated=true;
    mocks.post.mockRejectedValue({response:{data:{error:{code:'EXISTING_ACCOUNT_SIGN_IN_REQUIRED',message:'Sign in as the invited user.'}}}});
    const {wrapper,router}=await render('/fundthred/noteworthy/accept-invite#token=existing-account-invite');
    await wrapper.get('form').trigger('submit');await flushPromises();
    expect(wrapper.text()).not.toContain('Your payroll portal is ready.');
    const switchAccount=wrapper.findAll('button').find(button=>button.text()==='Sign out and use the invited account');
    await switchAccount.trigger('click');await flushPromises();
    expect(mocks.auth.logout).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.redirect).toBe('/fundthred/noteworthy/app');
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
});
