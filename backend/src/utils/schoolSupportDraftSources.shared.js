/**
 * Draft source tracing for school support AI replies (Phase 3).
 * Sources are stored on support_tickets.ai_draft_metadata_json.draftSources.
 */

function truncateLabel(raw, max = 120) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function parseMetadataJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseDraftSourcesFromMetadata(metadata) {
  const meta = parseMetadataJson(metadata);
  return Array.isArray(meta?.draftSources) ? meta.draftSources : [];
}

export function parseDraftSourcesFromTicket(ticket) {
  return parseDraftSourcesFromMetadata(ticket?.ai_draft_metadata_json);
}

export function mergeMetadataDraftSources(metadata, draftSources, extra = {}) {
  const base = parseMetadataJson(metadata) || {};
  return {
    ...base,
    ...extra,
    draftSources: Array.isArray(draftSources) ? draftSources : [],
    draftSourcesUpdatedAt: new Date().toISOString()
  };
}

function source(type, { id = null, label, detail = null } = {}) {
  const entry = {
    type,
    label: truncateLabel(label)
  };
  if (id != null) entry.id = Number(id) || id;
  if (detail) entry.detail = truncateLabel(detail, 240);
  return entry;
}

export function buildManualDraftSources({
  ticket,
  client = null,
  messages = [],
  notes = [],
  recentTickets = [],
  recentAnswers = [],
  libraryMatches = [],
  promptNotes = [],
  intentKey = null,
  regenerationGuidance = ''
} = {}) {
  const sources = [];

  if (ticket?.id) {
    sources.push(source('ticket', {
      id: ticket.id,
      label: `Ticket #${ticket.id}: ${ticket.subject || ticket.source_email_subject || 'Support ticket'}`
    }));
  }

  if (ticket?.school_organization_id || ticket?.school_name) {
    sources.push(source('school', {
      id: ticket.school_organization_id || null,
      label: `School: ${ticket.school_name || `Org #${ticket.school_organization_id}`}`
    }));
  }

  if (client?.id) {
    const name = client.initials || client.identifier_code || client.full_name || `Client #${client.id}`;
    const status = client.client_status_label || client.client_status_key || client.status;
    sources.push(source('client', {
      id: client.id,
      label: `Client: ${name}`,
      detail: status ? `Status: ${status}` : null
    }));
    if (client.paperwork_status_label || client.document_status) {
      sources.push(source('checklist', {
        id: client.id,
        label: 'Paperwork / checklist',
        detail: client.paperwork_status_label || client.document_status
      }));
    }
    if (client.provider_name) {
      sources.push(source('provider_assignment', {
        id: client.provider_id || null,
        label: `Provider: ${client.provider_name}${client.service_day ? ` (${client.service_day})` : ''}`
      }));
    }
  }

  for (const msg of (messages || []).slice(-5)) {
    const author = msg.author_name || `User #${msg.author_user_id || '—'}`;
    sources.push(source('ticket_message', {
      id: msg.id || null,
      label: `Thread: ${author}`,
      detail: truncateLabel(msg.body, 80)
    }));
  }

  for (const note of (notes || []).slice(0, 3)) {
    sources.push(source('client_note', {
      id: note.id || null,
      label: `Note: ${note.category || 'general'}`,
      detail: truncateLabel(note.message, 80)
    }));
  }

  for (const rt of (recentTickets || []).slice(0, 3)) {
    sources.push(source('prior_ticket', {
      id: rt.id,
      label: `Prior ticket #${rt.id}`,
      detail: truncateLabel(rt.subject, 80)
    }));
  }

  for (const ra of (recentAnswers || []).slice(0, 4)) {
    sources.push(source('recent_answer', {
      id: ra.id,
      label: `Recent reply #${ra.id}`,
      detail: truncateLabel(ra.subject || ra.answer, 90)
    }));
  }

  for (const entry of libraryMatches || []) {
    sources.push(source('reply_library', {
      id: entry.id,
      label: `Library: ${entry.title}`,
      detail: entry.intentLabel || entry.intentKey
    }));
  }

  for (const note of promptNotes || []) {
    sources.push(source('prompt_guardrail', {
      id: note.id || null,
      label: 'Staff guardrail',
      detail: note.promptText || note.prompt_text
    }));
  }

  if (intentKey) {
    sources.push(source('intent', {
      label: `Intent: ${String(intentKey).replace(/_/g, ' ')}`
    }));
  }

  if (String(regenerationGuidance || '').trim()) {
    sources.push(source('regen_guidance', {
      label: 'Regeneration guidance',
      detail: truncateLabel(regenerationGuidance, 100)
    }));
  }

  return sources;
}

export function buildInboundStatusDraftSources({
  schoolName = null,
  schoolOrganizationId = null,
  client = null,
  checklistItems = [],
  libraryMatches = [],
  promptNotes = [],
  intentKey = 'school_status_request',
  attachmentCount = 0
} = {}) {
  const sources = [];

  if (schoolOrganizationId || schoolName) {
    sources.push(source('school', {
      id: schoolOrganizationId,
      label: `School: ${schoolName || `Org #${schoolOrganizationId}`}`
    }));
  }

  if (client?.id) {
    const name = client.full_name || client.initials || client.identifier_code || `Client #${client.id}`;
    sources.push(source('client', {
      id: client.id,
      label: `Client: ${name}`,
      detail: client.client_status_label || client.status || null
    }));
  }

  for (const item of (checklistItems || []).slice(0, 8)) {
    sources.push(source('checklist_item', {
      label: item.label || item.statusKey || 'Checklist item',
      detail: item.isNeeded ? 'Still needed' : (item.receivedAt ? 'Received' : 'Complete')
    }));
  }

  for (const entry of libraryMatches || []) {
    sources.push(source('reply_library', {
      id: entry.id,
      label: `Library: ${entry.title}`,
      detail: entry.intentLabel || entry.intentKey
    }));
  }

  for (const note of promptNotes || []) {
    sources.push(source('prompt_guardrail', {
      id: note.id || null,
      label: 'Staff guardrail',
      detail: note.promptText || note.prompt_text
    }));
  }

  if (attachmentCount > 0) {
    sources.push(source('attachment', {
      label: `${attachmentCount} inbound attachment${attachmentCount === 1 ? '' : 's'}`
    }));
  }

  if (intentKey) {
    sources.push(source('intent', {
      label: `Intent: ${String(intentKey).replace(/_/g, ' ')}`
    }));
  }

  return sources;
}
