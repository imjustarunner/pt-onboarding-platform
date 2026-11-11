import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../config/config.js',()=>({default:{nodeEnv:'development'}}));
import {requestLoggingMiddleware,safeLogRequestBody} from '../requestLogging.middleware.js';
import {redactPrivateBillingUrl} from '../../utils/sanitizeRequest.js';
beforeEach(()=>vi.restoreAllMocks());
describe('private address request logging',()=>{
 it.each(['/api/address-lookup/suggest','/api/address-lookup/select','/api/address-lookup/context/suggest','/api/address-lookup/intake/private-form-key/select','/api/family/address-lookup/suggest','/family/address-lookup/select'])('excludes address body, query, params and tokens from development logs (%s)',path=>{
  const log=vi.spyOn(console,'log').mockImplementation(()=>{}),next=vi.fn(),req={path,method:'POST',body:{query:'Private home address',publicContext:{token:'private-context-token'},selectionToken:'private-selection'},query:{unexpected:'private'},params:{publicKey:'private-form-key'}};
  requestLoggingMiddleware(req,{},next);expect(req.sanitizedBody).toBe('[PRIVATE ADDRESS LOOKUP]');expect(next).toHaveBeenCalledOnce();expect(log).not.toHaveBeenCalled();safeLogRequestBody(req,'address');expect(JSON.stringify(log.mock.calls)).not.toMatch(/Private home address|private-context-token|private-selection|private-form-key/);
 });
 it.each([
  ['/api/address-lookup/intake/private-form-key/suggest','/api/address-lookup/intake/[REDACTED]/suggest'],
  ['/api/address-lookup/intake/private-form-key/select?query=private-address','/api/address-lookup/intake/[REDACTED]/select?[REDACTED]'],
  ['/api/address-lookup/context/select?token=private-context-token','/api/address-lookup/context/select?[REDACTED]'],
  ['/api/family/address-lookup/suggest?address=private-address#secret','/api/family/address-lookup/suggest?[REDACTED]'],
  ['https://app.example/api/address-lookup/intake/private-key/suggest','https://app.example/api/address-lookup/intake/[REDACTED]/suggest']
 ])('redacts capabilities and query details in timing/security URLs (%s)',(source,expected)=>expect(redactPrivateBillingUrl(source)).toBe(expected));
 it('retains pre-existing billing/feed privacy without dropping ordinary diagnostic URLs',()=>{
  expect(redactPrivateBillingUrl('/api/family-billing/task-link/private-token?download=1')).toBe('/api/family-billing/task-link/[REDACTED]?download=1');expect(redactPrivateBillingUrl('/api/calendar-sharing/feed/private-token.ics')).toBe('/api/calendar-sharing/feed/[REDACTED]');expect(redactPrivateBillingUrl('/api/clients?agencyId=450')).toBe('/api/clients?agencyId=450');
 });
});
