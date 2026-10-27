import { decryptTicketMessageRow, decryptTicketRow } from '../utils/supportTicketCrypto.js';
import {
  SUPPORT_EMAIL_DRAFT_VERSION, SUPPORT_EMAIL_REPLY_STANDARDS, SUPPORT_EMAIL_DRAFT_SYSTEM_INSTRUCTION,
  buildSupportEmailDraftContext, buildSupportEmailDraftPrompt,
  classifySupportEmailDraft, parseSupportEmailDraftResult, validateSupportEmailDraft
} from '../utils/supportEmailDraft.shared.js';
import { summarizeLibrarySources } from '../utils/schoolSupportReplyLibrary.shared.js';

function currentDraftContext(input) {
  return buildSupportEmailDraftContext({
    ...input,
    ticket: decryptTicketRow(input.ticket),
    messages: (input.messages || []).map(decryptTicketMessageRow)
  });
}

/** Pure preflight. Current suppression evidence always takes priority over cache reuse. */
export function assessSupportEmailDraftReuse(input, snapshot = null) {
  const context = currentDraftContext(input);
  const classification = classifySupportEmailDraft(context);
  const evidence = snapshot?.sourceEvidence && typeof snapshot.sourceEvidence === 'object' && !Array.isArray(snapshot.sourceEvidence)
    ? snapshot.sourceEvidence : {};
  let reason = 'compatible_evidence';
  let validationIssues = [];
  if (classification.suppressed) reason = 'current_evidence_suppressed';
  else if (!snapshot) reason = 'no_snapshot';
  else if (snapshot.readable === false || !String(snapshot.body || '').trim()) reason = 'snapshot_unreadable';
  else if (Number(snapshot.ticketId) !== Number(context.ticketId) || Number(snapshot.agencyId) !== Number(context.agencyId)
      || (context.latestInbound.id && String(snapshot.sourceMessageId) !== String(context.latestInbound.id))) reason = 'snapshot_scope_changed';
  else if (evidence.evidenceFingerprint !== context.evidenceFingerprint) reason = 'evidence_changed';
  else if (evidence.promptVersion !== SUPPORT_EMAIL_DRAFT_VERSION) reason = 'draft_standard_changed';
  else if (snapshot.provider !== 'vertex' || snapshot.model !== (process.env.SUPPORT_EMAIL_DRAFT_MODEL || 'gemini-2.5-pro')) reason = 'draft_model_changed';
  else {
    validationIssues = validateSupportEmailDraft(snapshot.body, context);
    if (validationIssues.length) reason = 'draft_validation_failed';
  }
  return { reusable: reason === 'compatible_evidence', reason, context, classification, validationIssues };
}

