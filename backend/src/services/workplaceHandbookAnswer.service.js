import { recordDocumentQuestion } from './documentAnalytics.service.js';
import { getPublishedHandbook } from './workplaceHandbook.service.js';
import { answerFromHandbook, validateHandbookQuestion } from './workplaceHandbookAssistant.service.js';

// Authorization belongs to each entry point. Never use client-supplied sections,
// draft IDs or prior assistant answers as handbook authority.
export async function answerPublishedHandbook(agencyId, input, userId = null, surface = 'handbook') {
  const question = validateHandbookQuestion(input);
  const handbook = await getPublishedHandbook(agencyId);
  if (input.expectedVersionId != null && Number(input.expectedVersionId) !== Number(handbook.version?.id)) {
    throw Object.assign(new Error('The handbook has changed. Reload it before asking another question.'), { status: 409 });
  }
  let status = 'error';
  try {
    const answer = await answerFromHandbook({ handbook, ...question });
    if (handbook.version?.id) {
      const latest = await getPublishedHandbook(agencyId);
      if (Number(latest.version?.id) !== Number(handbook.version.id)) throw Object.assign(new Error('The handbook changed while the answer was being prepared. Reload it and ask again.'), { status: 409 });
    }
    status = answer.status; return answer;
  } finally { await recordDocumentQuestion({ agencyId, userId, documentKey: 'workplace-handbook', versionId: handbook.version?.id, question: question.question, status, surface }); }
}
