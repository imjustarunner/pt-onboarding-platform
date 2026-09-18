import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({guard:vi.fn(),send:vi.fn(),rewrite:vi.fn()}));
vi.mock('../activityProtection.service.js',()=>({protectOutboundEmail:mocks.guard}));
vi.mock('../googleWorkspaceAuth.service.js',()=>({getWorkspaceClientsForEmployee:async()=>({gmail:{users:{messages:{send:mocks.send}}}}),logGoogleUnauthorizedHint:vi.fn()}));
vi.mock('../../utils/hogwartsTestEmail.js',()=>({rewriteHogwartsOutboundRecipient:mocks.rewrite}));
import Email from '../googleWorkspaceEmail.service.js';
describe('email dispatch boundary',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.rewrite.mockImplementation(async x=>x);});
 it('refuses redirected verification codes before reaching Gmail',async()=>{
  mocks.rewrite.mockImplementation(async x=>({...x,to:'testing@example.invalid'}));
  await expect(Email.sendEmail({to:'staff@school.example',subject:'Verification',text:'Code omitted',securityCode:true})).rejects.toThrow('cannot be redirected');
  expect(mocks.send).not.toHaveBeenCalled();
 });
 it('does not call Gmail after a protection denial, including a Cc/Bcc batch',async()=>{
  vi.stubEnv('GOOGLE_WORKSPACE_IMPERSONATE_USER','service@example.invalid');mocks.guard.mockRejectedValue(Object.assign(new Error('Paused'),{code:'ACTIVITY_REVIEW_REQUIRED'}));
  await expect(Email.sendEmail({to:'one@example.invalid',cc:'two@example.invalid',bcc:'hidden@example.invalid',subject:'Synthetic test',text:'Test'})).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  expect(mocks.guard).toHaveBeenCalledWith({to:'one@example.invalid',cc:'two@example.invalid',bcc:'hidden@example.invalid'});expect(mocks.send).not.toHaveBeenCalled();
 });
});
