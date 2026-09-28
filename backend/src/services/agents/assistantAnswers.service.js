import { detectAgeBucketFromText } from '../../utils/ageMatch.util.js';

// Answer mode cannot execute navigation or mutations, including model-planned calls.
export const ANSWER_READ_TOOLS = new Set([
  'listAcceptingProviders', 'findMyNextClientAppointment', 'findProvidersByApproach',
  'searchReferralDirectory', 'searchProviders', 'getProviderProfileFields',
  'getProviderIntakeAvailability', 'findIntakeOpenings', 'findSchoolSlotAvailability',
  'listTeamPresence', 'findNextMeeting', 'findMyMeetings', 'openTodaysWorkspace',
  'listMyOpenTasks', 'getMyPayrollSummary', 'getMyComplianceStatus',
  'queryAgencyCompliance', 'queryPayrollAnalytics', 'listMyRecentActivity',
  'searchAgencyActivity', 'getAgencyActivityStats', 'searchSchools', 'getSchoolClientStats',
  'listSchoolCoverage', 'searchEvents', 'searchUsers', 'getEventResponses',
  'lookupPersonActivity', 'lookupProviderSchoolAssignments', 'getOfficeSchedule',
  'listOfficeRoster', 'searchTrainingKnowledgeBase', 'lookupStandardCrosswalk'
]);

const reply = (assistantText, extra = {}) => ({
  assistantText, uiCommands: [], toolCalls: [], toolResults: [], nextCards: [], nextActions: [],
  runtime: 'grounded_answer', ...extra
});
const promptAction = (label, prefillText = label) => ({ type: 'prefill', label, prefillText });
const nameOf = (p) => p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim();

export function appWorkflowAnswer(prompt) {
  if (/\breimburs(?:e|ement|ements)\b/i.test(prompt) && /\b(how|where|submit|request|claim)\b/i.test(prompt)) {
    return reply('To submit a reimbursement:\n1. Open My Dashboard, then Submit and choose Reimbursement (also available in My Payroll).\n2. Enter the expense date, amount, payment method, vendor, purchase approver, whether it was preapproved, reason, and notes.\n3. Attach the receipt and check the attestation. If splitting categories, the amounts must equal the total.\n4. Submit. Payroll reviews the claim before adding it to a pay period. Submission is not approval.\n\nSource: the reimbursement submission form. Your agency determines which expenses qualify.');
  }
  if (/\bannouncements?\b/i.test(prompt) && /\b(who|can|post|publish|create)\b/i.test(prompt)) {
    return reply('Tenant announcements can be posted by Admin, Super Admin, and Support roles with access to that tenant. Being a provider or staff member alone does not grant posting permission. A designated club manager can post for their own club, not for the entire tenant.\n\nSource: announcement posting permissions.');
  }
  if (/\b(where|how)\b.*\b(send|write|start)\b.*\b(messages?|dm|chat)\b/i.test(prompt)) {
    return reply('In Messages, choose Direct Messages, select a teammate, write your message, and press Send. Use Compose in to select the tenant when you have more than one. Channels are for group conversations; subscriber-only groups such as Book Club appear there when you belong to the group.\n\nSource: Messages.');
  }
  if (/\b(book\s*club)\b/i.test(prompt) && /\b(channel|join|subscribe|where|message)\b/i.test(prompt)) {
    return reply('Book Club is a private channel under its parent tenant, not a separate messaging tenant. Set your Book Club interest to interested in the club interface to subscribe; its channel then appears in Messages > Channels. Removing that subscription removes channel access.\n\nSource: Book Club subscriptions.');
  }
  if (/\bnotifications?\b/i.test(prompt) && /\b(mark|read|snooze|select|bulk)\b/i.test(prompt)) {
    return reply('On Notifications, use the top toolbar to filter the inbox. Choose Current page to apply an action to the loaded page, or turn on Select multiple and check individual rows. Then choose Mark read, Mark unread, Snooze, or an action from the menu. Current page does not include later pages. Reset filters returns to the full active inbox.\n\nSource: Notifications toolbar.');
  }
  return null;
}

