/**
 * Interview transcript intelligence — summary, action items, and quoted artifacts
 * (pay rates, hours/days, agreements) for hiring interviews.
 */

import { callGeminiText } from './geminiText.service.js';
import HiringInterview from '../models/HiringInterview.model.js';
import HiringInterviewArtifact from '../models/HiringInterviewArtifact.model.js';
import ProviderScheduleEventArtifact from '../models/ProviderScheduleEventArtifact.model.js';
import User from '../models/User.model.js';

function stripCodeFences(s) {
  const t = String(s || '').trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return m?.[1] ? m[1].trim() : t;
}

function extractJsonFromModelText(text) {
  const raw = stripCodeFences(text);
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  return raw;
}

function tryParseJson(text) {
  try {
    return JSON.parse(extractJsonFromModelText(text));
  } catch {
    return null;
  }
}

function slugId(prefix, idx) {
  return `${prefix}_${idx + 1}`;
}

function normalizeActionItems(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, idx) => {
      if (typeof item === 'string') {
        const text = item.trim();
        return text ? { id: slugId('ai', idx), text, done: false, assigneeName: null } : null;
      }
      if (!item || typeof item !== 'object') return null;
      const text = String(item.text || item.action || item.description || '').trim();
      if (!text) return null;
      return {
        id: String(item.id || slugId('ai', idx)),
        text,
        done: !!item.done,
        assigneeName: String(item.assigneeName || item.assignee || item.owner || '').trim() || null,
        dueHint: String(item.dueHint || item.due || '').trim() || null
      };
    })
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeQuoteRows(raw = [], defaultTopic = '') {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (typeof row === 'string') {
        const quote = row.trim();
        return quote ? { speaker: 'Unknown', topic: defaultTopic, quote } : null;
      }
      if (!row || typeof row !== 'object') return null;
      const quote = String(row.quote || row.text || row.statement || '').trim();
      if (!quote) return null;
      return {
        speaker: String(row.speaker || row.who || row.name || 'Unknown').trim(),
        topic: String(row.topic || row.subject || defaultTopic || 'General').trim(),
        detail: String(row.detail || row.amount || row.value || row.hours || '').trim() || null,
        quote
      };
    })
    .filter(Boolean)
    .slice(0, 40);
}

function buildInterviewIntelligencePrompt({ transcriptText, candidateName, interviewerNames = [] }) {
  const cleaned = String(transcriptText || '').trim().slice(0, 18000);
  const interviewerList = interviewerNames.filter(Boolean).join(', ') || 'Interviewers';
  return [
    'You are generating structured hiring interview documentation for People Operations.',
    'Analyze the transcript and return ONLY valid JSON (no markdown fences) with this shape:',
    '{',
    '  "briefSummary": "2-4 sentence overview of the interview",',
    '  "actionItems": [',
    '    { "text": "specific follow-up", "assigneeName": "who owns it", "dueHint": "optional timing" }',
    '  ],',
    '  "compensationMentions": [',
    '    { "speaker": "name/role", "topic": "pay rate|salary|bonus|etc", "detail": "$ amount or rate", "quote": "exact words from transcript" }',
    '  ],',
    '  "scheduleMentions": [',
    '    { "speaker": "name/role", "topic": "hours|days|start date|availability", "detail": "normalized detail", "quote": "exact words from transcript" }',
    '  ],',
    '  "agreementsAndQuotes": [',
    '    { "speaker": "name/role", "topic": "what was agreed or stated", "quote": "exact words from transcript" }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Be factual. Do not invent details not present in the transcript.',
    '- For compensationMentions: capture ANY dollar amounts, hourly rates, salary figures, pay ranges, bonuses, stipends — who said it and the exact quote.',
    '- For scheduleMentions: capture ANY hours per week, full-time/part-time, days available, start dates, shift times — who said it and the exact quote.',
    '- For agreementsAndQuotes: capture explicit agreements, commitments, conditions, or important statements — especially employment terms, pay, and schedule — as direct quotes with speaker attribution.',
    '- Use speaker labels from the transcript when present (e.g. [Interviewer Name], [Candidate]).',
    '- If a section has nothing in the transcript, use an empty array [].',
    '- actionItems should include follow-ups for PO/HR (reference checks, background check, send offer, etc.) when mentioned.',
    '',
    `Candidate: ${candidateName || 'Candidate'}`,
    `Interviewers: ${interviewerList}`,
    '',
    'Transcript:',
    cleaned
  ].join('\n');
}

