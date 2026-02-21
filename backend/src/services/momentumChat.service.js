/**
 * Momentum Chat service: gathers user context and calls Gemini for focus recommendations.
 */
import { callGeminiText } from './geminiText.service.js';
import UserChecklistAssignment from '../models/UserChecklistAssignment.model.js';
import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import TaskList from '../models/TaskList.model.js';
import TaskListMember from '../models/TaskListMember.model.js';
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

  const sharedLists = agencyId
    ? (await TaskList.listByUserMembership(userId, { agencyId }).catch(() => [])).map((l) => ({
        id: l.id,
        name: l.name,
        my_role: l.my_role
      }))
    : [];

  return {
    checklistItems,
    tasks: openTasks.map((t) => ({
      id: t.id,
      title: t.title || t.task,
      status: t.status,
      task_type: t.task_type
    })),
    tickets: openTickets.map((t) => ({ subject: t.subject || t.question?.slice(0, 80), status: t.status })),
    undoneStickies,
    sharedLists
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
        !l.startsWith('DELETE_TASK:') &&
        !l.startsWith('ADD_TO_LIST:')
    );
  return lines.slice(0, 10);
}

function parseAddToListFromResponse(text) {
  const raw = String(text || '');
  const entries = [];
  for (const line of raw.split(/\n/)) {
    const m = line.match(/^ADD_TO_LIST:\s*(.+)$/i);
    if (m) {
      const rest = String(m[1] || '').trim();
      const parts = rest.split('|').map((p) => String(p || '').trim());
      const listName = parts[0] || '';
      const assignee = parts[1] || null;
      const title = parts[2] || '';
      const urgency = ['low', 'medium', 'high'].includes(parts[3]?.toLowerCase())
        ? parts[3].toLowerCase()
        : 'medium';
      const dueDate = parts[4] && /^\d{4}-\d{2}-\d{2}$/.test(parts[4]) ? parts[4] : null;
      if (listName && title) entries.push({ listName, assignee, title, urgency, dueDate });
    }
  }
  return entries.slice(0, 5);
}

