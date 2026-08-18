import { callGeminiText } from './geminiText.service.js';

const SUMMARY_SYSTEM = `You are a session documentation assistant. From a labeled transcript, produce compact JSON (no markdown fences):
{
  "summary": "3-6 sentences covering what happened this session. No play-by-play.",
  "topics": ["short topic", "short topic"],
  "techniques": ["technique used"],
  "subjective": "Brief client report / presenting concerns",
  "objective": "Brief observed presentation and session process",
  "interventions": "What the clinician/tutor did",
  "plan": "Next steps"
}
Rules:
- Keep every field short. Do not write a full chronological recap.
- Do not invent diagnoses or facts not in the transcript.
- Transcript lines may use [Speaker 1] / [Speaker 2]. Infer who is the provider vs participant from context.
- If only one person is speaking, still fill the clinical sections from the content.
`;

export async function summarizeSessionRecording({
  transcriptText,
  sessionKind = 'standalone',
  providerLabel = 'Provider',
  clientLabel = 'Client'
}) {
  const cleaned = String(transcriptText || '').trim().slice(0, 24000);
  if (!cleaned) {
    const err = new Error('transcriptText is required');
    err.status = 400;
    throw err;
  }
  const prompt = [
    SUMMARY_SYSTEM,
    '',
    `Session kind: ${sessionKind}`,
    `Provider role: ${providerLabel}`,
    `Client/student role: ${clientLabel}`,
    '',
    'Transcript:',
    cleaned,
    '',
    'Return JSON only.'
  ].join('\n');

  const { text, modelName, latencyMs } = await callGeminiText({
    prompt,
    model: 'gemini-2.5-flash',
    temperature: 0.2,
    maxOutputTokens: 1200
  });

  let parsed = null;
  try {
    const raw = String(text || '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    parsed = { summary: String(text || '').trim() };
  }

  const summary = String(parsed?.summary || parsed?.narrative || '').trim();
  const topics = Array.isArray(parsed?.topics) ? parsed.topics.map((t) => String(t)).filter(Boolean) : [];
  const techniques = Array.isArray(parsed?.techniques)
    ? parsed.techniques.map((t) => String(t)).filter(Boolean)
    : [];

  return {
    summary,
    narrative: summary,
    topics,
    techniques,
    subjective: String(parsed?.subjective || '').trim(),
    objective: String(parsed?.objective || '').trim(),
    interventions: String(parsed?.interventions || '').trim(),
    plan: String(parsed?.plan || '').trim(),
    speakerNotes: String(parsed?.speakerNotes || '').trim(),
    modelName,
    latencyMs,
    rawText: String(text || '')
  };
}

export function sessionSummaryToNoteOutput({ summary, existing, initials = null } = {}) {
  const sections = {};
  if (summary?.summary) sections.Summary = summary.summary;
  if (summary?.subjective) sections.Subjective = summary.subjective;
  if (summary?.objective) sections.Objective = summary.objective;
  if (summary?.interventions) sections.Interventions = summary.interventions;
  if (summary?.plan) sections.Plan = summary.plan;
  if (summary?.topics?.length) sections.Topics = summary.topics.join('\n');
  if (summary?.techniques?.length) sections.Techniques = summary.techniques.join('\n');
  if (!Object.keys(sections).length && summary?.narrative) {
    sections.Summary = summary.narrative;
  }
  return {
    sections,
    meta: {
      toolId: existing?.tool_id || 'session_recording',
      model: summary?.modelName || null,
      source: 'session_recording',
      sessionRecordingId: existing?.id || null,
      dateOfService: existing?.date_of_service || null,
      initials,
      serviceCode: existing?.service_code || null
    }
  };
}
