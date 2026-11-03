import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClinicalNoteVersionHistory from '../ClinicalNoteVersionHistory.vue';
import api from '../../../services/api.js';

vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
const original = () => ({ id: 10, revisionNumber: 1, origin: 'original', status: 'original', contentHash: 'original-hash', createdAt: '2026-11-01T17:00:00Z', signatures: [{ id: 1, action: 'initial_author_sign', actorUserId: 9, signedAt: '2026-11-01T17:00:00Z', contentHash: 'original-hash' }], capabilities: {}, snapshot: { title: 'DEMO QA note', notePayload: { sections: { Subjective: 'DEMO QA original narrative', Plan: 'Original plan' }, meta: { preserve: true } }, metadataJson: { structuredChart: { participants: 'DEMO QA client', patientPresent: true } }, encounterContext: { dateOfService: '2026-11-01', durationMinutes: 45, serviceCode: '90834', serviceLocationId: 5, locationLabel: 'DEMO QA Office', placeOfService: '11', startTime: '10:00', endTime: '10:45', participants: 'DEMO QA client', patientPresent: true, clinicalSessionId: 100 } } });
const revision = (overrides = {}) => ({ ...original(), id: 11, revisionNumber: 2, origin: 'provider', status: 'awaiting_author_signature', reason: 'DEMO QA clarification', proposedByUserId: 9, originalAuthorUserId: 9, responsibleSupervisorUserId: 8, requiresSupervisorCosign: true, contentHash: 'amended-hash', signatures: [], capabilities: {}, ...overrides });
const summary = (pending = null, caps = {}) => ({ originalRevisionId: 10, effectiveRevisionId: 10, pendingRevisionId: pending?.id || null, revisions: [original(), ...(pending ? [pending] : [])], effectiveRevision: original(), pendingRevision: pending, capabilities: caps });
let response;
const mountHistory = () => mount(ClinicalNoteVersionHistory, { attachTo: document.body, props: { noteId: 71, agencyId: 2, preferPending: true } });
const field = (w, id) => w.get(`[data-testid="${id}"]`);
beforeEach(() => { vi.resetAllMocks(); response = summary(); api.get.mockImplementation(async url => ({ data: url.includes('service-locations') ? { items: [{ id: 5, name: 'DEMO QA Office', place_of_service: '11', is_active: 1 }, { id: 6, name: 'DEMO QA School', place_of_service: '03', is_active: 1 }, { id: 7, name: 'DEMO QA Inactive', place_of_service: '11', is_active: 0 }] } : response })); });