function parseSuggestedTasksFromResponse(text) {
  const raw = String(text || '');
  const tasks = [];
  for (const line of raw.split(/\n/)) {
    const m = line.match(/^TASK:\s*(.+)$/i);
    if (m) {
      const rest = String(m[1] || '').trim();
      const parts = rest.split('|').map((p) => String(p || '').trim());
      const title = parts[0] || '';
      const urgency = ['low', 'medium', 'high'].includes(parts[1]?.toLowerCase())
        ? parts[1].toLowerCase()
        : null;
      const dueDate = parts[2] && /^\d{4}-\d{2}-\d{2}$/.test(parts[2]) ? parts[2] : null;
      const listName = parts[3] || null;
      if (title) tasks.push({ title, urgency, dueDate, listName });
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

  const sharedListsBlock =
    context.sharedLists?.length > 0
      ? `\nSHARED LISTS (user is member): ${context.sharedLists.map((l) => l.name).join('; ')}\nIf the user mentions a list/project name and wants to add tasks there, use:\nADD_TO_LIST: <listName>|<assignee first name or "me">|<task title>|<urgency>|<due_date>\nUrgency: low|medium|high. Due date: YYYY-MM-DD or empty. Assignee: first name, "me", or empty.`
      : '';

  const systemPrompt = `You are an ADHD-friendly focus assistant. The user is asking what they should focus on.

Given their current context below, provide a short, prioritized list of 3-5 actionable focus items for ${focusLabel}.
Be direct and practical. Use short phrases (e.g. "Complete training module X", "Sign document Y").
Do not add preamble or explanation—just the numbered list.
If they have little on their plate, suggest 1-2 items and one gentle reminder like "Take a short break" or "Review your calendar."

TASK CREATION: When the user asks to add, create, or record a task, be INTELLIGENT about urgency, due date, and project:
- Infer urgency from words: "urgent", "asap", "critical" → high; "when you can", "low priority" → low; else medium.
- Infer due date: "tomorrow" → tomorrow's date (YYYY-MM-DD); "next week" → approximate; "by Friday" → that Friday.
- If they mention a shared list/project name, use ADD_TO_LIST with that list.
Format: TASK: <title>|<urgency>|<due_date>|<list_name>
Example: TASK: Call parent tomorrow|high|2025-02-22|
Example: TASK: Review notes when you can|low||
Omit optional parts (use empty between pipes). Urgency: low|medium|high. Due: YYYY-MM-DD.

TASK UPDATE: If the user asks to change an existing task (only for custom tasks from TASKS list):
UPDATE_TASK: <taskId>|<new title>

TASK DELETE: If the user asks to remove a task (only for custom tasks):
DELETE_TASK: <taskId>
${sharedListsBlock}

Use exact task IDs from the TASKS list. One action per line. Otherwise omit.`;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const tasksWithId = context.tasks
    .filter((t) => t.task_type === 'custom')
    .map((t) => `${t.id}|${t.title}`)
    .join('; ');
  const contextBlock = `
TODAY: ${todayStr}. TOMORROW: ${tomorrowStr}. Use these for due dates when user says "today" or "tomorrow".
CHECKLIST (incomplete): ${context.checklistItems.join('; ') || 'None'}
TASKS (open, id|title for custom only): ${tasksWithId || 'None'}
ALL TASKS (open): ${context.tasks.map((t) => t.title).join('; ') || 'None'}
TICKETS (open): ${context.tickets.map((t) => t.subject).join('; ') || 'None'}
UNDONE NOTES (stickies): ${context.undoneStickies.join('; ') || 'None'}
${context.sharedLists?.length ? `SHARED LISTS: ${context.sharedLists.map((l) => l.name).join('; ')}` : ''}
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
  const addToListEntries = parseAddToListFromResponse(text);

  const createdTasks = [];
  let listsForTask = [];
  if (contextOptions.agencyId) {
    listsForTask = await TaskList.listByUserMembership(userId, { agencyId: contextOptions.agencyId });
  }
  for (const t of suggestedTasks) {
    let taskListId = null;
    let listName = null;
    if (t.listName && listsForTask.length > 0) {
      const match = listsForTask.find(
        (l) => String(l.name || '').toLowerCase() === String(t.listName || '').toLowerCase()
      );
      if (match && TaskListMember.canEdit(match.my_role)) {
        taskListId = match.id;
        listName = match.name;
      }
    }
    const dueDateVal = t.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)
      ? `${t.dueDate} 23:59:59`
      : null;
    const urgencyVal = ['low', 'medium', 'high'].includes(t.urgency) ? t.urgency : 'medium';
    try {
      const task = await Task.create({
        taskType: 'custom',
        title: t.title,
        description: null,
        assignedToUserId: userId,
        assignedByUserId: userId,
        dueDate: dueDateVal,
        referenceId: null,
        taskListId,
        urgency: urgencyVal
      });
      await TaskAuditLog.logAction({
        taskId: task.id,
        actionType: 'assigned',
        actorUserId: userId,
        targetUserId: userId,
        metadata: { source: 'focus_assistant', createdVia: 'momentum_chat' }
      });
      createdTasks.push({ task, listName });
    } catch (err) {
      console.error('momentumChat: Failed to create task:', err);
    }
  }

  const createdInList = [];
  if (addToListEntries.length > 0 && contextOptions.agencyId) {
    const lists = await TaskList.listByUserMembership(userId, { agencyId: contextOptions.agencyId });
    const [agencyUsers] = await pool
      .execute(
        `SELECT u.id, u.first_name, u.last_name FROM users u
         JOIN user_agencies ua ON u.id = ua.user_id
         WHERE ua.agency_id = ? AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
        [contextOptions.agencyId]
      )
      .catch(() => [[]]);

    for (const entry of addToListEntries) {
      const list = lists.find(
        (l) => String(l.name || '').toLowerCase() === String(entry.listName || '').toLowerCase()
      );
      if (!list || !TaskListMember.canEdit(list.my_role)) continue;

      let assigneeId = userId;
      if (entry.assignee) {
        const a = String(entry.assignee).toLowerCase();
        if (a === 'me' || a === 'myself') {
          assigneeId = userId;
        } else {
          const match = (agencyUsers || []).find(
            (u) =>
              String(u.first_name || '').toLowerCase() === a ||
              String(u.last_name || '').toLowerCase() === a ||
              `${String(u.first_name || '').toLowerCase()} ${String(u.last_name || '').toLowerCase()}`.includes(a) ||
              `${String(u.last_name || '').toLowerCase()} ${String(u.first_name || '').toLowerCase()}`.includes(a)
          );
          if (match) assigneeId = match.id;
        }
      } else {
        assigneeId = userId;
      }

      const member = await TaskListMember.findByListAndUser(list.id, assigneeId);
      const finalAssignee = member ? assigneeId : userId;

      const dueDateVal = entry.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(entry.dueDate)
        ? `${entry.dueDate} 23:59:59`
        : null;
      const urgencyVal = ['low', 'medium', 'high'].includes(entry.urgency) ? entry.urgency : 'medium';
      try {
        const task = await Task.create({
          taskType: 'custom',
          title: entry.title,
          description: null,
          assignedToUserId: finalAssignee,
          assignedByUserId: userId,
          dueDate: dueDateVal,
          referenceId: null,
          taskListId: list.id,
          urgency: urgencyVal
        });
        createdInList.push({ task, listName: list.name });
      } catch (err) {
        console.error('momentumChat: Failed to create task in list:', err);
      }
    }
  }

  const createdTitles = new Set(createdTasks.map((c) => c.task?.title).filter(Boolean));
  const remainingSuggested = suggestedTasks.filter((t) => !createdTitles.has(t.title));

  return {
    items,
    suggestedTasks: remainingSuggested,
    suggestedUpdates,
    suggestedDeletes,
    createdTasks,
    createdInList,
    rawText: text
  };
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
