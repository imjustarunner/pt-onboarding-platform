import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/config.js',()=>({default:{nodeEnv:'development'}}));
import {requestLoggingMiddleware} from '../../middleware/requestLogging.middleware.js';
describe('SMS consent request logging',()=>{
 it.each(['/api/sms-numbers/consent-request/sign','/api/sms-numbers/agency/1/consents'])('excludes signed and manually recorded evidence from logs: %s',path=>{
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  const body={signerName:'Example Signer',phone:'3035550101',choices:{care:'yes'},token:'example-token'};
  const req={path,body,method:'POST'},next=vi.fn();
  requestLoggingMiddleware(req,{},next);
  expect(req.sanitizedBody).toBe('[PRIVATE SMS CONSENT REQUEST]');
  expect(req.body).toBe(body);expect(log).not.toHaveBeenCalled();expect(next).toHaveBeenCalledOnce();
  log.mockRestore();
 });
});
