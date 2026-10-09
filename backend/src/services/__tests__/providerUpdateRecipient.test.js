import {it,expect,vi} from 'vitest';
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list:vi.fn()}}));
import {providerUpdateWorkEmail} from '../providerUpdateRecipient.service.js';
const identities=[{agency_id:2,is_active:1,from_email:'PO@itsco.health'}];
it('uses the saved agency login address when the legacy work field contains personal email',()=>{
 expect(providerUpdateWorkEmail({id:8,work_email:'personal@gmail.com',email:'aneta@itsco.health'},identities,2)).toBe('aneta@itsco.health');
 expect(providerUpdateWorkEmail({id:465,work_email:'personal@yahoo.com',email:'aunya@itsco.health'},identities,2)).toBe('aunya@itsco.health');
});
it('prefers the agency-owned personal mailbox identity over old login aliases',()=>{
 expect(providerUpdateWorkEmail({id:8,email:'old@plottwistco.com'},[...identities,{agency_id:2,is_active:1,identity_key:'personal_8',from_email:'aneta@itsco.health'}],2)).toBe('aneta@itsco.health');
});
it('never falls back to personal email, another agency or disabled identities',()=>{
 expect(providerUpdateWorkEmail({id:8,work_email:'personal@gmail.com',email:'personal@yahoo.com'},identities,2)).toBeNull();
 expect(providerUpdateWorkEmail({id:8,email:'aneta@itsco.health'},identities,6)).toBeNull();
 expect(providerUpdateWorkEmail({id:8,email:'aneta@itsco.health'},[{...identities[0],is_active:0}],2)).toBeNull();
});