export async function answerAppQuestion({ prompt, history = [], agencyId, allowedToolNames, clientToolCalls = [], execute, detect, format, research }) {
  const q = String(prompt || '').trim();
  const help = appWorkflowAnswer(q);
  if (help) return help;
  const lastAnswer = history.filter(t => t.role === 'assistant').at(-1)?.text || '';
  const readTools = new Set([...allowedToolNames].filter(n => ANSWER_READ_TOOLS.has(n)));
  let calls = clientToolCalls;
  let intent = '';
  let source = '';
  let messageRecipient = '';
  let messageDraft = '';
  if (calls.some(t => !readTools.has(t.name))) return reply('That action is not available in answer mode. No changes were made.');
  if (!calls.length) {
    if (/\bwhat can you do\b|\bhelp me\b|^help[?.!]*$/i.test(q)) return reply('What would you like to know?', { nextActions: [
      promptAction('Who is accepting clients?'), promptAction('Who sees clients with ADHD?'),
      promptAction("When is my next client?"), promptAction('How do I submit a reimbursement?')
    ] });
    if (/\bwho(?:\s+is|\'s)?\s+(?:free|available)(?:\s+today|\s+now|\s+right now)?[?.!]*$/i.test(q)) {
      return reply('Do you mean available to chat, accepting new clients, or open intake appointments? Chat presence does not indicate a free appointment.', { nextActions: [
        promptAction('Available to chat', 'Who is online now?'), promptAction('Accepting clients', 'Who is accepting clients?'),
        promptAction('Intake openings', 'Who has an intake opening today?')
      ] });
    }
    if (/\baccepting\s+(?:new\s+)?clients\b|\btaking\s+new\s+clients\b/i.test(q)) {
      intent = 'accepting'; source = 'Provider accepting-new-client status'; calls = [{ name: 'listAcceptingProviders', args: {} }];
    } else if (/\bmy\s+next\s+(?:client|appointment|session)\b|\bnext\s+client\b/i.test(q)) {
      intent = 'next_client'; source = 'Your scheduled client appointments'; calls = [{ name: 'findMyNextClientAppointment', args: {} }];
    } else if (/\b(?:send\s*(?:a\s*)?message|message|dm)\s+(?:to\s+)?[a-z]/i.test(q) && !/\b(how|where)\b/i.test(q)) {
      messageRecipient = q.replace(/^.*?\b(?:send\s*(?:a\s*)?message|message|dm)\s+(?:to\s+)?/i, '').split(/\s+(?:saying|that|about)\s+|:/i)[0].replace(/[?.!]+$/, '').trim().slice(0, 100);
      messageDraft = q.match(/(?:\bsaying\s+|:\s*)([\s\S]+)$/i)?.[1]?.trim().slice(0, 10000) || '';
      intent = 'message'; source = 'Tenant messaging roster'; calls = [{ name: 'listTeamPresence', args: { nameQuery: messageRecipient, includeOffline: true } }];
    } else if (/\bpsychiatr(?:y|ist|ists|ic)\b/i.test(q)) {
      source = 'Tenant referral directory'; calls = [{ name: 'searchReferralDirectory', args: { query: /pediatric|child|kid/i.test(q) ? 'pediatric psychiatry' : 'psychiatry', limit: 10 } }];
    } else if (/\badhd\b/i.test(q) && /\b(who|find|provider|therapist|clinician)\b/i.test(q)) {
      source = 'Provider clinical profiles'; calls = [{ name: 'findProvidersByApproach', args: { approach: 'ADHD', limit: 25 } }];
    } else if (/\b(kids|children|child|teen|teens|year.old)\b/i.test(q) || (/how old is the client/i.test(lastAnswer) && /^\d{1,2}(?:\s|$)/.test(q))) {
      const age = /^\d{1,2}$/.test(q) ? `age ${q}` : q;
      if (!/\d|teen|toddler|infant/i.test(age)) return reply('How old is the client? Provider age ranges differ, so I do not want to assume every provider who sees children can see this client.');
      const bucket = detectAgeBucketFromText(age);
      if (bucket) { source = `Provider age specialties: ${bucket}`; calls = [{ name: 'findProvidersByApproach', args: { approach: bucket, limit: 25 } }]; }
    }
    if (!calls.length) {
      const matched = await detect(q, readTools);
      calls = (matched?.toolCalls || []).filter(t => readTools.has(t.name));
      if (!calls.length && matched?.assistantText && !(matched.toolCalls || []).length) return reply(matched.assistantText);
    }
  }
  if (calls.length) {
    if (!agencyId) return reply('Choose a tenant before I look up its records.');
    if (calls.some(t => !readTools.has(t.name))) return reply('Your account does not have access to that lookup in this tenant.');
    const results = [];
    try {
      for (const call of calls.slice(0, 4)) {
        // A router or client cannot override the authorized workspace with tool arguments.
        const args = { ...(call.args || {}), agencyId };
        results.push(await execute({ name: call.name, args }));
      }
    } catch {
      return reply('I could not load those records. Please try again; I have not treated the failed lookup as an empty result.');
    }
    if (results.some(r => !r?.ok)) return reply('That lookup did not complete. Please try again; no changes were made.');
    let text;
    const out = results[0]?.result || {};
    if (intent === 'accepting' || calls[0].name === 'listAcceptingProviders') {
      text = out.providers?.length ? `Marked as accepting new clients:\n${out.providers.map(p => `- ${nameOf(p)}`).join('\n')}${out.hasMore ? '\nShowing the first 50 matches.' : ''}\n\nThis is the recorded provider status, not a promise of an appointment or a school-specific opening.` : 'No active providers in this tenant are explicitly marked as accepting new clients. Missing status is not confirmation that a provider is full.';
    } else if (intent === 'next_client' || calls[0].name === 'findMyNextClientAppointment') {
      const a = out.appointment;
      const time = a ? new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: a.source_timezone || 'America/Denver' }).format(new Date(a.start_at)) : '';
      text = a ? `Your next scheduled client appointment is ${time} (${a.source_timezone || 'America/Denver'}).\n${a.title || 'Client appointment'}${a.modality ? ` - ${a.modality}` : ''}\nStatus: ${a.status}.` : 'I found no upcoming client appointments assigned to you in this tenant. This lookup does not include an external calendar that has not been synced.';
    } else if (intent === 'message') {
      const people = out.people || [];
      return reply(people.length ? `Choose the recipient${people.length > 1 ? ` matching "${messageRecipient}"` : ''}, then write or review your message. Nothing is sent until you press Send in the conversation.` : `I could not find a teammate matching "${messageRecipient}" in this tenant. What is their full name?`, {
        nextActions: people.slice(0, 8).map(p => ({ type: 'compose_message', label: `Message ${p.name}`, userId: p.id, agencyId, draft: messageDraft })),
        toolResults: results
      });
    } else if (calls[0].name === 'listTeamPresence') {
      const people = out.nameQuery ? out.people || [] : [...(out.online || []), ...(out.away || [])];
      text = people.length ? people.slice(0, 30).map(p => `- ${p.name}: ${p.status_label || p.status}`).join('\n') : 'No teammates currently show as active or idle in Messages.';
      text += '\n\nThis is chat presence, not calendar or client availability.';
      source = 'Live Messages presence';
    } else if (calls[0].name === 'findProvidersByApproach') {
      const list = out.providers || [];
      text = list.length
        ? `Recorded matches for "${out.approach || calls[0].args.approach}":\n${list.map(p => `- ${nameOf(p)}${p.matchedFieldLabel ? `: ${p.matchedFieldLabel}` : ''}${p.matchedOption ? ` - ${String(p.matchedOption).slice(0, 180)}` : ''}`).join('\n')}`
        : `No recorded provider profiles matched "${out.approach || calls[0].args.approach}" in this tenant. This does not prove no one offers that service; profiles may be incomplete.`;
      text += '\n\nThese are profile matches, not confirmed openings. Verify age, location, insurance, and availability before referring.';
    } else if (calls[0].name === 'searchProviders') {
      const list = out.users || [];
      text = list.length ? `Provider matches:\n${list.map(p => `- ${nameOf(p)}`).join('\n')}` : 'No recorded providers matched those filters in this tenant.';
    } else {
      text = format(q, results);
      if (calls[0].name === 'findProvidersByApproach') text += '\n\nMatches are based on recorded profile specialties, not confirmed availability. Verify age, location, insurance, and current openings before referring.';
      if (calls[0].name === 'searchReferralDirectory') text += '\n\nConfirm the referral contact, age range, insurance, and current intake availability with the listed practice.';
    }
    return reply(`${text || 'The lookup returned no displayable answer.'}\n\nSource: ${source || 'authorized app records'}; checked ${new Date().toISOString()}.`, { toolResults: results, toolCalls: calls });
  }
  const found = await research(q, readTools);
  if (found && !['capability_help', 'agency_research_empty'].includes(found.runtime)) return { ...found, uiCommands: [], nextActions: [], nextCards: [] };
  return reply('I do not have a verified answer for that yet. Tell me the workflow or record you mean, or ask your agency administrator about policies that are not in its knowledge base.', { nextActions: [promptAction('How do I submit a reimbursement?'), promptAction('Who is accepting clients?')] });
}
