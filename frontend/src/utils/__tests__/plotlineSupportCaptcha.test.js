import {beforeEach,afterEach,expect,it,vi} from 'vitest';
let captcha;
beforeEach(async()=>{vi.resetModules();delete window.grecaptcha;captcha=(await import('../plotlineSupportCaptcha.js')).plotlineSupportCaptcha;});
afterEach(()=>{delete window.grecaptcha;document.querySelectorAll('script[src*="recaptcha/"]').forEach(node=>node.remove());});
it('uses the Enterprise API when already loaded',async()=>{
 const execute=vi.fn(async()=> 'synthetic-proof');window.grecaptcha={execute:vi.fn(),enterprise:{ready:callback=>callback(),execute}};
 expect(await captcha('PUBLIC-KEY',true)).toBe('synthetic-proof');expect(execute).toHaveBeenCalledWith('PUBLIC-KEY',{action:'plotline_support'});expect(window.grecaptcha.execute).not.toHaveBeenCalled();
});
it('loads enterprise.js rather than api.js for an Enterprise key',async()=>{
 const promise=captcha('PUBLIC-KEY',true),script=document.querySelector('script');expect(script.src).toContain('/recaptcha/enterprise.js?render=PUBLIC-KEY');
 window.grecaptcha={enterprise:{ready:callback=>callback(),execute:vi.fn(async()=> 'proof')}};script.dispatchEvent(new Event('load'));expect(await promise).toBe('proof');
});
it('fails closed when verification is not configured or the script fails',async()=>{
 await expect(captcha('',true)).rejects.toThrow('unavailable');const promise=captcha('PUBLIC-KEY',true);document.querySelector('script').dispatchEvent(new Event('error'));await expect(promise).rejects.toThrow('could not load');
});
