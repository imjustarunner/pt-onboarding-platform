import ClientNotes from '../models/ClientNotes.model.js';
import { callGeminiText } from './geminiText.service.js';
import { buildCompletedIntakeRecord } from './completedIntakeRecord.service.js';

function flattenRecord(spec) {
  const lines = [];
  for (const section of spec?.sections || []) {
    lines.push(`## ${section.title}`);
    for (const row of section.rows || []) {
      lines.push(`- ${row.label}: ${row.value}`);
    }
  }
  return lines.join('\n').slice(0, 12000);
}

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
  const answers = flattenRecord(spec);
  if (!answers.trim()) return;
  let summary = '';
  try {
    const result = await callGeminiText({
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
    console.warn('[intakeClinicianSummary] AI summary failed', err?.message || err);
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