describe('immutable signed note version history', () => {
  it('keeps the original narrative and exact signature fingerprint read only while an amendment is pending', async () => {
    response = summary(revision()); const w = mountHistory(); await flushPromises();
    expect(w.text()).toContain('Latest approved: version 1'); expect(w.text()).toContain('Pending: version 2');
    await field(w, 'version-select').setValue('10');
    expect(w.text()).toContain('DEMO QA original narrative'); expect(w.text()).toContain('Version 1 · revision #10 · fingerprint original-hash');
    expect(w.findAll('textarea')).toHaveLength(0); expect(w.find('[data-testid="sign-version"]').exists()).toBe(false);
    expect(w.findAll('button').some(button => /delete/i.test(button.text()))).toBe(false); w.unmount();
  });
  it('labels observed legacy dates without inventing a new signature over the captured snapshot', async () => {
    const legacy = { ...original(), signatures: [], provenance: { kind: 'legacy_observed', observedAt: '2026-11-03T17:00:00Z', legacyProviderSignedAt: '2026-11-01T17:00:00Z', legacyProviderSignedByUserId: 9 } };
    response = { ...summary(), revisions: [legacy], effectiveRevision: legacy }; const w = mountHistory(); await flushPromises();
    expect(w.text()).toContain('Legacy record captured'); expect(w.text()).toContain('do not establish a new signature'); expect(w.text()).toContain('Legacy author: User #9');
    expect(w.findAll('.revision-signatures article')).toHaveLength(0); w.unmount();
  });
  it('signs a provider or billing proposal as the original author and leaves supervisor approval pending', async () => {
    const pending = revision({ origin: 'billing', proposedByUserId: 22, capabilities: { canSign: true } }); response = summary(pending);
    const w = mountHistory(); await flushPromises(); expect(w.text()).toContain('Proposed by billing: User #22');
    const signed = { ...pending, status: 'awaiting_supervisor_signature', capabilities: {} };
    api.post.mockImplementation(async () => { response = summary(signed); return { data: { ...response, revision: signed } }; });
    await field(w, 'version-attestation').setValue(true); await field(w, 'sign-version').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/medical-billing/notes/71/versions/11/sign', { agencyId: 2, expectedContentHash: 'amended-hash', attested: true }, { skipGlobalLoading: true });
    expect(w.text()).toContain('Latest approved: version 1'); expect(w.text()).toContain('Awaiting responsible supervisor signature');
    expect(w.emitted('changed')[0][0].action).toBe('sign'); w.unmount();
  });
  it('lets a biller save an attributed proposal but offers no clinical signature', async () => {
    response = summary(null, { canCreateBilling: true }); const w = mountHistory(); await flushPromises();
    await field(w, 'create-amendment').trigger('click'); await flushPromises();
    await field(w, 'version-reason').setValue('DEMO QA incorrect service context'); await field(w, 'revision-narrative-Subjective').setValue('DEMO QA proposed clarification');
    const pending = revision({ origin: 'billing', proposedByUserId: 22, capabilities: {} });
    api.post.mockImplementation(async () => { response = summary(pending, { canCreateBilling: true }); return { data: { ...response, revision: pending } }; });
    await field(w, 'save-version-draft').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/medical-billing/notes/71/versions', expect.objectContaining({ origin: 'billing', baseRevisionId: 10, expectedContentHash: 'original-hash', reason: 'DEMO QA incorrect service context', notePayload: { sections: { Subjective: 'DEMO QA proposed clarification', Plan: 'Original plan' }, meta: { preserve: true } } }), { skipGlobalLoading: true });
    expect(w.find('[data-testid="version-attestation"]').exists()).toBe(false); expect(w.find('[data-testid="sign-version"]').exists()).toBe(false); w.unmount();
  });
  it('submits a supervisor amendment with one final signature and emits completion only after approval', async () => {
    response = summary(null, { canCreateSupervisor: true }); const w = mountHistory(); await flushPromises();
    await field(w, 'create-amendment').trigger('click'); await flushPromises();
    await field(w, 'version-reason').setValue('DEMO QA corrected service time'); await field(w, 'revision-durationMinutes').setValue('50');
    await field(w, 'revision-serviceLocationId').setValue('6'); expect(w.text()).not.toContain('DEMO QA Inactive');
    await field(w, 'supervisor-draft-attestation').setValue(true); await field(w, 'revision-endTime').setValue('10:50');
    expect(field(w, 'supervisor-draft-attestation').element.checked).toBe(false); await field(w, 'supervisor-draft-attestation').setValue(true);
    const saved = revision({ origin: 'supervisor', status: 'draft', capabilities: { canCosign: true } }); let resolveSign;
    api.post.mockImplementation(url => url.endsWith('/cosign') ? new Promise(resolve => { resolveSign = resolve; }) : Promise.resolve({ data: { ...summary(saved), revision: saved } }));
    expect(field(w, 'save-version-draft').text()).toBe('Sign & submit amended version'); await field(w, 'save-version-draft').trigger('submit'); await flushPromises();
    expect(w.emitted('changed')).toBeUndefined(); expect(api.post).toHaveBeenNthCalledWith(1, '/medical-billing/notes/71/versions', expect.objectContaining({ encounterContext: expect.objectContaining({ durationMinutes: 50, serviceLocationId: 6, locationLabel: 'DEMO QA School', placeOfService: '03' }) }), { skipGlobalLoading: true });
    expect(api.post).toHaveBeenNthCalledWith(2, '/medical-billing/notes/71/versions/11/cosign', { agencyId: 2, expectedContentHash: 'amended-hash', attested: true }, { skipGlobalLoading: true });
    const approved = { ...saved, status: 'approved', capabilities: {}, signatures: [{ id: 2, action: 'supervisor_sign', actorUserId: 8, signedAt: '2026-11-03T17:00:00Z', contentHash: 'amended-hash' }] };
    response = { ...summary(), effectiveRevisionId: 11, effectiveRevision: approved, revisions: [original(), approved] }; resolveSign({ data: { ...response, revision: approved } }); await flushPromises();
    expect(w.emitted('changed')).toHaveLength(1); expect(w.emitted('changed')[0][0]).toMatchObject({ action: 'cosign', revision: { status: 'approved' } });
    expect(w.text()).toContain('Latest approved: version 2'); expect(w.find('[data-testid="version-attestation"]').exists()).toBe(false); w.unmount();
  });
  it('retains the saved supervisor draft after a failed final signature without claiming completion', async () => {
    response = summary(null, { canCreateSupervisor: true }); const w = mountHistory(); await flushPromises(); await field(w, 'create-amendment').trigger('click'); await flushPromises(); await field(w, 'version-reason').setValue('DEMO QA correction'); await field(w, 'supervisor-draft-attestation').setValue(true);
    const saved = revision({ origin: 'supervisor', status: 'draft', capabilities: { canCosign: true, canEdit: true } });
    api.post.mockImplementation(async url => { if (url.endsWith('/cosign')) throw { response: { status: 503, data: { error: { message: 'DEMO QA signature unavailable' } } } }; return { data: { ...summary(saved), revision: saved } }; });
    await field(w, 'save-version-draft').trigger('submit'); await flushPromises();
    expect(w.text()).toContain('Amendment draft saved. DEMO QA signature unavailable'); expect(field(w, 'sign-version').text()).toBe('Sign & submit amended version'); expect(w.emitted('changed')).toBeUndefined(); w.unmount();
  });
  it('requires refresh and a new attestation after a stale revision conflict', async () => {
    response = summary(revision({ capabilities: { canSign: true } })); api.post.mockRejectedValue({ response: { status: 409, data: { error: { message: 'DEMO QA revision changed. Refresh before signing.' } } } });
    const w = mountHistory(); await flushPromises(); await field(w, 'version-attestation').setValue(true); await field(w, 'sign-version').trigger('submit'); await flushPromises();
    expect(w.text()).toContain('revision changed'); expect(field(w, 'version-attestation').element.checked).toBe(false); expect(field(w, 'sign-version').element.disabled).toBe(true); expect(w.emitted('changed')).toBeUndefined(); w.unmount();
  });
  it('records original-author acknowledgement separately from a supervisor signature', async () => {
    const approved = revision({ origin: 'supervisor', status: 'approved', capabilities: { canAcknowledge: true } }); response = { ...summary(), effectiveRevisionId: 11, effectiveRevision: approved, revisions: [original(), approved] };
    api.post.mockImplementation(async () => { const acknowledged = { ...approved, capabilities: {} }; response = { ...response, effectiveRevision: acknowledged, revisions: [original(), acknowledged] }; return { data: { ...response, revision: acknowledged } }; });
    const w = mountHistory(); await flushPromises(); expect(field(w, 'sign-version').text()).toBe('Acknowledge reviewed amendment'); await field(w, 'version-attestation').setValue(true); await field(w, 'sign-version').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/medical-billing/notes/71/versions/11/acknowledge', { agencyId: 2, expectedContentHash: 'amended-hash', attested: true }, { skipGlobalLoading: true }); w.unmount();
  });
  it('does not invent success when a signature response lacks the confirmed revision', async () => {
    response = summary(revision({ capabilities: { canSign: true } })); api.post.mockResolvedValue({ data: { ok: true } }); const w = mountHistory(); await flushPromises(); await field(w, 'version-attestation').setValue(true); await field(w, 'sign-version').trigger('submit'); await flushPromises();
    expect(w.text()).toContain('did not confirm this signature'); expect(w.emitted('changed')).toBeUndefined(); w.unmount();
  });
  it('does not deliver a late signature completion to a different selected note', async () => {
    const pending = revision({ capabilities: { canSign: true } }); response = summary(pending); let resolveSign;
    api.post.mockReturnValue(new Promise(resolve => { resolveSign = resolve; }));
    const w = mountHistory(); await flushPromises(); await field(w, 'version-attestation').setValue(true); await field(w, 'sign-version').trigger('submit');
    await w.setProps({ noteId: 72 }); await flushPromises();
    resolveSign({ data: { revision: { ...pending, status: 'awaiting_supervisor_signature' } } }); await flushPromises();
    expect(w.emitted('changed')).toBeUndefined(); expect(w.text()).not.toContain('Signature recorded'); w.unmount();
  });
  it('reports a confirmed final supervisor submission even when the later history refresh fails', async () => {
    const pending = revision({ origin: 'supervisor', status: 'draft', capabilities: { canCosign: true } }); response = summary(pending);
    const w = mountHistory(); await flushPromises();
    api.post.mockResolvedValue({ data: { revision: { ...pending, status: 'approved' } } });
    api.get.mockRejectedValue(new Error('DEMO QA refresh unavailable'));
    await field(w, 'version-attestation').setValue(true); await field(w, 'sign-version').trigger('submit'); await flushPromises();
    expect(w.emitted('changed')).toHaveLength(1); expect(w.emitted('changed')[0][0]).toMatchObject({ action: 'cosign', revision: { status: 'approved' } }); w.unmount();
  });
  it('preserves legacy pending service fields as an unapproved draft and requires a new supervisor signature', async () => {
    response = summary(null, { canCreateSupervisor: true });
    const pending = { durationMinutes: 10, startTime: '10:00', endTime: '10:10', locationLabel: 'DEMO QA Virtual setting', placeOfService: '10', serviceLocationId: null, participants: 'Guardian: DEMO QA', patientPresent: false };
    const w = mount(ClinicalNoteVersionHistory, { props: { noteId: 71, agencyId: 2, legacyPendingServiceDetails: pending, legacyAmendment: { reason: 'DEMO QA verified guardian-only screening' } } }); await flushPromises();
    expect(w.text()).toContain('new signature is required'); await field(w, 'create-amendment').trigger('click'); await flushPromises();
    expect(field(w, 'revision-durationMinutes').element.value).toBe('10'); expect(field(w, 'revision-participants').element.value).toBe('Guardian: DEMO QA');
    expect(field(w, 'revision-serviceLocationId').text()).toContain('DEMO QA Virtual setting'); expect(field(w, 'version-reason').element.value).toContain('guardian-only');
    expect(field(w, 'supervisor-draft-attestation').element.checked).toBe(false); expect(field(w, 'save-version-draft').element.disabled).toBe(true);
    expect(response.effectiveRevision.snapshot.encounterContext.durationMinutes).toBe(45); expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });
  it('shows independent additions with their own signatures and binds approval to the entry manifest', async () => {
    const pending=revision({capabilities:{canSign:true},entryManifestHash:'DEMO-QA-entry-manifest',currentAddenda:[{id:44,entry_kind:'addendum',body:'DEMO QA independent signed addition',created_by_user_id:77,author_signed_at:'2026-11-03T16:00:00Z',revision_signature_id:31,signature_content_hash:'DEMO-QA-entry-signature'}]});
    response=summary(pending);api.post.mockResolvedValue({data:{revision:{...pending,status:'awaiting_supervisor_signature'}}});
    const w=mountHistory();await flushPromises();expect(w.get('[aria-label="Independent additions included in this review"]').text()).toContain('DEMO QA independent signed addition');expect(w.text()).toContain('User #77');expect(w.text()).toContain('DEMO-QA-entry-signature');
    await field(w,'version-attestation').setValue(true);await field(w,'sign-version').trigger('submit');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/71/versions/11/sign',{agencyId:2,expectedContentHash:'amended-hash',expectedEntryManifestHash:'DEMO-QA-entry-manifest',attested:true},{skipGlobalLoading:true});w.unmount();
  });
  it('does not auto-sign newly arrived additions during a combined supervisor save and submit',async()=>{
    const base={...original(),entryManifestHash:'DEMO-QA-before'};response={...summary(null,{canCreateSupervisor:true}),revisions:[base],effectiveRevision:base};
    const w=mountHistory();await flushPromises();await field(w,'create-amendment').trigger('click');await flushPromises();await field(w,'version-reason').setValue('DEMO QA clarification');await field(w,'supervisor-draft-attestation').setValue(true);
    const saved=revision({origin:'supervisor',status:'draft',entryManifestHash:'DEMO-QA-after',capabilities:{canCosign:true},currentAddenda:[{id:44,body:'DEMO QA addition arrived during draft save',created_by_user_id:77,author_signed_at:'2026-11-03T16:00:00Z'}]});api.post.mockResolvedValue({data:{...summary(saved),revision:saved}});
    await field(w,'save-version-draft').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledTimes(1);expect(w.emitted('changed')).toBeUndefined();expect(w.text()).toContain('Separate additions changed');expect(w.text()).toContain('DEMO QA addition arrived during draft save');expect(field(w,'version-attestation').element.checked).toBe(false);w.unmount();
  });
  it('starts a single signed version collapsed and opens directly from Create amendment', async () => {
    response = summary(null, { canCreateSupervisor: true }); const w = mountHistory(); await flushPromises();
    expect(field(w, 'toggle-version-history').attributes('aria-expanded')).toBe('false');
    expect(field(w, 'version-history-body').isVisible()).toBe(false);
    expect(field(w, 'create-amendment').isVisible()).toBe(true);
    await field(w, 'create-amendment').trigger('click'); await flushPromises();
    expect(field(w, 'version-history-body').isVisible()).toBe(true); expect(field(w, 'version-reason').isVisible()).toBe(true);
    await field(w, 'version-reason').setValue('DEMO QA retained draft');
    await field(w, 'toggle-version-history').trigger('click');
    expect(field(w, 'version-history-body').isVisible()).toBe(false);
    await field(w, 'toggle-version-history').trigger('click');
    expect(field(w, 'version-reason').element.value).toBe('DEMO QA retained draft'); expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });
  it('opens multiple versions and pending review, permits folding, and opens an explicitly requested revision', async () => {
    response = summary(revision({ capabilities: { canSign: true } })); const w = mountHistory(); await flushPromises();
    expect(field(w, 'toggle-version-history').attributes('aria-expanded')).toBe('true');
    await field(w, 'toggle-version-history').trigger('click'); expect(field(w, 'version-history-body').isVisible()).toBe(false);
    await w.vm.openRevision(11); await flushPromises();
    expect(field(w, 'version-history-body').isVisible()).toBe(true); expect(field(w, 'version-attestation').isVisible()).toBe(true);
    response = summary(); await w.setProps({ noteId: 72 }); await flushPromises();
    expect(field(w, 'toggle-version-history').attributes('aria-expanded')).toBe('false'); w.unmount();
  });
  it('opens retained multi-version history even after all approval work is complete', async () => {
    const approved = revision({ status: 'approved' }); response = { ...summary(), effectiveRevisionId: 11, effectiveRevision: approved, revisions: [original(), approved] };
    const w = mountHistory(); await flushPromises(); expect(field(w, 'version-history-body').isVisible()).toBe(true);
    await field(w, 'toggle-version-history').trigger('click'); expect(field(w, 'version-history-body').isVisible()).toBe(false); w.unmount();
  });
  it('synchronizes duration then start, and later endpoint edits recalculate duration', async () => {
    response = summary(null, { canCreateSupervisor: true }); const w = mountHistory(); await flushPromises(); await field(w, 'create-amendment').trigger('click'); await flushPromises();
    await field(w, 'revision-durationMinutes').setValue('10'); await field(w, 'revision-startTime').setValue('10:45');
    expect(field(w, 'revision-endTime').element.value).toBe('10:55');
    await field(w, 'revision-startTime').setValue('10:50'); expect(field(w, 'revision-durationMinutes').element.value).toBe('5');
    await field(w, 'revision-startTime').setValue('10:45'); await field(w, 'revision-endTime').setValue('11:00');
    expect(field(w, 'revision-durationMinutes').element.value).toBe('15'); expect(field(w, 'revision-startTime').element.value).toBe('10:45');
    await field(w, 'revision-durationMinutes').setValue('20'); expect(field(w, 'revision-endTime').element.value).toBe('11:05');
    expect(response.effectiveRevision.snapshot.encounterContext).toMatchObject({ durationMinutes: 45, startTime: '10:00', endTime: '10:45' });
    expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });
  it('synchronizes duration then end by backfilling start over previously saved times', async () => {
    response = summary(null, { canCreateSupervisor: true }); const w = mountHistory(); await flushPromises(); await field(w, 'create-amendment').trigger('click'); await flushPromises();
    await field(w, 'revision-durationMinutes').setValue('10'); await field(w, 'revision-endTime').setValue('10:55');
    expect(field(w, 'revision-startTime').element.value).toBe('10:45'); expect(field(w, 'revision-durationMinutes').element.value).toBe('10');
    await field(w, 'revision-startTime').setValue('10:50'); expect(field(w, 'revision-durationMinutes').element.value).toBe('5'); w.unmount();
  });
  it('fills a blank duration from explicitly entered start and end times', async () => {
    response = summary(null, { canCreateSupervisor: true }); const w = mountHistory(); await flushPromises(); await field(w, 'create-amendment').trigger('click'); await flushPromises();
    await field(w, 'revision-durationMinutes').setValue(''); await field(w, 'revision-startTime').setValue(''); await field(w, 'revision-endTime').setValue('');
    await field(w, 'revision-startTime').setValue('10:45'); await field(w, 'revision-endTime').setValue('10:55');
    expect(field(w, 'revision-durationMinutes').element.value).toBe('10'); w.unmount();
  });
  it('fills only missing draft timing and leaves the saved version unchanged', async () => {
    const base = original(); base.snapshot.encounterContext = { ...base.snapshot.encounterContext, durationMinutes: '', startTime: '10:45', endTime: '10:55' };
    response = { ...summary(null, { canCreateSupervisor: true }), effectiveRevision: base, revisions: [base] };
    const w = mountHistory(); await flushPromises(); await field(w, 'create-amendment').trigger('click'); await flushPromises();
    expect(field(w, 'revision-durationMinutes').element.value).toBe('10'); expect(base.snapshot.encounterContext.durationMinutes).toBe(''); w.unmount();
  });
  it('does not invent a different service date when an automatic time would cross midnight', async () => {
    response = summary(null, { canCreateSupervisor: true }); const w = mountHistory(); await flushPromises(); await field(w, 'create-amendment').trigger('click'); await flushPromises();
    await field(w, 'revision-durationMinutes').setValue('10'); await field(w, 'revision-startTime').setValue('23:55');
    expect(field(w, 'revision-endTime').element.value).toBe(''); expect(field(w, 'service-time-feedback').text()).toContain('cross midnight');
    expect(field(w, 'revision-dateOfService').element.value).toBe('2026-11-01'); expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });

});
