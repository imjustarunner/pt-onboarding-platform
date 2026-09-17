import test from 'node:test';
import assert from 'node:assert/strict';
import {isDirectoryProvider} from '../providerDirectoryEligibility.js';
import {publicAcceptance} from '../publicProviderPresentation.js';
test('admins, supervisors and providers appear without school or online booking enrollment',()=>{
 for(const role of ['admin','super_admin','supervisor','provider','provider_plus','intern','facilitator']) {
  assert.equal(isDirectoryProvider({role}),true,role);
  assert.equal(isDirectoryProvider({role,sees_clients:0},{assigned:true,enrolled:true}),false,role);
 }
 assert.equal(isDirectoryProvider({role:'staff'}),false);
 assert.equal(isDirectoryProvider({role:'staff',has_provider_access:1}),true);
});
test('closed providers stay listed but stale manual or schedule openings cannot reopen global availability',()=>{
 assert.equal(isDirectoryProvider({role:'supervisor',sees_clients:1,provider_accepting_new_clients:0}),true);
 for(const manual of ['auto','accepting','waitlist']) assert.equal(publicAcceptance({globalAccepting:false,manual,hasOpenings:true}).status,'waitlist');
});
