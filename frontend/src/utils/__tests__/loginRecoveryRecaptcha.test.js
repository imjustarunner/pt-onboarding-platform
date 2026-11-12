import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {setLoginRecoveryRecaptchaConfig,isLoginRecoveryRecaptchaConfigured,getLoginRecoveryCaptchaToken} from '../loginRecoveryRecaptcha.js';
beforeEach(()=>{vi.stubEnv('VITE_RECAPTCHA_SITE_KEY','ordinary-site-key');vi.stubEnv('VITE_RECAPTCHA_USE_ENTERPRISE','false');setLoginRecoveryRecaptchaConfig();window.grecaptcha={execute:vi.fn().mockResolvedValue('ordinary-token')};});
afterEach(()=>{vi.unstubAllEnvs();delete window.grecaptcha;setLoginRecoveryRecaptchaConfig();});
it('a server-verified synthetic context loads/executes no optional CAPTCHA even with a build-time key',async()=>{
 setLoginRecoveryRecaptchaConfig({disabled:true});expect(isLoginRecoveryRecaptchaConfigured()).toBe(false);expect(await getLoginRecoveryCaptchaToken('login_password_reset')).toBe('');expect(window.grecaptcha.execute).not.toHaveBeenCalled();expect(document.querySelector('script[data-login-recaptcha]')).toBeNull();
});
it('clearing synthetic context restores the ordinary account policy',async()=>{
 setLoginRecoveryRecaptchaConfig({disabled:true});setLoginRecoveryRecaptchaConfig();expect(isLoginRecoveryRecaptchaConfigured()).toBe(true);expect(await getLoginRecoveryCaptchaToken('login_password_reset')).toBe('ordinary-token');expect(window.grecaptcha.execute).toHaveBeenCalledWith('ordinary-site-key',{action:'login_password_reset'});
});
it('a subsequent real tenant config replaces rather than inherits demo state',async()=>{
 setLoginRecoveryRecaptchaConfig({disabled:true});setLoginRecoveryRecaptchaConfig({siteKey:'real-key',useEnterprise:false,disabled:false});expect(await getLoginRecoveryCaptchaToken('login_recover_username')).toBe('ordinary-token');expect(window.grecaptcha.execute).toHaveBeenCalledWith('real-key',{action:'login_recover_username'});
});

it('changing account clears disabled state immediately and late QA status cannot disable the real context',async()=>{
 const {createLoginRecoveryCaptchaScope}=await import('../loginRecoveryCaptchaScope.js');
 let releaseQa; const pending=new Promise(resolve=>{releaseQa=resolve;});
 const scope=createLoginRecoveryCaptchaScope(vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce({siteKey:'real-key',skipForSyntheticQa:false}));
 const old=scope.load({organizationSlug:'nlu-qa-demo',identifier:'fake@example.com'});
 scope.invalidate(); expect(isLoginRecoveryRecaptchaConfigured()).toBe(true);
 expect((await scope.load({organizationSlug:'nlu',identifier:'real@example.com'})).current).toBe(true);
 releaseQa({siteKey:null,skipForSyntheticQa:true}); expect((await old).current).toBe(false);
 expect(await getLoginRecoveryCaptchaToken('login_password_reset')).toBe('ordinary-token');
 expect(window.grecaptcha.execute).toHaveBeenCalledWith('real-key',{action:'login_password_reset'});
});
it('unknown account lookup after demo context retains ordinary config; unmounted context cannot apply a late result',async()=>{
 const {createLoginRecoveryCaptchaScope}=await import('../loginRecoveryCaptchaScope.js');
 let release;
 const scope=createLoginRecoveryCaptchaScope(vi.fn().mockResolvedValueOnce({skipForSyntheticQa:true}).mockRejectedValueOnce(new Error('unavailable')).mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})));
 await scope.load({organizationSlug:'auricwell-qa-demo',identifier:'fake@example.com'}); expect(isLoginRecoveryRecaptchaConfigured()).toBe(false);
 scope.invalidate(); expect(isLoginRecoveryRecaptchaConfigured()).toBe(true);
 await scope.load({organizationSlug:'itsco',identifier:'unknown@example.com'}); expect(isLoginRecoveryRecaptchaConfigured()).toBe(true);
 const late=scope.load({organizationSlug:'auricwell-qa-demo',identifier:'fake@example.com'});scope.dispose();release({skipForSyntheticQa:true}); expect((await late).current).toBe(false);expect(isLoginRecoveryRecaptchaConfigured()).toBe(true);
});
