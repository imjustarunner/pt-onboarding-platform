import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessSupportEmailDraftReuse, generateSupportEmailDraft } from '../supportEmailDraft.service.js';
import { encryptChatText } from '../chatEncryption.service.js';
import { buildSupportEmailDraftContext, classifySupportEmailDraft, validateSupportEmailDraft } from '../../utils/supportEmailDraft.shared.js';

const ticket = {
  id: 51, agency_id: 2, school_organization_id: 9, source_channel: 'email',
  source_email_from: 'counselor@example.edu', subject: 'Referral packet and portal trouble',
  question: 'Here is the referral packet. The portal will not let me sign in.',
  claimed_by_user_id: 8, created_at: '2026-10-20T08:00:00Z'
};
const claimant = { id: 8, first_name: 'Alex', last_name: 'Rivera', email: 'personal@example.com' };
const input = (more = {}) => ({ ticket, claimant, knowledgeMatches: [], promptNotes: [], ...more });
const model = (reply, extra = {}) => async () => ({ text: JSON.stringify({ reply, ...extra }), modelName: 'test-model', provider: 'vertex' });

describe('evidence-grounded support drafts', () => {
  it('uses the latest follow-up and carries forward earlier constraints, excluding internal/deleted notes', async () => {
    let captured;
    const result = await generateSupportEmailDraft(input({ messages: [
      { id: 1, author_role: 'school_staff', body: 'Tuesdays are unavailable, and Thursdays are half-days.', created_at: '2026-10-20T08:00:00Z' },
      { id: 2, author_role: 'admin', body: 'PRIVATE internal family discussion', is_internal: 1 },
      { id: 3, author_role: 'school_staff', body: 'Deleted private detail', is_deleted: 1 },
      { id: 4, author_role: 'school_staff', body: 'Would Monday work instead?', created_at: '2026-10-21T08:00:00Z' }
    ] }), { generateText: async (args) => { captured = args; return model('Thanks for suggesting Monday. The provider’s Monday availability still needs confirmation.')(); } });
    assert.equal(result.metadata.latestInboundMessageId, 4);
    assert.match(captured.prompt, /Tuesdays are unavailable/);
    assert.match(captured.prompt, /Would Monday work instead/);
    assert.doesNotMatch(captured.prompt, /PRIVATE internal family|Deleted private/);
    assert.equal(captured.vertexOnly, true);
    assert.equal(captured.sensitive, true);
    assert.equal(captured.allowModelFallback, false);
    assert.equal(result.status, 'needs_review');
  });

  it('decrypts the original received email and a follow-up before generation', async (t) => {
    const oldKey = process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
    process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 4).toString('base64');
    t.after(() => { if (oldKey == null) delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64; else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = oldKey; });
    const first = encryptChatText('Original encrypted request');
    const last = encryptChatText('Follow-up encrypted request');
    let prompt;
    await generateSupportEmailDraft(input({
      ticket: { ...ticket, question: null, question_ciphertext: first.ciphertextB64, question_iv: first.ivB64, question_auth_tag: first.authTagB64, question_encryption_key_id: first.keyId },
      messages: [{ id: 12, author_role: 'school_staff', body: null, body_ciphertext: last.ciphertextB64, body_iv: last.ivB64, body_auth_tag: last.authTagB64, encryption_key_id: last.keyId }]
    }), { generateText: async (args) => { prompt = args.prompt; return model('Thank you for clarifying the request.')(); } });
    assert.match(prompt, /Original encrypted request/);
    assert.match(prompt, /Follow-up encrypted request/);
    assert.doesNotMatch(prompt, new RegExp(first.ciphertextB64.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('fails closed when email contents cannot be decrypted', async () => {
    const result = await generateSupportEmailDraft(input({ ticket: { ...ticket, question: '[Unable to decrypt]' } }), { generateText: () => assert.fail('must not call the model') });
    assert.equal(result.suppressionReason, 'conversation_unavailable');
    assert.equal(result.text, '');
  });

  it('waits for attachment ingestion instead of drafting a resend request', async () => {
    const result = await generateSupportEmailDraft(input({ intakeComplete: false }), { generateText: () => assert.fail('must wait for ingestion') });
    assert.equal(result.suppressionReason, 'attachment_ingestion_incomplete');
  });

  it('provides attachment receipt separately from content review and rejects a false missing-file claim', async () => {
    let prompt;
    await assert.rejects(generateSupportEmailDraft(input({ attachments: [{ id: 7, file_name: 'referral.pdf', mime_type: 'application/pdf', created_at: ticket.created_at }] }), {
      generateText: async (args) => { prompt = args.prompt; return model('I do not see any attachments. Please resend the packet.')(); }
    }), (error) => error.validationIssues.includes('contradicts_attachment_receipt'));
    assert.match(prompt, /referral\.pdf/);
    assert.match(prompt, /"contentReviewed": false/);
  });

  it('separates named therapists from unconfirmed client matches without leaking clinical notes', () => {
    const context = buildSupportEmailDraftContext(input({
      ticket: { ...ticket, client_id: 20, ai_draft_metadata_json: { matchReason: 'ambiguous', extractedClientReferences: ['Taylor', 'Morgan'] } },
      client: { id: 20, initials: 'AB', provider_name: 'Taylor Morgan', clinical_notes: 'Private diagnosis', email: 'family@example.net' },
      participants: [{ name: 'Jordan Lee', role: 'therapist', source: 'Current school assignment' }]
    }));
    assert.ok(context.unresolvedFacts.includes('client_identity_ambiguous'));
    assert.ok(context.participants.some((p) => p.name === 'Taylor Morgan' && p.role.includes('not the client')));
    assert.doesNotMatch(JSON.stringify(context), /Private diagnosis|family@example\.net|personal@example\.com/);
  });

  it('preserves an explicit sender-stated client-to-provider request without claiming an assignment', () => {
    const context = buildSupportEmailDraftContext(input({ ticket: { ...ticket, question: 'This is the packet for CaseOne to see Jordan virtually. The portal is down.' }, attachments: [{ id: 1, file_name: 'packet.pdf', created_at: ticket.created_at }] }));
    assert.deepEqual(context.referralRelationships, [{ client: 'CaseOne', requestedProvider: 'Jordan', source: 'ticket:51:received', status: 'sender_requested_not_verified_assignment' }]);
    assert.ok(context.participants.some((p) => p.name === 'Jordan' && p.role.includes('not a verified assignment')));
    assert.ok(validateSupportEmailDraft("I see Jordan's referral to CaseOne.", context).includes('reversed_referral_participants'));
    assert.ok(validateSupportEmailDraft('I see the packet for Jordan to see CaseOne.', context).includes('reversed_referral_participants'));
    assert.deepEqual(validateSupportEmailDraft('Thanks for sending the referral packet while the portal is down. I will review it and follow up.', context), []);
    const unclear = buildSupportEmailDraftContext(input({ ticket: { ...ticket, question: 'I have a referral for the student to see someone next week.' } }));
    assert.deepEqual(unclear.referralRelationships, []);
  });

  it('does not invent paperwork prerequisites or a follow-up deadline', () => {
    const context = buildSupportEmailDraftContext(input());
    assert.ok(validateSupportEmailDraft('Once the family returns the referral packets, we can proceed with intake.', context).includes('unsupported_paperwork_prerequisite'));
    assert.ok(validateSupportEmailDraft('I will follow up with you shortly.', context).includes('unsupported_follow_up_timing'));
    assert.deepEqual(validateSupportEmailDraft('I will check what options may be available and follow up with you.', context), []);
  });

  it('does not accept a supplied signature from someone other than the ticket claimant', () => {
    const context = buildSupportEmailDraftContext(input({ claimant: { ...claimant, id: 99 } }));
    assert.equal(context.claimant.name, null);
    assert.ok(context.unresolvedFacts.includes('claimant_identity_unconfirmed'));
  });

  it('requires provenance and explicit shareability for additional app facts', () => {
    const context = buildSupportEmailDraftContext(input({ verifiedFacts: [
      { key: 'private', value: 'secret', source: 'Internal note' },
      { key: 'guess', value: 'Friday', shareable: true },
      { key: 'assigned_day', value: 'Monday', source: 'Current schedule', shareable: true }
    ] }));
    assert.deepEqual(context.verifiedFacts.map((f) => f.key), ['assigned_day']);
  });

  it('preserves caller-reported missing context as unknowns rather than app facts', () => {
    const context = buildSupportEmailDraftContext(input({ contextUnknowns: ['linked_client_context_unavailable', 'assigned_provider_unconfirmed'] }));
    assert.ok(context.unresolvedFacts.includes('linked_client_context_unavailable'));
    assert.ok(context.unresolvedFacts.includes('assigned_provider_unconfirmed'));
    assert.deepEqual(context.verifiedFacts, []);
  });

  it('changes evidence fingerprint after a new attachment, message, or claimant', () => {
    const original = buildSupportEmailDraftContext(input()).evidenceFingerprint;
    for (const more of [
      { attachments: [{ id: 1, file_name: 'packet.pdf' }] },
      { messages: [{ id: 22, body: 'New detail', author_role: 'school_staff' }] },
      { ticket: { ...ticket, claimed_by_user_id: 10 }, claimant: { id: 10, name: 'Other Staff' } }
    ]) assert.notEqual(buildSupportEmailDraftContext(input(more)).evidenceFingerprint, original);
  });

  it('labels historical evidence and standards honestly, without calling them approved templates', async () => {
    let prompt;
    const result = await generateSupportEmailDraft(input({ knowledgeMatches: [{ id: 'past-7', title: 'Earlier portal request', retrievalSource: 'gmail_sent', historicalQuestion: 'How do I sign in?', bodyTemplate: 'You should have received an email.' }] }), {
      generateText: async (args) => { prompt = args.prompt; return model('What error appears when you try to sign in?')(); }
    });
    assert.match(prompt, /NOT approved style examples/);
    assert.match(prompt, /Previous request: How do I sign in/);
    assert.equal(result.metadata.knowledgeSources[0].approvalStatus, 'unreviewed_history');
    assert.ok(result.metadata.standards.every((s) => s.approval === 'not_reviewed_by_rachel'));
  });

  it('rejects placeholder signatures and unsupported completed actions', () => {
    const context = buildSupportEmailDraftContext(input());
    assert.ok(validateSupportEmailDraft('Thanks, [Your Name]', context).includes('unresolved_placeholder'));
    assert.ok(validateSupportEmailDraft('I have reviewed the packet and updated the account.', context).includes('unsupported_completed_action'));
    assert.ok(validateSupportEmailDraft('We sent the referral yesterday.', context).includes('unsupported_completed_action'));
  });

  it('does not let an unaccepted promise masquerade as an owned next step', () => {
    const context = buildSupportEmailDraftContext(input());
    assert.deepEqual(validateSupportEmailDraft("I'll review the packet and follow up.", context), []);
    assert.ok(validateSupportEmailDraft("I'll upload the packet.", context).includes('unaccepted_follow_up_commitment'));
    const assigned = buildSupportEmailDraftContext(input({ verifiedActions: [{ id: 1, title: 'Review packet', status: 'approved', ownerUserId: 8, source: 'Staff accepted follow-up' }] }));
    assert.deepEqual(validateSupportEmailDraft("I'll review the packet.", assigned), []);
    for (const reply of ["We'll get these uploaded.", "We'll have our team look into that.", 'I see three attachments and will get them routed for intake.', 'I will also pass along the login issue to our team.']) {
      assert.ok(validateSupportEmailDraft(reply, context).includes('unaccepted_follow_up_commitment'));
    }
    assert.deepEqual(validateSupportEmailDraft("I'll check on the login issue and get back to you.", context), []);
    assert.ok(validateSupportEmailDraft('We are checking on this schedule change.', context).includes('unsupported_action_in_progress'));
    assert.ok(validateSupportEmailDraft("We've received the referral packets.", context).includes('unsupported_attachment_receipt'));
    assert.ok(validateSupportEmailDraft('We have not yet received the referral packets.', context).includes('unsupported_document_receipt_status'));
  });

  it('corrects a rejected draft once before offering it to staff', async () => {
    let calls = 0;
    const result = await generateSupportEmailDraft(input(), { generateText: async (args) => {
      calls += 1;
      assert.match(args.systemInstruction, /Accuracy takes priority/);
      if (calls === 1) return model("We'll have our team look into the portal problem.")();
      assert.match(args.prompt, /QUALITY CORRECTION REQUIRED/);
      return model('What error appears when you try to sign in?')();
    } });
    assert.equal(calls, 2);
    assert.equal(result.metadata.correctedDraft, true);
  });

  it('retains proposed follow-ups internally, without inventing an approved task', async () => {
    const result = await generateSupportEmailDraft(input(), { generateText: model('Thanks for sending the referral. What error appears when you try to sign in?', { proposedFollowUps: ['Review received referral'], unresolvedFacts: ['Check portal login'], usedEvidenceIds: ['ticket:51:received', 'fake:source'] }) });
    assert.deepEqual(result.metadata.proposedFollowUps, ['Review received referral']);
    assert.deepEqual(result.metadata.usedEvidenceIds, ['ticket:51:received']);
    assert.ok(result.metadata.reviewWarnings.includes('unrecognized_model_citation'));
    assert.doesNotMatch(result.text, /Alex Rivera|Review received referral/);
  });

  it('suppresses voicemail, bounce and newsletter robot replies', () => {
    for (const [more, reason] of [
      [{ ticket: { ...ticket, subject: 'New voicemail', source_email_from: 'notifications@example.com', question: 'Listen to your voicemail.' } }, 'voicemail_requires_callback_review'],
      [{ ticket: { ...ticket, subject: 'Delivery status notification', source_email_from: 'mailer-daemon@example.com' } }, 'automated_notification'],
      [{ ticket: { ...ticket, subject: 'Monthly newsletter', question: 'Join our webinar. Unsubscribe here.' }, headers: { 'list-unsubscribe': '<link>' } }, 'marketing_or_newsletter']
    ]) assert.equal(classifySupportEmailDraft(buildSupportEmailDraftContext(input(more))).reason, reason);
  });

  it('does not suppress a human asking about a voicemail or newsletter', () => {
    const context = buildSupportEmailDraftContext(input({ ticket: { ...ticket, subject: 'Question about voicemail', question: 'I left a voicemail. Can you help with the referral?' } }));
    assert.equal(classifySupportEmailDraft(context).suppressed, false);
  });

  it('recognizes subscription marketing and informational broadcasts without suppressing group correspondence', () => {
    const headers = { 'list-unsubscribe': '<mailing-list>' };
    const marketing = buildSupportEmailDraftContext(input({ ticket: { ...ticket, subject: 'Attract more new patients', question: 'Get booked across booking channels. You only pay for new bookings. Unsubscribe.' }, headers }));
    assert.equal(classifySupportEmailDraft(marketing).reason, 'marketing_or_newsletter');
    const notice = buildSupportEmailDraftContext(input({ ticket: { ...ticket, subject: 'Reminder: Upcoming advisory meeting', question: 'Dear stakeholders, meeting materials and public comment details are available. Unsubscribe.' }, headers }));
    assert.equal(classifySupportEmailDraft(notice).reason, 'informational_broadcast');
    const reply = buildSupportEmailDraftContext(input({ ticket: { ...ticket, subject: 'Re: Reminder: Upcoming advisory meeting', question: 'Can you help me find the meeting materials? Unsubscribe.' }, headers }));
    assert.equal(classifySupportEmailDraft(reply).suppressed, false);
    const school = buildSupportEmailDraftContext(input({ ticket: { ...ticket, question: 'The portal is down. Here is our referral packet. Unsubscribe from this group.' }, headers }));
    assert.equal(classifySupportEmailDraft(school).suppressed, false);
  });

  it('suppresses historical broadcast intake after current-message provider headers are restored, without calling the model', async () => {
    const question = 'Get booked across booking channels. You only pay for new bookings. Unsubscribe.';
    const result = await generateSupportEmailDraft(input({ ticket: { ...ticket, subject: 'Attract more new patients', question,
      ai_draft_metadata_json: { inboundEmailHeaders: { autoSubmitted: '', listId: '', listUnsubscribe: true }, inboundEmailHeadersMessageId: 21 }
    }, messages: [{ id: 21, author_role: 'system_email', email_direction: 'inbound', body: question, created_at: ticket.created_at }] }), {
      generateText: () => assert.fail('restored broadcast evidence must suppress before generation')
    });
    assert.equal(result.status, 'suppressed');
    assert.equal(result.suppressionReason, 'marketing_or_newsletter');
  });

  it('does not apply stale automated-message headers to a later human reply', () => {
    const context = buildSupportEmailDraftContext(input({ ticket: { ...ticket,
      ai_draft_metadata_json: { inboundEmailHeaders: { autoSubmitted: 'auto-generated', listUnsubscribe: true }, inboundEmailHeadersMessageId: 1 }
    }, messages: [{ id: 2, author_role: 'school_staff', body: 'Could you help with this referral?', created_at: '2026-10-21T08:00:00Z' }] }));
    assert.equal(context.headers.autoSubmitted, '');
    assert.ok(context.unresolvedFacts.includes('latest_inbound_email_headers_unconfirmed'));
    assert.equal(classifySupportEmailDraft(context).suppressed, false);
  });

  it('reuses a readable draft only for identical current evidence and standards', () => {
    const args = input({ messages: [{ id: 2, body: 'Could you help with the login issue?', author_role: 'school_staff', created_at: ticket.created_at }] });
    const context = buildSupportEmailDraftContext(args);
    const snapshot = { id: 90, kind: 'draft', ticketId: ticket.id, agencyId: ticket.agency_id, sourceMessageId: 2,
      body: 'I will check on the login issue.', readable: true, provider: 'vertex', model: process.env.SUPPORT_EMAIL_DRAFT_MODEL || 'gemini-2.5-pro',
      sourceEvidence: { evidenceFingerprint: context.evidenceFingerprint, promptVersion: context.version } };
    assert.equal(assessSupportEmailDraftReuse(args, snapshot).reusable, true);
    for (const changed of [
      { headers: { listUnsubscribe: true } },
      { attachments: [{ id: 1, support_ticket_message_id: 2, file_name: 'packet.pdf' }] },
      { intakeComplete: false },
      { ticket: { ...ticket, claimed_by_user_id: 9 }, claimant: { id: 9, name: 'Other Staff' } }
    ]) assert.equal(assessSupportEmailDraftReuse({ ...args, ...changed }, snapshot).reusable, false);
    assert.equal(assessSupportEmailDraftReuse(args, { ...snapshot, readable: false }).reusable, false);
    assert.equal(assessSupportEmailDraftReuse(args, { ...snapshot, sourceEvidence: {} }).reusable, false);
    assert.equal(assessSupportEmailDraftReuse(args, { ...snapshot, sourceEvidence: { ...snapshot.sourceEvidence, promptVersion: 'older' } }).reusable, false);
  });

  it('freshly recovered broadcast headers invalidate a same-message snapshot without a model call', () => {
    const question = 'Get booked across booking channels. You only pay for new bookings. Unsubscribe.';
    const args = input({ ticket: { ...ticket, subject: 'Attract more new patients', question }, messages: [
      { id: 2, author_role: 'system_email', email_direction: 'inbound', body: question, created_at: ticket.created_at }
    ] });
    const oldContext = buildSupportEmailDraftContext(args);
    const snapshot = { id: 90, ticketId: ticket.id, agencyId: ticket.agency_id, sourceMessageId: 2,
      body: 'Thank you for reaching out.', readable: true, provider: 'vertex', model: process.env.SUPPORT_EMAIL_DRAFT_MODEL || 'gemini-2.5-pro',
      sourceEvidence: { evidenceFingerprint: oldContext.evidenceFingerprint, promptVersion: oldContext.version } };
    const decision = assessSupportEmailDraftReuse({ ...args, headers: { listUnsubscribe: true } }, snapshot);
    assert.equal(decision.reusable, false);
    assert.equal(decision.reason, 'current_evidence_suppressed');
    assert.equal(decision.classification.reason, 'marketing_or_newsletter');
    assert.equal(snapshot.body, 'Thank you for reaching out.');
    assert.equal(snapshot.sourceEvidence.evidenceFingerprint, oldContext.evidenceFingerprint);
  });

  it('rejects the older false not-attached phrasing against a completed attachment inventory', () => {
    const context = buildSupportEmailDraftContext(input({ attachments: [{ id: 1, file_name: 'packet.pdf', created_at: ticket.created_at }] }));
    const issues = validateSupportEmailDraft('It looks like the packets were not attached to this ticket.', context);
    assert.ok(issues.includes('contradicts_attachment_receipt'));
    assert.ok(issues.includes('ticket_language'));
  });

  it('keeps three older files as history when a new inbound arrives without attachments', () => {
    const messages = [
      { id: 1, body: ticket.question, author_role: 'school_staff', created_at: ticket.created_at },
      { id: 2, body: 'Could you check on the portal issue?', author_role: 'school_staff', created_at: '2026-10-21T08:00:00Z' }
    ];
    for (const linked of [true, false]) {
      const context = buildSupportEmailDraftContext(input({ messages, intakeMessageId: 2, attachments: [1,2,3].map(id => ({ id, file_name: `old-${id}.pdf`, support_ticket_message_id: linked ? 1 : null, created_at: '2026-10-20T08:00:01Z' })) }));
      assert.equal(context.attachments.currentMessageId, 2);
      assert.equal(context.attachments.files.length, 0);
      assert.equal(context.attachments.conversationFiles.length, 3);
      assert.ok(validateSupportEmailDraft('I can see the three attachments here.', context).includes('unsupported_current_attachment_receipt'));
      assert.deepEqual(validateSupportEmailDraft('I can see the three files from your earlier email. I will check on the login issue.', context), []);
    }
  });

  it('corrects a model that mistakes old attachments for the latest email and retains honest source labels', async () => {
    let calls = 0;
    const result = await generateSupportEmailDraft(input({ intakeMessageId: 2, messages: [
      { id: 1, body: ticket.question, author_role: 'school_staff', created_at: ticket.created_at },
      { id: 2, body: 'Could you check on the portal issue?', author_role: 'school_staff', created_at: '2026-10-21T08:00:00Z' }
    ], attachments: [1,2,3].map(id => ({ id, file_name: `old-${id}.pdf`, support_ticket_message_id: 1 })) }), {
      generateText: async (options) => {
        calls += 1;
        if (calls === 1) return model('I can see the three attachments here.')();
        assert.match(options.prompt, /unsupported_current_attachment_receipt/);
        return model('I will check on the portal issue and follow up.')();
      }
    });
    assert.equal(calls, 2);
    assert.equal(result.metadata.correctedDraft, true);
    assert.ok(result.metadata.draftSources.filter(source => source.type === 'attachment').every(source => source.detail.includes('not proof of receipt with the latest email')));
  });

  it('uses canonical support_ticket_message_id to separate a newly received file from earlier files', () => {
    const context = buildSupportEmailDraftContext(input({ intakeMessageId: 2, messages: [
      { id: 1, body: ticket.question, author_role: 'school_staff', created_at: ticket.created_at },
      { id: 2, body: 'Here is the corrected packet.', author_role: 'school_staff', created_at: '2026-10-21T08:00:00Z' }
    ], attachments: [
      { id: 1, file_name: 'packet.pdf', support_ticket_message_id: 1 },
      { id: 2, file_name: 'packet.pdf', support_ticket_message_id: 2 }
    ] }));
    assert.deepEqual(context.attachments.files.map(file => file.id), [2]);
    assert.deepEqual(context.attachments.conversationFiles.map(file => file.id), [1]);
    assert.equal(context.attachments.files[0].provenance, 'current_message_link');
  });

  it('does not invent receipt or missing-file claims from unattributed legacy files', () => {
    const context = buildSupportEmailDraftContext(input({ messages: [
      { id: 2, body: 'I sent the corrected packet. Can you help?', author_role: 'school_staff', created_at: '2026-10-21T08:00:00Z' }
    ], attachments: [{ id: 1, file_name: 'packet.pdf' }] }));
    assert.equal(context.attachments.files.length, 0);
    assert.equal(context.attachments.unattributedFiles.length, 1);
    assert.equal(context.attachments.currentMessageInventoryKnown, false);
    assert.ok(context.unresolvedFacts.includes('current_message_attachment_attribution_uncertain'));
    assert.ok(validateSupportEmailDraft('I can see the packet attached here.', context).includes('unsupported_current_attachment_receipt'));
    assert.ok(validateSupportEmailDraft('I do not see any attachments. Please resend the packet.', context).includes('unconfirmed_current_attachment_status'));
    assert.deepEqual(validateSupportEmailDraft('I will check on your request and follow up.', context), []);
  });

  it('preserves bounded legacy original-intake receipt while excluding later and manual files', () => {
    const context = buildSupportEmailDraftContext(input({ messages: [{ id: 1, body: ticket.question, author_role: 'school_staff', created_at: ticket.created_at }], attachments: [
      { id: 1, file_name: 'original.pdf', created_at: '2026-10-20 08:00:01' },
      { id: 2, file_name: 'later.pdf', created_at: '2026-10-21 08:00:01' },
      { id: 3, file_name: 'manual.pdf', created_at: '2026-10-20 08:00:01', uploaded_by_user_id: 8 }
    ] }));
    assert.deepEqual(context.attachments.files.map(file => file.id), [1]);
    assert.equal(context.attachments.files[0].provenance, 'legacy_original_intake_window');
    assert.deepEqual(context.attachments.unattributedFiles.map(file => file.id), [2,3]);
  });

  it('cannot reuse an ingestion completion flag bound to an earlier email', () => {
    const context = buildSupportEmailDraftContext(input({ ticket: { ...ticket, ai_draft_metadata_json: { attachmentsIngested: true, attachmentsIngestedMessageId: 1 } }, messages: [
      { id: 2, body: 'A new request', author_role: 'school_staff', created_at: '2026-10-21T08:00:00Z' }
    ] }));
    assert.equal(context.attachments.complete, false);
    assert.equal(classifySupportEmailDraft(context).reason, 'attachment_ingestion_incomplete');
  });

  it('continues with explicit provenance warnings when historical retrieval is unavailable', async () => {
    const args = input(); delete args.knowledgeMatches; delete args.promptNotes;
    const result = await generateSupportEmailDraft(args, { matchKnowledge: async () => { throw new Error('offline'); }, listPromptNotes: async () => { throw new Error('offline'); }, generateText: model('What error appears when you try to sign in?') });
    assert.ok(result.metadata.reviewWarnings.includes('historical_knowledge_unavailable'));
    assert.ok(result.metadata.reviewWarnings.includes('staff_feedback_unavailable'));
  });
});
