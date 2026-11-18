import ClientNotes from '../models/ClientNotes.model.js';
import { callPrivateSessionText } from './sessionAiPrivacy.service.js';
import { intakeAssessmentResponses } from './intakeAssessmentResponses.service.js';
import { clinicalRowsFromCompletedIntake } from './intakeClinicalSourcePresentation.js';
import { buildCompletedIntakeRecord } from './completedIntakeRecord.service.js';


export async function persistIntakeClinicianSummaries({
  agency,
  link,
  submission,
  signedDocuments = [],
  clientIds = []
} = {}) {
  const ids = [...new Set((clientIds || []).map((id) => Number(id)).filter(Boolean))];
  if (!ids.length) return;
  const spec = buildCompletedIntakeRecord({ agency, link, submission, signedDocuments });
  const rows = clinicalRowsFromCompletedIntake(spec), screens = intakeAssessmentResponses(submission?.intake_data || {}, link);
  if (!rows.length && !screens.length) return;
  const answers = JSON.stringify({ enrollmentAnswers: rows, screeningResponses: screens });
  let summary = '';
  try {
    if (answers.length > 120000) throw new Error('Enrollment briefing requires source review.');
    const result = await callPrivateSessionText({
      temperature: 0.2,
      maxOutputTokens: 700,
      prompt: [
        'You are writing an internal clinician briefing from a completed counseling intake.',
        'Summarize presenting concerns, relevant history, safety flags, and what the family wants from care.',
        'Do not invent facts. Do not include passwords or card numbers. Use short paragraphs and bullets.',
        'This note is for treating clinicians only.',
        '',
        answers
      ].join('\n')
    });
    summary = String(result?.text || result || '').trim();
  } catch (err) {
    console.warn('[intakeClinicianSummary] Secure AI summary unavailable; retaining enrollment for clinician review.');
  }
  if (!summary) {
    summary = `Intake received (submission ${submission?.id || ''}). Review the completed packet for answers, signatures, and agreements.`;
  }
  const message = `AI intake summary for clinicians\n\n${summary}`;
  for (const clientId of ids) {
    try {
      await ClientNotes.create(
        {
          client_id: clientId,
          author_id: null,
          message,
          is_internal_only: true,
          category: 'clinical',
          urgency: 'medium'
        },
        { hasAgencyAccess: true, canViewInternalNotes: true }
      );
    } catch (err) {
      console.warn('[intakeClinicianSummary] note save failed', { clientId, error: err?.message || err });
    }
  }
}
