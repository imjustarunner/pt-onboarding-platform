export const ITSCO_STAFF_ASSISTANT_NUMBER = '+17197163884';
export const STAFF_SMS_COMMAND_VERSION = '2026-10-09.commands1';
export const STAFF_ASSISTANT_EXAMPLES = ['MENU — instructions and available features', '#task Update the Kudos page and incorporate a menu — add a task', '#task — your top five open tasks', '#calendar — today’s app calendar types and times'];
export function parseStaffSmsRequest(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (/^(MENU|COMMANDS|ACCOUNT HELP|#MENU)$/i.test(text)) return {kind:'menu'};
  if (/^(START|STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|HELP|YES|NO|Y|N|R|SUPPORT|\d+)$/i.test(text)) return null;
  const task = text.match(/^#tasks?(?:\s+([\s\S]*))?$/i);
  if (task) {
    const title = (task[1] || '').trim().replace(/\s+/g, ' ');
    if (!title) return {kind:'task_list'};
    if (title.length > 240 || /[\x00-\x08\x0e-\x1f]/.test(title)) return {kind:'invalid_task'};
    return {kind:'task_create', title};
  }
  if (/^#calendar$/i.test(text)) return {kind:'calendar'};
  // Keep campaign votes and ordinary messages in their existing handlers.
  // Unrecognized assistant commands receive instructions, never guessed actions.
  if (/^#/.test(text) || /^(when (is|do|am|are)|who (has|is)|how many|what (was|is)|send (me |message|a message)|remind me|add (a )?(task|to my schedule)|planned? out|my (tasks|schedule|pay|messages|notes))\b/i.test(text)) return {kind:'menu'};
  return null;
}
