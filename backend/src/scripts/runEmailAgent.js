import { runInboundEmailAgentOnce } from '../services/unifiedEmail/inboundEmailAgent.service.js';

async function main() {
  const maxMessages = process.env.EMAIL_AGENT_MAX_MESSAGES ? Number(process.env.EMAIL_AGENT_MAX_MESSAGES) : 10;
  const res = await runInboundEmailAgentOnce({ maxMessages });
  console.log('[EmailAgent] done:', res);
  process.exit(0);
}

main().catch((e) => {
  console.error('[EmailAgent] error:', e);
  process.exit(1);
});

