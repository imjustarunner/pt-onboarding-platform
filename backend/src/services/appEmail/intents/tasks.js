/**
 * Task creation intents — any approved member.
 */
import Task from '../../../models/Task.model.js';
import { setSession } from '../reply.js';

function extractTaskTitle(text) {
  const s = String(text || '').trim();
  const patterns = [
    /^(?:add|create|new)\s+(?:a\s+)?task\s*[:\-]?\s*(.+)$/i,
    /^task\s*[:\-]\s*(.+)$/i,
    /^todo\s*[:\-]?\s*(.+)$/i,
    /^remind\s+me\s+to\s+(.+)$/i,
    /^(?:please\s+)?add\s+(?:this\s+)?(?:to\s+)?(?:my\s+)?(?:tasks?|todo)\s*[:\-]?\s*(.+)$/i
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return String(m[1]).trim().slice(0, 240);
  }
  if (/^(?:add|create)\s+(?:a\s+)?task\b/i.test(s) && !/[:\-]/i.test(s)) return null;
  return null;
}

function isTaskIntent(text) {
  const s = String(text || '').toLowerCase();
  return (
    /\b(add|create|new)\s+(a\s+)?task\b/.test(s) ||
    /^task\s*[:\-]/i.test(s) ||
    /^todo\b/i.test(s) ||
    /\bremind\s+me\s+to\b/.test(s)
  );
}

async function handleTaskCreate(ctx, matchResult = {}) {
  const { agency, user, text } = ctx;
  let title = matchResult.title || extractTaskTitle(text);

  if (!title) {
    await setSession(agency.id, user.id, 'create_task', { awaiting: 'title' });
    return {
      text: 'Sure — what should the task say? Reply with the title (and optional details).',
      clearSession: false
    };
  }

  const description = `Created via Email App Assistant (app@).\n\nFrom: ${user.email || 'unknown'}`;
  const task = await Task.create({
    taskType: 'custom',
    title,
    description,
    assignedToUserId: user.id,
    assignedByUserId: user.id,
    assignedToAgencyId: agency.id,
    urgency: 'medium',
    isPrivate: false,
    categories: ['general']
  });

  return {
    text: `Task created (#${task.id}): ${title}\n\nIt is assigned to you. Open Tasks in the app to update it.`,
    clearSession: true
  };
}

export const taskIntents = [
  {
    key: 'create_task',
    label: 'Create a task',
    roles: 'any_member',
    examples: [
      'Add task: Call Carter about coverage',
      'Create a task Follow up with payroll',
      'Remind me to submit mileage',
      'Todo: Review intake packet'
    ],
    match: (text) => {
      if (!isTaskIntent(text)) return null;
      const title = extractTaskTitle(text);
      return title ? { title } : {};
    },
    handle: handleTaskCreate
  }
];
