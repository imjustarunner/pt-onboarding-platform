import { expect, it, vi } from 'vitest';
import { requestLoggingMiddleware, safeLogRequestBody } from '../requestLogging.middleware.js';
import { redactPrivateBillingUrl } from '../../utils/sanitizeRequest.js';
it.each(['/api/secure-session-comments/appointments/101','/api/quick-view/secure-session-comments/appointments/101','/api/messages/hub/send','/api/chat/threads/10/messages','/api/guardian-portal/messages/10','/api/dependent-portal/messages/10','/api/quick-view/messages/chat/10'])('never logs a comment or query for %s',path=>{
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  const req={path,method:'POST',body:{body:'PRIVATE_COMMENT',recipientUserIds:[2]},query:{body:'PRIVATE_QUERY'}};
  const next=vi.fn();requestLoggingMiddleware(req,{},next);safeLogRequestBody(req,'secure-comment');
  expect(next).toHaveBeenCalledOnce();expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_');
  expect(redactPrivateBillingUrl(`${path}?body=PRIVATE_QUERY`)).toBe(`${path}?[REDACTED]`);log.mockRestore();
});
