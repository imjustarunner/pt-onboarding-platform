import {
  SCHOOL_REPLY_INTENT_LABELS,
  inferIntentFromTicket,
  normalizeIntentKey
} from './schoolSupportReplyLibrary.shared.js';
import { parseMetadataJson } from './schoolSupportDraftSources.shared.js';

export const RESPONSE_PLAN_STEP_TYPES = Object.freeze({
  MATCH_CLIENT: 'match_client',
  PULL_STATUS: 'pull_status',
  DRAFT_REPLY: 'draft_reply',
  ACTION_ITEM: 'action_item',
  NOTIFY: 'notify'
});

export const RESPONSE_PLAN_STEP_STATUS = Object.freeze({
  DONE: 'done',
  READY: 'ready',
  BLOCKED: 'blocked',
  SKIPPED: 'skipped',
  NEEDS_APPROVAL: 'needs_approval',
  FAILED: 'failed'
});

export const RESPONSE_PLAN_STATUS = Object.freeze({
  PROPOSED: 'proposed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  DISMISSED: 'dismissed'
});

function truncate(raw, max = 200) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function clientDisplayName(client = null) {
  if (!client) return '';
  return (
    client.initials ||
    client.identifier_code ||
    client.full_name ||
    [client.first_name, client.last_name].filter(Boolean).join(' ') ||
    (client.id ? `Client #${client.id}` : '')
  );
}

export function mapActionItemStepStatus(actionStatus) {
  const status = String(actionStatus || '').toLowerCase();
  if (status === 'completed') return RESPONSE_PLAN_STEP_STATUS.DONE;
  if (status === 'failed') return RESPONSE_PLAN_STEP_STATUS.FAILED;
  if (status === 'rejected') return RESPONSE_PLAN_STEP_STATUS.SKIPPED;
  if (status === 'approved') return RESPONSE_PLAN_STEP_STATUS.READY;
  return RESPONSE_PLAN_STEP_STATUS.NEEDS_APPROVAL;
}

export function summarizeChecklistItems(items = []) {
  const list = Array.isArray(items) ? items : [];
  const needed = list.filter((item) => item?.isNeeded).map((item) => item.label || item.statusKey).filter(Boolean);
  const received = list.filter((item) => item && item.isNeeded === false).map((item) => item.label || item.statusKey).filter(Boolean);
  return {
    needed,
    received,
    summary: needed.length
      ? `Waiting on: ${needed.slice(0, 4).join(', ')}`
      : received.length
        ? `Up to date (${received.slice(0, 3).join(', ')})`
        : 'No checklist items on file'
  };
}

function buildMatchClientStep({ ticket, client, metadata }) {
  const intentKey = normalizeIntentKey(inferIntentFromTicket(ticket));
  const needsMatch = ['school_status_request', 'scheduling', 'packet_received'].includes(intentKey);
  if (!needsMatch) {
    return {
      step: 0,
      type: RESPONSE_PLAN_STEP_TYPES.MATCH_CLIENT,
      title: 'Match client',
      detail: 'Not required for this email type',
      status: RESPONSE_PLAN_STEP_STATUS.SKIPPED
    };
  }

  if (client?.id || ticket?.client_id) {
    const name = clientDisplayName(client) || `Client #${ticket?.client_id || client?.id}`;
    return {
      step: 0,
      type: RESPONSE_PLAN_STEP_TYPES.MATCH_CLIENT,
      title: 'Match client',
      detail: name,
      status: RESPONSE_PLAN_STEP_STATUS.DONE,
      clientId: Number(client?.id || ticket?.client_id) || null
    };
  }

  const extracted = metadata?.extractedClientReference || null;
  const matchReason = metadata?.matchReason || null;
  const candidates = Array.isArray(metadata?.matchCandidates) ? metadata.matchCandidates : [];
  if (matchReason === 'ambiguous' || candidates.length > 1) {
    return {
      step: 0,
      type: RESPONSE_PLAN_STEP_TYPES.MATCH_CLIENT,
      title: 'Match client',
      detail: extracted
        ? `Ambiguous match for "${extracted}" — review candidates`
        : 'Multiple possible client matches',
      status: RESPONSE_PLAN_STEP_STATUS.BLOCKED,
      candidateCount: candidates.length
    };
  }

  if (extracted) {
    return {
      step: 0,
      type: RESPONSE_PLAN_STEP_TYPES.MATCH_CLIENT,
      title: 'Match client',
      detail: `Could not match "${extracted}" — link client manually`,
      status: RESPONSE_PLAN_STEP_STATUS.BLOCKED
    };
  }

  return {
    step: 0,
    type: RESPONSE_PLAN_STEP_TYPES.MATCH_CLIENT,
    title: 'Match client',
    detail: 'No client linked to this ticket yet',
    status: RESPONSE_PLAN_STEP_STATUS.BLOCKED
  };
}