export function formatInterviewIntelligenceMarkdown(intelligence) {
  if (!intelligence || typeof intelligence !== 'object') return '';
  const lines = [];

  const brief = String(intelligence.briefSummary || '').trim();
  if (brief) {
    lines.push('## Brief summary', '', brief, '');
  }

  const actions = normalizeActionItems(intelligence.actionItems);
  lines.push('## Action items');
  if (actions.length) {
    actions.forEach((a) => {
      const owner = a.assigneeName ? ` (${a.assigneeName})` : '';
      const due = a.dueHint ? ` — ${a.dueHint}` : '';
      lines.push(`- ${a.text}${owner}${due}`);
    });
  } else {
    lines.push('- None identified');
  }
  lines.push('');

  const pay = normalizeQuoteRows(intelligence.compensationMentions, 'Compensation');
  lines.push('## Compensation & pay (direct quotes)');
  if (pay.length) {
    pay.forEach((row) => {
      const detail = row.detail ? ` — ${row.detail}` : '';
      lines.push(`- **${row.speaker}** (${row.topic})${detail}: "${row.quote}"`);
    });
  } else {
    lines.push('- Not discussed');
  }
  lines.push('');

  const schedule = normalizeQuoteRows(intelligence.scheduleMentions, 'Schedule');
  lines.push('## Hours, days & schedule (direct quotes)');
  if (schedule.length) {
    schedule.forEach((row) => {
      const detail = row.detail ? ` — ${row.detail}` : '';
      lines.push(`- **${row.speaker}** (${row.topic})${detail}: "${row.quote}"`);
    });
  } else {
    lines.push('- Not discussed');
  }
  lines.push('');

  const quotes = normalizeQuoteRows(intelligence.agreementsAndQuotes, 'Agreement');
  lines.push('## Agreements & quoted statements');
  if (quotes.length) {
    quotes.forEach((row) => {
      lines.push(`- **${row.speaker}** (${row.topic}): "${row.quote}"`);
    });
  } else {
    lines.push('- None identified');
  }

  return lines.join('\n').trim();
}

/**
 * Generate interview intelligence from transcript text.
 */
export async function generateInterviewIntelligenceFromTranscript({
  transcriptText,
  candidateName = '',
  interviewerNames = []
} = {}) {
  const cleaned = String(transcriptText || '').trim();
  if (!cleaned) return { ok: false, reason: 'empty_transcript' };

  const prompt = buildInterviewIntelligencePrompt({ transcriptText: cleaned, candidateName, interviewerNames });
  const resp = await callGeminiText({
    prompt,
    temperature: 0.1,
    maxOutputTokens: 2500
  });

  const parsed = tryParseJson(resp?.text || '');
  if (!parsed) {
    const fallbackSummary = String(resp?.text || '').trim().slice(0, 8000);
    return {
      ok: true,
      intelligence: { briefSummary: fallbackSummary, actionItems: [], compensationMentions: [], scheduleMentions: [], agreementsAndQuotes: [] },
      actionItems: [],
      summaryMarkdown: fallbackSummary,
      modelName: resp?.modelName || null
    };
  }

  const intelligence = {
    briefSummary: String(parsed.briefSummary || parsed.summary || '').trim(),
    actionItems: parsed.actionItems || [],
    compensationMentions: parsed.compensationMentions || parsed.compensation || [],
    scheduleMentions: parsed.scheduleMentions || parsed.schedule || [],
    agreementsAndQuotes: parsed.agreementsAndQuotes || parsed.quotes || parsed.agreements || []
  };

  const actionItems = normalizeActionItems(intelligence.actionItems);
  const summaryMarkdown = formatInterviewIntelligenceMarkdown(intelligence);

  return {
    ok: true,
    intelligence,
    actionItems,
    summaryMarkdown,
    modelName: resp?.modelName || null
  };
}

