import { callGeminiText } from './geminiText.service.js';
import { getNoteAidToolById } from '../config/noteAidTools.js';
import { PROGRESS_NOTE_OUTPUT_INSTRUCTIONS } from '../config/clinicalNotePlanOutput.js';

const SUMMARY_SYSTEM = `You are a session documentation assistant. From a labeled transcript of a tutoring or clinical session, produce a detailed JSON object (no markdown fences) with:
{
  "narrative": "Detailed chronological summary of what occurred (several paragraphs; retain specifics, quotes, and sequence)",
  "topics": ["overarching topic 1", "topic 2"],
  "techniques": ["technique or intervention used", "..."],
  "keyMoments": [{"label": "short label", "detail": "what happened"}],
  "speakerNotes": "Brief note on who spoke and how labels map if Speakers were numbered"
}
Rules:
- Be specific; do not invent clinical diagnoses or facts not in the transcript.
- Prefer concrete topics and named techniques (e.g. CBT reframing, scaffolding, Socratic questioning).
- If the session is tutoring, emphasize learning goals, skills practiced, and next steps.
- If clinical, emphasize presenting concerns, interventions, client response, and plan cues.
- When transcript lines use speaker labels, attribute quotes and interventions to the correct person in the narrative.
`;

function buildSummarySystem(providerLabel, clientLabel) {
  return `${SUMMARY_SYSTEM}
- Transcript lines may use [Speaker 1], [Speaker 2], etc. from automatic voice separation on a shared microphone.
- Infer which numbered speaker is the ${providerLabel} vs the ${clientLabel} from conversational context (who asks clinical/tutoring questions, who responds, who leads the session). State that mapping clearly in speakerNotes and attribute quotes and interventions to the correct role in the narrative.`;
}

export async function summarizeSessionRecording({
  transcriptText,
  sessionKind = 'standalone',
  providerLabel = 'Provider',
  clientLabel = 'Client'
}) {
  const cleaned = String(transcriptText || '').trim().slice(0, 40000);
  if (!cleaned) {
    const err = new Error('transcriptText is required');
    err.status = 400;
    throw err;
  }
  const prompt = [
    buildSummarySystem(providerLabel, clientLabel),
    '',
    `Session kind: ${sessionKind}`,
    `Provider label: ${providerLabel}`,
    `Client/student label: ${clientLabel}`,
    '',
    'Transcript:',
    cleaned,
    '',
    'Return JSON only.'
  ].join('\n');

  const { text, modelName, latencyMs } = await callGeminiText({
    prompt,
    model: 'gemini-2.5-pro',
    temperature: 0.2,
    maxOutputTokens: 4096
  });

  let parsed = null;
  try {
    const raw = String(text || '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    parsed = {
      narrative: String(text || '').trim(),
      topics: [],
      techniques: [],
      keyMoments: []
    };
  }

  return {
    narrative: String(parsed?.narrative || '').trim(),
    topics: Array.isArray(parsed?.topics) ? parsed.topics.map((t) => String(t)).filter(Boolean) : [],
    techniques: Array.isArray(parsed?.techniques)
      ? parsed.techniques.map((t) => String(t)).filter(Boolean)
      : [],
    keyMoments: Array.isArray(parsed?.keyMoments) ? parsed.keyMoments : [],
    speakerNotes: String(parsed?.speakerNotes || '').trim(),
    modelName,
    latencyMs,
    rawText: String(text || '')
  };
}

export async function generateStructuredNoteFromSummary({
  toolId,
  summaryNarrative,
  transcriptText,
  topics = [],
  techniques = []
}) {
  const tool = getNoteAidToolById(toolId);
  if (!tool) {
    const err = new Error('No tool configured for this note type');
    err.status = 400;
    throw err;
  }

  const inputBlock = [
    'Session summary (primary source):',
    String(summaryNarrative || '').trim(),
    '',
    topics.length ? `Topics discussed: ${topics.join(', ')}` : null,
    techniques.length ? `Techniques / interventions: ${techniques.join(', ')}` : null,
    '',
    'Supporting transcript excerpt:',
    String(transcriptText || '').trim().slice(0, 20000)
  ]
    .filter((x) => x != null)
    .join('\n');

  const system = String(tool.systemPrompt || tool.prompt || tool.instructions || '').trim();
  const outputInstructions = String(tool.outputInstructions || PROGRESS_NOTE_OUTPUT_INSTRUCTIONS).trim();
  const prompt = [
    system,
    '',
    outputInstructions,
    '',
    'User input:',
    inputBlock
  ]
    .filter(Boolean)
    .join('\n');

  const { text, modelName, latencyMs } = await callGeminiText({
    prompt,
    model: 'gemini-2.5-pro',
    temperature: 0.2,
    maxOutputTokens: 4096
  });

  return {
    noteText: String(text || '').trim(),
    modelName,
    latencyMs,
    toolId: tool.id || toolId
  };
}