function buildPullStatusStep({ ticket, client, metadata, checklistItems = [] }) {
  const intentKey = normalizeIntentKey(inferIntentFromTicket(ticket));
  const needsStatus = ['school_status_request', 'scheduling', 'school_reinit_update'].includes(intentKey);
  if (!needsStatus) {
    return {
      step: 0,
      type: RESPONSE_PLAN_STEP_TYPES.PULL_STATUS,
      title: 'Pull client status',
      detail: 'Not required for this email type',
      status: RESPONSE_PLAN_STEP_STATUS.SKIPPED
    };
  }

  if (intentKey === 'school_reinit_update' && metadata?.reinit?.applied) {
    const sections = Array.isArray(metadata.reinit.updatedSections) ? metadata.reinit.updatedSections : [];
    return {
      step: 0,
      type: RESPONSE_PLAN_STEP_TYPES.PULL_STATUS,
      title: 'Capture year-update details',
      detail: sections.length
        ? `Captured: ${sections.map((s) => String(s).replace(/_/g, ' ')).join(', ')}`
        : 'Year-update information received',
      status: RESPONSE_PLAN_STEP_STATUS.DONE
    };
  }

  const hasClient = !!(client?.id || ticket?.client_id);
  if (!hasClient) {
    return {
      step: 0,
      type: RESPONSE_PLAN_STEP_TYPES.PULL_STATUS,
      title: 'Pull client status',
      detail: 'Waiting on client match',
      status: RESPONSE_PLAN_STEP_STATUS.BLOCKED
    };
  }

  const items = checklistItems.length
    ? checklistItems
    : Array.isArray(metadata?.checklistItems)
      ? metadata.checklistItems
      : [];
  const checklist = summarizeChecklistItems(items);
  const statusBits = [];
  if (client?.client_status_label || client?.status) {
    statusBits.push(`Status: ${client.client_status_label || client.status}`);
  }
  if (client?.paperwork_status_label || client?.document_status) {
    statusBits.push(`Paperwork: ${client.paperwork_status_label || client.document_status}`);
  }
  if (client?.provider_name) {
    statusBits.push(`Provider: ${client.provider_name}${client.service_day ? ` (${client.service_day})` : ''}`);
  }

  return {
    step: 0,
    type: RESPONSE_PLAN_STEP_TYPES.PULL_STATUS,
    title: 'Pull client status',
    detail: truncate([statusBits.join(' · '), checklist.summary].filter(Boolean).join(' — ')),
    status: RESPONSE_PLAN_STEP_STATUS.DONE,
    checklistNeeded: checklist.needed,
    checklistReceived: checklist.received
  };
}

function buildDraftReplyStep({ ticket, priorSteps = [] }) {
  const blocked = priorSteps.some(
    (step) =>
      step.type === RESPONSE_PLAN_STEP_TYPES.MATCH_CLIENT &&
      step.status === RESPONSE_PLAN_STEP_STATUS.BLOCKED
  );
  const isAnswered = ['answered', 'closed'].includes(String(ticket?.status || '').toLowerCase()) || !!ticket?.sent_at;
  const hasDraft = !!String(ticket?.ai_draft_response || '').trim();
  if (isAnswered && hasDraft) {
    return {
      step: 0,
      type: RESPONSE_PLAN_STEP_TYPES.DRAFT_REPLY,
      title: 'Draft reply',
      detail: 'Reply sent to school',
      status: RESPONSE_PLAN_STEP_STATUS.DONE
    };
  }
  if (hasDraft) {
    return {
      step: 0,
      type: RESPONSE_PLAN_STEP_TYPES.DRAFT_REPLY,
      title: 'Draft reply',
      detail: ticket?.ai_draft_review_state
        ? `AI draft ready (${ticket.ai_draft_review_state})`
        : 'AI draft ready for review',
      status: RESPONSE_PLAN_STEP_STATUS.READY
    };
  }
  return {
    step: 0,
    type: RESPONSE_PLAN_STEP_TYPES.DRAFT_REPLY,
    title: 'Draft reply',
    detail: blocked ? 'Resolve client match first' : 'Generate or write a reply draft',
    status: blocked ? RESPONSE_PLAN_STEP_STATUS.BLOCKED : RESPONSE_PLAN_STEP_STATUS.READY
  };
}