async function resolveInterviewContext(interview) {
  const candidate = interview?.candidate_user_id
    ? await User.findById(interview.candidate_user_id)
    : null;
  const candidateName = candidate
    ? `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim()
    : 'Candidate';

  let interviewerNames = [];
  try {
    const raw = interview?.interviewer_user_ids_json;
    const ids = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
    if (Array.isArray(ids) && ids.length) {
      const names = await Promise.all(
        ids.slice(0, 8).map(async (uid) => {
          const u = await User.findById(uid);
          return u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : null;
        })
      );
      interviewerNames = names.filter(Boolean);
    }
  } catch {
    interviewerNames = [];
  }

  return { candidateName, interviewerNames };
}

/**
 * Pull transcript from schedule event, generate intelligence, persist on hiring interview artifact.
 */
export async function syncInterviewIntelligenceFromEventId(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return { ok: false, reason: 'invalid_event' };

  const interview = await HiringInterview.findByScheduleEventId(eid);
  if (!interview?.id) return { ok: false, reason: 'not_interview' };

  const meetingArtifact = await ProviderScheduleEventArtifact.findByEventId(eid);
  const transcriptText = String(meetingArtifact?.transcript_text || '').trim();
  if (!transcriptText) return { ok: false, reason: 'no_transcript' };

  const { candidateName, interviewerNames } = await resolveInterviewContext(interview);
  const result = await generateInterviewIntelligenceFromTranscript({
    transcriptText,
    candidateName,
    interviewerNames
  });

  if (!result.ok) return result;

  const artifact = await HiringInterviewArtifact.upsertByInterviewId(interview.id, {
    transcriptSummary: result.summaryMarkdown,
    actionItemsJson: result.actionItems
  });

  // Also store interview-formatted summary on the meeting artifact for live notes panel.
  try {
    await ProviderScheduleEventArtifact.upsertByEventId({
      eventId: eid,
      summaryText: result.summaryMarkdown,
      summaryModel: result.modelName,
      summaryGeneratedAt: new Date(),
      updatedByUserId: null
    });
  } catch (err) {
    console.warn('[syncInterviewIntelligence] meeting summary upsert failed:', err?.message);
  }

  return { ok: true, interviewId: interview.id, artifact, actionItems: result.actionItems };
}

/**
 * Generate from transcript for a known interview id (finalize path).
 */
export async function syncInterviewIntelligenceFromInterviewId(interviewId, { transcriptText = null } = {}) {
  const id = Number(interviewId || 0);
  if (!id) return { ok: false, reason: 'invalid_interview' };

  const interview = await HiringInterview.findById(id);
  if (!interview) return { ok: false, reason: 'interview_not_found' };

  let text = String(transcriptText || '').trim();
  if (!text && interview.provider_schedule_event_id) {
    const meetingArtifact = await ProviderScheduleEventArtifact.findByEventId(interview.provider_schedule_event_id);
    text = String(meetingArtifact?.transcript_text || '').trim();
  }
  if (!text) return { ok: false, reason: 'no_transcript' };

  const { candidateName, interviewerNames } = await resolveInterviewContext(interview);
  const result = await generateInterviewIntelligenceFromTranscript({
    transcriptText: text,
    candidateName,
    interviewerNames
  });

  if (!result.ok) return result;

  const artifact = await HiringInterviewArtifact.upsertByInterviewId(id, {
    transcriptSummary: result.summaryMarkdown,
    actionItemsJson: result.actionItems
  });

  if (interview.provider_schedule_event_id) {
    try {
      await ProviderScheduleEventArtifact.upsertByEventId({
        eventId: interview.provider_schedule_event_id,
        summaryText: result.summaryMarkdown,
        summaryModel: result.modelName,
        summaryGeneratedAt: new Date(),
        updatedByUserId: null
      });
    } catch (err) {
      console.warn('[syncInterviewIntelligence] meeting summary upsert failed:', err?.message);
    }
  }

  return { ok: true, artifact, actionItems: result.actionItems, summaryMarkdown: result.summaryMarkdown };
}

export default {
  generateInterviewIntelligenceFromTranscript,
  syncInterviewIntelligenceFromEventId,
  syncInterviewIntelligenceFromInterviewId,
  formatInterviewIntelligenceMarkdown
};
