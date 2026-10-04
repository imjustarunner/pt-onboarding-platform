import crypto from 'node:crypto';
import { appendSecurityEvidence } from './securityEvidence.service.js';
import { networkEvidence, sessionReference } from '../utils/securityEvidence.js';

// IDs and fixed action names only. Never copy names, tokens, URLs, or clinical payloads.
export async function clinicalAudit(context, action, details = {}, db) {
  const req = context.req;
  const event = {
    requestId: req?.evidenceContext?.requestId || crypto.randomUUID(), phase: 'clinical',
    method: req?.method || 'SYSTEM', route: '/clinical-session',
    ...(req ? networkEvidence(req) : { clientIp: null, ipSource: 'system', peerIp: null }),
    userId: req?.user?.id || null, role: context.role || 'system',
    sessionRef: sessionReference(req?.user?.sessionId), action, outcome: 'succeeded',
    details: { kind: context.kind, sessionId: context.sessionId, generation: context.generation || 0,
      agencyId: context.agencyId, actor: context.actor || null, ...details }
  };
  await appendSecurityEvidence(event, db, { mirror: !db });
}
