import {describe,it,expect} from 'vitest';
import {assertPasskeyAccount,passkeySite} from '../passkeyPolicy.js';
const user={role:'provider',status:'ACTIVE_EMPLOYEE',is_active:1};
describe('passkey access policy',()=>{
 it('allows guardians and provider roles only',()=>{for(const role of ['client_guardian','provider','provider_plus','intern','intern_plus'])expect(()=>assertPasskeyAccount({...user,role})).not.toThrow();for(const role of ['school_staff','admin','super_admin','client','kiosk','staff'])expect(()=>assertPasskeyAccount({...user,role})).toThrow();});
 it('rejects inactive, pending, archived, locked and expired access',()=>{for(const patch of [{status:'PENDING_SETUP'},{status:'ONBOARDING'},{status:'TERMINATED_PENDING'},{is_active:0},{is_archived:1},{pending_access_locked:1},{status_expires_at:'2020-01-01'},{status_expires_at:'bad'}])expect(()=>assertPasskeyAccount({...user,...patch})).toThrow();});
 it('pins RP IDs to exact allowed HTTPS origins and rejects header lookalikes',()=>{const allowed=['https://app.example.org','http://localhost:5186'];expect(passkeySite(allowed[0],allowed).rpID).toBe('app.example.org');expect(passkeySite(allowed[1],allowed).rpID).toBe('localhost');for(const origin of [undefined,'null','https://evil.example.org','https://app.example.org.evil.test','https://app.example.org/','http://app.example.org'])expect(()=>passkeySite(origin,allowed)).toThrow();});
});