function buildNotifyStep({ ticket, priorSteps = [] }) {
  const isAnswered = ['answered', 'closed'].includes(String(ticket?.status || '').toLowerCase()) || !!ticket?.sent_at;
  if (isAnswered) {
    return {
      step: 0,
      type: RESPONSE_PLAN_STEP_TYPES.NOTIFY,
      title: 'Send official reply',
      detail: ticket?.sent_at ? `Sent ${String(ticket.sent_at).slice(0, 16).replace('T', ' ')}` : 'Reply sent',
      status: RESPONSE_PLAN_STEP_STATUS.DONE
    };
  }

  const draftReady = priorSteps.some(
    (step) =>
      step.type === RESPONSE_PLAN_STEP_TYPES.DRAFT_REPLY &&
      [RESPONSE_PLAN_STEP_STATUS.READY, RESPONSE_PLAN_STEP_STATUS.DONE].includes(step.status)
  );
  const pendingActions = priorSteps.filter(
    (step) =>
      step.type === RESPONSE_PLAN_STEP_TYPES.ACTION_ITEM &&
      [RESPONSE_PLAN_STEP_STATUS.NEEDS_APPROVAL, RESPONSE_PLAN_STEP_STATUS.FAILED].includes(step.status)
  );

  let detail = 'Review draft and send from Ticket Desk';
  let status = RESPONSE_PLAN_STEP_STATUS.READY;
  if (pendingActions.length) {
    detail = `${pendingActions.length} suggested action${pendingActions.length === 1 ? '' : 's'} still need approval`;
    status = RESPONSE_PLAN_STEP_STATUS.BLOCKED;
  } else if (!draftReady) {
    detail = 'Prepare a reply draft first';
    status = RESPONSE_PLAN_STEP_STATUS.BLOCKED;
  }

  return {
    step: 0,
    type: RESPONSE_PLAN_STEP_TYPES.NOTIFY,
    title: 'Send official reply',
    detail,
    status
  };
}

export function buildResponsePlanSteps({
  ticket,
  client = null,
  metadata = null,
  checklistItems = [],
  actionItems = []
} = {}) {
  const meta = metadata || parseMetadataJson(ticket?.ai_draft_metadata_json);
  const coreSteps = [
    buildMatchClientStep({ ticket, client, metadata: meta }),
    buildPullStatusStep({ ticket, client, metadata: meta, checklistItems }),
    buildDraftReplyStep({ ticket, priorSteps: [] })
  ];

  const actionSteps = (Array.isArray(actionItems) ? actionItems : []).map((action) => ({
    step: 0,
    type: RESPONSE_PLAN_STEP_TYPES.ACTION_ITEM,
    title: truncate(action.title || 'Suggested action', 120),
    detail: action.action_type ? String(action.action_type).replace(/_/g, ' ') : null,
    status: mapActionItemStepStatus(action.status),
    actionItemId: Number(action.id) || null,
    actionType: action.action_type || null
  }));

  const notifyStep = buildNotifyStep({
    ticket,
    priorSteps: [...coreSteps, ...actionSteps]
  });

  const steps = [...coreSteps, ...actionSteps, notifyStep].map((step, index) => ({
    ...step,
    step: index + 1
  }));

  return steps;
}

export function computeResponsePlanStatus(steps = []) {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) return RESPONSE_PLAN_STATUS.PROPOSED;

  const notifyStep = list.find((step) => step.type === RESPONSE_PLAN_STEP_TYPES.NOTIFY);
  if (notifyStep?.status === RESPONSE_PLAN_STEP_STATUS.DONE) {
    return RESPONSE_PLAN_STATUS.COMPLETED;
  }

  if (list.every((step) => [RESPONSE_PLAN_STEP_STATUS.DONE, RESPONSE_PLAN_STEP_STATUS.SKIPPED].includes(step.status))) {
    return RESPONSE_PLAN_STATUS.COMPLETED;
  }
  if (list.some((step) => [RESPONSE_PLAN_STEP_STATUS.READY, RESPONSE_PLAN_STEP_STATUS.NEEDS_APPROVAL, RESPONSE_PLAN_STEP_STATUS.FAILED].includes(step.status))) {
    return RESPONSE_PLAN_STATUS.IN_PROGRESS;
  }
  return RESPONSE_PLAN_STATUS.PROPOSED;
}

export function buildResponsePlanTitle(intentKey) {
  const key = normalizeIntentKey(intentKey);
  const label = SCHOOL_REPLY_INTENT_LABELS[key] || 'School email';
  return `Response plan: ${label}`;
}

export function buildResponsePlanSummary({ ticket, client, steps = [] }) {
  const pendingActions = steps.filter((step) => step.status === RESPONSE_PLAN_STEP_STATUS.NEEDS_APPROVAL).length;
  return {
    clientId: Number(client?.id || ticket?.client_id) || null,
    clientName: clientDisplayName(client) || null,
    pendingActionCount: pendingActions,
    stepCount: steps.length,
    completedStepCount: steps.filter((step) => step.status === RESPONSE_PLAN_STEP_STATUS.DONE).length
  };
}

export function buildResponsePlan({
  ticket,
  client = null,
  metadata = null,
  checklistItems = [],
  actionItems = []
} = {}) {
  const intentKey = normalizeIntentKey(inferIntentFromTicket(ticket));
  const steps = buildResponsePlanSteps({ ticket, client, metadata, checklistItems, actionItems });
  return {
    intentKey,
    planType: 'school_email',
    title: buildResponsePlanTitle(intentKey),
    status: computeResponsePlanStatus(steps),
    steps,
    summary: buildResponsePlanSummary({ ticket, client, steps })
  };
}
