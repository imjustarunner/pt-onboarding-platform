/**
 * Momentum Chat service: gathers user context and calls Gemini for focus recommendations.
 */
import { callGeminiText } from './geminiText.service.js';
import UserChecklistAssignment from '../models/UserChecklistAssignment.model.js';
import Task from '../models/Task.model.js';
import MomentumSticky from '../models/MomentumSticky.model.js';
import pool from '../config/database.js';

function flattenChecklistItems(data) {
  const out = [];
  for (const item of data.trainingItems || []) {
    out.push(item.title);
  }
  for (const item of data.documentItems || []) {
    out.push(item.title);
  }
  for (const item of data.customItems || []) {
    if (!item.is_completed) out.push(item.title);
  }
  for (const focus of data.trainingFocusesWithItems || []) {
    for (const mod of focus.modules || []) {
      for (const item of mod.checklistItems || []) {
        if (!item.is_completed) out.push(item.title);
      }
    }
  }
  return out;
}

function flattenUndoneStickyEntries(stickies) {
  const out = [];
  for (const sticky of stickies || []) {
    for (const entry of sticky.entries || []) {
      if (!entry.is_checked) {
        const text = String(entry.text || '').trim();
        if (text) out.push(text);
      }
    }
  }
  return out;
}

export async function gatherMomentumContext(userId, { agencyId = null, programId = null } = {}) {
  const [checklist, tasks, stickies] = await Promise.all([
    UserChecklistAssignment.getUnifiedChecklist(userId, { agencyId, programId }).catch(() => ({})),
    Task.findByUser(userId).catch(() => []),
    MomentumSticky.listByUserId(userId).catch(() => [])
  ]);

  const [ticketRows] = await pool.execute(
    `SELECT id, subject, status, question
     FROM support_tickets
     WHERE created_by_user_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId]
  ).catch(() => [[]]);

  const checklistItems = flattenChecklistItems(checklist);
  const openTasks = (tasks || []).filter(
    (t) => t.status !== 'completed' && t.status !== 'overridden'
  );
  const openTickets = (ticketRows || []).filter(
    (t) => String(t?.status || '').toLowerCase() === 'open'
  );
  const undoneStickies = flattenUndoneStickyEntries(stickies);

  return {
    checklistItems,
    tasks: openTasks.map((t) => ({
      id: t.id,
      title: t.title || t.task,
      status: t.status,
      task_type: t.task_type
    })),
    tickets: openTickets.map((t) => ({ subject: t.subject || t.question?.slice(0, 80), status: t.status })),
    undoneStickies
  };
}

function parseListFromResponse(text) {
  const raw = String(text || '');
  const lines = raw
    .split(/\n/)
    .map((l) => l.replace(/^[\d\-*•]\s*\.?\s*/, '').trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !l.startsWith('TASK:') &&
        !l.startsWith('UPDATE_TASK:') &&
        !l.startsWith('DELETE_TASK:')
    );
  return lines.slice(0, 10);
}

function parseSuggestedTasksFromResponse(text) {
  const raw = String(text || '');
  const tasks = [];
  for (const line of raw.split(/\n/)) {
    const m = line.match(/^TASK:\s*(.+)$/i);
    if (m) {
      const title = String(m[1] || '').trim();
      if (title) tasks.push({ title });
    }
  }
  return tasks.slice(0, 5);
}

function parseSuggestedUpdatesFromResponse(text) {
  const raw = String(text || '');
  const updates = [];
  for (const line of raw.split(/\n/)) {
    const m = line.match(/^UPDATE_TASK:\s*(\d+)\s*\|\s*(.+)$/i);
    if (m) {
      const taskId = parseInt(m[1], 10);
      const title = String(m[2] || '').trim();
      if (taskId && title) updates.push({ taskId, title });
    }
  }
  return updates.slice(0, 5);
}

function parseSuggestedDeletesFromResponse(text) {
  const raw = String(text || '');
  const deletes = [];
  for (const line of raw.split(/\n/)) {
    const m = line.match(/^DELETE_TASK:\s*(\d+)\s*$/i);
    if (m) {
      const taskId = parseInt(m[1], 10);
      if (taskId) deletes.push({ taskId });
    }
  }
  return deletes.slice(0, 5);
}

export async function getFocusRecommendations(userId, userMessage, contextOptions = {}) {
  const context = await gatherMomentumContext(userId, contextOptions);

  const hour = new Date().getHours();
  const focusLabel = hour >= 18 ? 'tomorrow' : 'today';

  const systemPrompt = `You are an ADHD-friendly focus assistant. The user is asking what they should focus on.

Given their current context below, provide a short, prioritized list of 3-5 actionable focus items for ${focusLabel}.
Be direct and practical. Use short phrases (e.g. "Complete training module X", "Sign document Y").
Do not add preamble or explanation—just the numbered list.
If they have little on their plate, suggest 1-2 items and one gentle reminder like "Take a short break" or "Review your calendar."

TASK CREATION: If the user explicitly asks to add, create, or record a task (e.g. "add task: Call parent"), include:
TASK: <task title>

TASK UPDATE: If the user asks to change, edit, or update an existing task, include (only for custom tasks from the TASKS list):
UPDATE_TASK: <taskId>|<new title>

TASK DELETE: If the user asks to remove, delete, or cancel an existing task, include (only for custom tasks):
DELETE_TASK: <taskId>

Use the exact task IDs from the TASKS list. One action per line. Otherwise omit these lines.`;

  const tasksWithId = context.tasks
    .filter((t) => t.task_type === 'custom')
    .map((t) => `${t.id}|${t.title}`)
    .join('; ');
  const contextBlock = `
CHECKLIST (incomplete): ${context.checklistItems.join('; ') || 'None'}
TASKS (open, id|title for custom only): ${tasksWithId || 'None'}
ALL TASKS (open): ${context.tasks.map((t) => t.title).join('; ') || 'None'}
TICKETS (open): ${context.tickets.map((t) => t.subject).join('; ') || 'None'}
UNDONE NOTES (stickies): ${context.undoneStickies.join('; ') || 'None'}
`;

  const prompt = `${systemPrompt}

USER CONTEXT:
${contextBlock}

USER MESSAGE: ${userMessage || 'What should I focus on now?'}

Respond with ONLY a numbered list (1. 2. 3. ...), no other text.`;

  const { text } = await callGeminiText({
    prompt,
    temperature: 0.3,
    maxOutputTokens: 400
  });

  const items = parseListFromResponse(text);
  const suggestedTasks = parseSuggestedTasksFromResponse(text);
  const suggestedUpdates = parseSuggestedUpdatesFromResponse(text);
  const suggestedDeletes = parseSuggestedDeletesFromResponse(text);
  return { items, suggestedTasks, suggestedUpdates, suggestedDeletes, rawText: text };
}

/**
 * Generate a Gemini-powered digest: prioritized Top 3 + Also on radar.
 * Replaces rule-based ordering with AI prioritization.
 */
export async function generateDigest(userId, contextOptions = {}) {
  const context = await gatherMomentumContext(userId, contextOptions);

  const hour = new Date().getHours();
  const focusLabel = hour >= 18 ? 'tomorrow' : 'today';

  const payrollNotesCount = contextOptions.payrollNotesCount ?? 0;
  const notesToSignCount = contextOptions.notesToSignCount ?? 0;
  const delinquencyScore = contextOptions.delinquencyScore ?? 0;
  const escalateNotes = delinquencyScore >= 2 && payrollNotesCount > 0;
  const payrollHint =
    payrollNotesCount > 0
      ? escalateNotes
        ? `ESCALATION: User has delinquency score >= 2. Clinical notes MUST be #1. Add prompt: "Did you do your notes today?"`
        : `COMPLIANCE: User has ${payrollNotesCount} unpaid clinical notes - these MUST be in the top 3.`
      : '';
  const notesToSignHint =
    notesToSignCount > 0
      ? `SUPERVISOR: User has ${notesToSignCount} supervisee notes awaiting their sign-off - include "Sign supervisee notes (N pending)" in top 3.`
      : '';

  const systemPrompt = `You are an ADHD-friendly focus assistant generating a daily digest.

Given the user's context below, produce a prioritized list for ${focusLabel}.

PRIORITY ORDER (strict): 1) Compliance & safety (clinical notes, payroll) 2) Notes to sign (supervisor) 3) Overdue tasks 4) Client-blocking 5) High priority 6) Assigned tickets 7) Checklist items 8) Undone sticky notes.

${payrollHint}
${notesToSignHint}

Output format - ONLY these lines, nothing else:
TOP: <item 1>
TOP: <item 2>
TOP: <item 3>
RADAR: <item 4>
RADAR: <item 5>
(up to 3 TOP, up to 5 RADAR; use short actionable phrases)`;

  const contextBlock = `
CHECKLIST (incomplete): ${context.checklistItems.join('; ') || 'None'}
TASKS (open): ${context.tasks.map((t) => t.title).join('; ') || 'None'}
TICKETS (open): ${context.tickets.map((t) => t.subject).join('; ') || 'None'}
UNDONE NOTES (stickies): ${context.undoneStickies.join('; ') || 'None'}
`;

  const prompt = `${systemPrompt}

USER CONTEXT:
${contextBlock}

Generate the digest.`;

  const { text } = await callGeminiText({
    prompt,
    temperature: 0.2,
    maxOutputTokens: 300
  });

  const top = [];
  const radar = [];
  for (const line of String(text || '').split(/\n/)) {
    const t = line.trim();
    const topM = t.match(/^TOP:\s*(.+)$/i);
    const radM = t.match(/^RADAR:\s*(.+)$/i);
    if (topM) top.push({ label: topM[1].trim(), source: 'gemini' });
    if (radM) radar.push({ label: radM[1].trim(), source: 'gemini' });
  }
  return { topFocus: top.slice(0, 3), alsoOnRadar: radar.slice(0, 5) };
}
