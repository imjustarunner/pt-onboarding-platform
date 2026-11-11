import {expect,it,vi} from 'vitest';
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>false},registerPlugin:()=>({})}));
import {mobileRequestError} from '../transport.js';
it('gives a retryable network failure without treating it as a wrong code or dispatching another attempt',()=>{
 for(const error of [{code:'ERR_NETWORK',message:'Network Error'},{code:'ECONNABORTED'},{code:'MOBILE_CONNECTION_FAILED'},{code:'MOBILE_INVALID_RESPONSE'}])expect(mobileRequestError(error)).toContain('No extra attempt will be sent automatically');
});
it('retains specific server authentication and rate-limit guidance',()=>{
 expect(mobileRequestError({response:{status:401,data:{error:{message:'The quick access code did not match.'}}}})).toBe('The quick access code did not match.');
 expect(mobileRequestError({response:{status:429,data:{error:{message:'Try again later.'}}}})).toBe('Try again later.');
});