/** No persistence and no email send: callers snapshot this result before offering it for review. */
export async function generateSupportEmailDraft(input, dependencies = {}) {
  const context = currentDraftContext(input);
  const classification = classifySupportEmailDraft(context);
  const baseMetadata = {
    promptVersion: SUPPORT_EMAIL_DRAFT_VERSION,
    evidenceFingerprint: context.evidenceFingerprint,
    unresolvedFacts: context.unresolvedFacts,
    reviewWarnings: [],
    claimantUserId: context.claimant.id,
    claimantName: context.claimant.name,
    latestInboundMessageId: context.latestInbound.id || null,
    generatedForTicketId: context.ticketId,
    standards: SUPPORT_EMAIL_REPLY_STANDARDS.map(({ id, source, evidence }) => ({ id, source, evidence, provenance: 'review_derived_standard', approval: 'not_reviewed_by_rachel' })),
    draftSources: [
      { type: 'ticket', id: context.ticketId, label: 'Received email and current conversation' },
      ...context.messages.map((m) => ({ type: 'ticket_message', id: m.id, label: `${m.direction}: ${m.authorName || m.authorRole}`, detail: m.at })),
      ...context.attachments.files.map((a) => ({ type: 'attachment', id: a.id, label: a.filename, detail: 'Current incoming email file; contents not reviewed', provenance: a.provenance, messageId: a.messageId })),
      ...context.attachments.conversationFiles.map((a) => ({ type: 'attachment', id: a.id, label: a.filename, detail: 'Other conversation file; not proof of receipt with the latest email', provenance: a.provenance, messageId: a.messageId })),
      ...context.attachments.unattributedFiles.map((a) => ({ type: 'attachment', id: a.id, label: a.filename, detail: 'Email-message attribution unknown; not receipt evidence for the latest email', provenance: a.provenance, messageId: null })),
      ...context.verifiedFacts.map((f) => ({ type: 'verified_fact', id: f.evidenceId, label: f.key, detail: f.source }))
    ]
  };
  if (classification.suppressed) {
    return { text: '', status: 'suppressed', suppressed: true, suppressionReason: classification.reason, metadata: { ...baseMetadata, knowledgeSources: [] } };
  }

  // Directory-grounded options for explicit external referral requests. Never
  // manufacture providers, availability, credentials or insurance acceptance.
  const requestText = `${context.original.subject || ''}\n${context.latestInbound.body || ''}`;
  const { detectReferralServices, referralEmailContent } = await import('../utils/referralMatching.js');
  const requestedServices = detectReferralServices(requestText);
  if (requestedServices.length && /\b(?:referr\w*|recommend\w*|looking for|find|list of|options|send)\b/i.test(context.latestInbound.body || '')) {
    const findOptions = dependencies.findReferralOptions || (await import('./referralOutreach.service.js')).findReferralOptions;
    const options = await findOptions(context.agencyId,{services:requestedServices});
    if (options.entries.length) {
      const entries=options.entries.slice(0,4);
      return { text:referralEmailContent({entries}).text,status:'needs_review',provider:'directory',modelName:'service-tags-v1',
        metadata:{...baseMetadata,reviewWarnings:['Confirm the selected services and any age, location, language or insurance requirements before sending.'],
          knowledgeSources:[],draftSources:[...baseMetadata.draftSources,...entries.map(e=>({type:'referral_directory',id:e.id,label:e.organization_name||e.name,detail:e.source_url||e.website||''}))]} };
    }
  }

  let knowledgeMatches = input.knowledgeMatches;
  let promptNotes = input.promptNotes;
  const reviewWarnings = [];
  if (!Array.isArray(knowledgeMatches)) {
    try {
      const matchKnowledge = dependencies.matchKnowledge || (await import('./schoolSupportReplyRetrieval.service.js')).matchReplyKnowledgeForTicket;
      knowledgeMatches = await matchKnowledge({ agencyId: context.agencyId, schoolOrganizationId: context.schoolOrganizationId, subject: context.original.subject, question: context.latestInbound.body, intentKey: context.intentKey, limit: 4, excludeTicketId: context.ticketId });
    } catch { knowledgeMatches = []; reviewWarnings.push('historical_knowledge_unavailable'); }
  }
  if (!Array.isArray(promptNotes)) {
    try {
      const listNotes = dependencies.listPromptNotes || (await import('./schoolSupportReplyLearning.service.js')).listActivePromptNotes;
      promptNotes = await listNotes(context.agencyId, { schoolOrganizationId: context.schoolOrganizationId });
    } catch { promptNotes = []; reviewWarnings.push('staff_feedback_unavailable'); }
  }
  const generateText = dependencies.generateText || (await import('./geminiText.service.js')).callGeminiText;
  const prompt = buildSupportEmailDraftPrompt(context, { knowledgeMatches, promptNotes });
  const generationOptions = { prompt, systemInstruction: SUPPORT_EMAIL_DRAFT_SYSTEM_INSTRUCTION,
    model: process.env.SUPPORT_EMAIL_DRAFT_MODEL || 'gemini-2.5-pro',
    temperature: 0.1, maxOutputTokens: 4000, jsonMode: true, sensitive: true, vertexOnly: true, allowModelFallback: false };
  let response = await generateText(generationOptions);
  let result = parseSupportEmailDraftResult(response.text);
  let validationIssues = validateSupportEmailDraft(result.reply, context);
  let correctedDraft = false;
  if (validationIssues.length) {
    correctedDraft = true;
    response = await generateText({ ...generationOptions, prompt: `${prompt}\nQUALITY CORRECTION REQUIRED:\nThe previous candidate failed these checks: ${JSON.stringify(validationIssues)}. Rewrite from the current evidence, removing those claims. Do not substitute a different wording of the same unsupported promise.\nPrevious rejected candidate: ${JSON.stringify(result)}` });
    result = parseSupportEmailDraftResult(response.text);
    validationIssues = validateSupportEmailDraft(result.reply, context);
  }
  if (validationIssues.length) {
    throw Object.assign(new Error('The generated reply needs correction before it can be offered. Please regenerate or write a reply.'), {
      code: 'SUPPORT_DRAFT_GROUNDING_FAILED', status: 422, validationIssues
    });
  }
  const validEvidenceIds = new Set([
    context.original.evidenceId,
    ...context.messages.map((m) => m.evidenceId),
    ...context.attachments.files.map((a) => a.evidenceId),
    ...context.attachments.conversationFiles.map((a) => a.evidenceId),
    ...context.attachments.unattributedFiles.map((a) => a.evidenceId),
    ...context.verifiedFacts.map((f) => f.evidenceId),
    ...context.verifiedActions.map((a) => a.evidenceId)
  ]);
  if (result.usedEvidenceIds.some((id) => !validEvidenceIds.has(id))) reviewWarnings.push('unrecognized_model_citation');
  // The sender appends its verified identity/signature at delivery. Keeping this
  // body unsigned prevents an old draft speaking as a previous ticket claimant.
  return {
    text: result.reply,
    status: 'needs_review',
    suppressed: false,
    suppressionReason: null,
    modelName: response.modelName,
    provider: response.provider,
    latencyMs: response.latencyMs,
    metadata: {
      ...baseMetadata,
      correctedDraft,
      knowledgeSources: summarizeLibrarySources(knowledgeMatches),
      draftSources: [...baseMetadata.draftSources, ...knowledgeMatches.map((m) => ({ type: m.retrievalSource === 'library' || !m.retrievalSource ? 'reply_library' : 'historical_reply', id: m.id, label: m.title, detail: m.retrievalSource || 'library' }))],
      usedEvidenceIds: result.usedEvidenceIds.filter((id) => validEvidenceIds.has(id)),
      unresolvedFacts: [...new Set([...context.unresolvedFacts, ...result.unresolvedFacts])],
      proposedFollowUps: result.proposedFollowUps,
      reviewWarnings: [...reviewWarnings, ...result.reviewNotes]
    }
  };
}

export { buildSupportEmailDraftContext, buildSupportEmailDraftPrompt };
