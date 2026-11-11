import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, DOMWrapper } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import Dialog from '../SecureSessionCommentDialog.vue';
import Host from '../SecureSessionCommentsHost.vue';
import History from '../SecureSessionCommentHistory.vue';
import Button from '../SecureSessionCommentButton.vue';
import Tip from '../SecureSessionCommentTip.vue';
import FamilySharingNotice from '../FamilySharingNotice.vue';
import FamilySharingNoticeHost from '../FamilySharingNoticeHost.vue';
import SecureFamilyAudience from '../SecureFamilyAudience.vue';
import { dispatchFamilySharingNoticeRequired } from '../../../utils/familySharingNotice';
import { activeTodayAppointments, canUseSessionComments, closeSecureSessionComment, openSecureSessionComment, requestCommentBadge, secureCommentState, setSecureCommentsScope } from '../sessionComments';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
let wrapper, router;
const appointment = (clientId = 4) => ({ id: 12, clientId, clientName: `Client ${clientId}`, startAt: new Date(Date.now() + 3600000).toISOString(), endAt: new Date(Date.now() + 7200000).toISOString(), timeZone: 'America/Denver', status: 'scheduled', providerName: 'Dr Avery', agencyId: 450 });
const comment = (id = 8, body = 'Private update') => ({ id, body, version: 1, author: { id: 3, name: 'Parent One' }, createdAt: '2026-11-11T15:00:00Z', isOwn: false, readAt: null, recipients: [{ id: 7, name: 'Dr Avery' }] });
const thread = (clientId = 4) => ({ appointment: appointment(clientId), comments: [comment()], recipients: [{ id: 7, name: 'Parent One', relationshipType: 'Guardian' }, { id: 9, name: 'Parent Two', relationshipType: 'Guardian' }], canWrite: true });
async function render(component, props = {}) {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:organizationSlug/:section', component: { template: '<div />' } }] });
  await router.push('/qa/my-schedule'); await router.isReady();
  wrapper = mount(component, { props, attachTo: document.body, global: { plugins: [router], provide: { secureSessionCommentsApi: api } } });
  const dom = new DOMWrapper(document.body);
  wrapper.find = dom.find.bind(dom); wrapper.findAll = dom.findAll.bind(dom); wrapper.text = dom.text.bind(dom);
  await flushPromises(); return wrapper;
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); secureCommentState.badges = {}; secureCommentState.revision = 0; secureCommentState.enabled = true; closeSecureSessionComment();
  api.get.mockImplementation(async url => ({ data: url === '/secure-family-sharing-notice' ? { version: '2026-11-11', acknowledged: true } : thread() })); api.post.mockResolvedValue({ data: {} });
});
afterEach(() => { wrapper?.unmount(); wrapper = null; closeSecureSessionComment(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

it('opens an authorized thread and acknowledges only the comments explicitly displayed', async () => {
  await render(Dialog, { appointmentId: 12, clientId: 4 });
  expect(wrapper.text()).toContain('Private update');
  expect(api.post).toHaveBeenCalledWith('/secure-session-comments/appointments/12/read', { clientId: 4, commentIds: [8], commentVersions: {8:1} }, expect.anything());
  expect(wrapper.text()).toContain('Shared with Dr Avery');
  expect(wrapper.find('[role=dialog]').attributes('aria-modal')).toBe('true');
});
it('saves the author’s single comment while retaining other people’s comments', async () => {
  api.post.mockImplementation(async url => ({ data: url.endsWith('/read') ? {} : { comment: { ...comment(10, 'Bring the chart'), isOwn: true } } }));
  await render(Dialog, { appointmentId: 12, clientId: 4 });
  await wrapper.find('textarea').setValue('Bring the chart');
  expect(wrapper.findAll('input[type=checkbox]')).toHaveLength(0);
  expect(wrapper.text()).toContain('Automatically shared with');
  await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/secure-session-comments/appointments/12', expect.objectContaining({ body: 'Bring the chart', clientId: 4, recipientUserIds: [7, 9], requestId: expect.any(String) }), expect.anything());
  expect(wrapper.text()).toContain('Private update'); expect(wrapper.text()).toContain('Bring the chart');
  expect(wrapper.find('form').exists()).toBe(false);
});
it('preserves unsent text on failure and reuses the same idempotency key on an unchanged retry', async () => {
  const ids = []; api.post.mockImplementation(async (url, body) => { if (url.endsWith('/read')) return { data: {} }; ids.push(body.requestId); throw { response: { data: { error: { message: 'Delivery confirmation unavailable' } } } }; });
  await render(Dialog, { appointmentId: 12, clientId: 4 });
  await wrapper.find('textarea').setValue('Care update');
  await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(wrapper.find('textarea').element.value).toBe('Care update'); expect(wrapper.text()).toContain('Delivery confirmation unavailable');
  await wrapper.find('form').trigger('submit'); await flushPromises(); expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
});
it('limits a comment to 250 Unicode codepoints while permitting 250 emoji', async () => {
  await render(Dialog, { appointmentId: 12, clientId: 4 });
  await wrapper.find('textarea').setValue('a'.repeat(251)); expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeDefined(); expect(wrapper.text()).toContain('251 / 250 characters');
  await wrapper.find('textarea').setValue('🙂'.repeat(250)); expect(wrapper.text()).toContain('250 / 250 characters'); expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeUndefined();
});
it('finds an existing own comment outside the latest page and edits it instead of creating another', async () => {
  const mine = { ...comment(2, 'My earlier comment'), isOwn: true, version: 1 };
  api.get.mockImplementation(async url => ({ data: url === '/secure-family-sharing-notice' ? { version: '2026-11-11', acknowledged: true } : { ...thread(), ownComment: mine } }));
  api.patch.mockResolvedValue({ data: { comment: { ...mine, body: 'My concise edit', version: 2, editedAt: '2026-11-11T17:00:00Z' } } });
  await render(Dialog, { appointmentId: 12, clientId: 4 }); expect(wrapper.text()).toContain('My earlier comment'); expect(wrapper.find('form').exists()).toBe(false);
  await wrapper.findAll('button').find(b => b.text() === 'Edit my comment').trigger('click'); await wrapper.find('textarea').setValue('My concise edit'); await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(api.patch).toHaveBeenCalledWith('/secure-session-comments/appointments/12/comments/2', expect.objectContaining({ clientId: 4, body: 'My concise edit', expectedVersion: 1, recipientUserIds: [7,9] }), expect.anything());
  expect(api.post.mock.calls.some(([url]) => url === '/secure-session-comments/appointments/12')).toBe(false); expect(wrapper.text()).toContain('Edited ·'); expect(wrapper.find('form').exists()).toBe(false);
});
it('preserves an edit after a version conflict and requires reviewing the latest comment before overwriting', async () => {
  let version = 1;
  const mine = () => ({ ...comment(2, version === 1 ? 'Original saved comment' : 'Saved elsewhere'), isOwn: true, version });
  api.get.mockImplementation(async url => ({ data: url === '/secure-family-sharing-notice' ? { version: '2026-11-11', acknowledged: true } : { ...thread(), ownComment: mine() } }));
  api.patch.mockImplementation(async (_url,payload) => { if(version===1){version=2;throw{response:{status:409,data:{error:{code:'SESSION_COMMENT_VERSION_CONFLICT'}}}};} return{data:{comment:{...mine(),body:payload.body,version:3,editedAt:'2026-11-11T17:00:00Z'}}}; });
  await render(Dialog, { appointmentId: 12, clientId: 4 }); await wrapper.findAll('button').find(b => b.text() === 'Edit my comment').trigger('click'); await wrapper.find('textarea').setValue('My preserved edit'); await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(wrapper.text()).toContain('Saved elsewhere'); expect(wrapper.find('textarea').element.value).toBe('My preserved edit'); expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeDefined();
  await wrapper.find('input[type=checkbox]').setValue(true); await wrapper.find('form').trigger('submit'); await flushPromises(); expect(api.patch.mock.calls.at(-1)[1].expectedVersion).toBe(2); expect(wrapper.find('form').exists()).toBe(false);
});
it('discards late sibling thread responses and never acknowledges another child’s comments', async () => {
  const pending = new Map(); api.get.mockImplementation((url, opts) => new Promise(resolve => pending.set(opts.params.clientId, resolve)));
  await render(Dialog, { appointmentId: 12, clientId: 4 });
  await wrapper.setProps({ clientId: 5 });
  pending.get(5)({ data: { ...thread(5), comments: [comment(11, 'Selected child')] } }); await flushPromises();
  pending.get(4)({ data: { ...thread(4), comments: [comment(8, 'Wrong child private text')] } }); await flushPromises();
  expect(wrapper.text()).toContain('Selected child'); expect(wrapper.text()).not.toContain('Wrong child');
  expect(api.post.mock.calls.filter(([url]) => url.endsWith('/read')).map(([, body]) => body)).toEqual([{ clientId: 5, commentIds: [11], commentVersions: {11:1} }]);
});
it('requires client selection on a group appointment without merging private comments', async () => {
  api.get.mockImplementation(async (_, options) => ({ data: options.params.clientId ? thread(options.params.clientId) : { requiresClientSelection: true, clients: [{ id: 4, name: 'Client Four' }, { id: 5, name: 'Client Five' }], comments: [], recipients: [], canWrite: false } }));
  await render(Dialog, { appointmentId: 12 }); expect(wrapper.find('textarea').exists()).toBe(false);
  expect(api.post).not.toHaveBeenCalled(); await wrapper.find('select').setValue('5'); await flushPromises();
  expect(wrapper.text()).toContain('Client 5'); expect(api.get.mock.calls.at(-1)[1].params.clientId).toBe(5);
});
it('shows the complete automatic family audience read-only and sends all eligible recipients', async () => {
  api.get.mockImplementation(async url => ({ data: url === '/secure-family-sharing-notice' ? { version: '2026-11-11', acknowledged: true } : { ...thread(), sharingPolicy: 'family_automatic', recipients: [{ id: 3, name: 'Dr Avery', required: true, relationshipType: 'Provider' }, { id: 9, name: 'Other guardian', required: true, relationshipType: 'Guardian' }] } }));
  api.post.mockImplementation(async url => ({ data: url.endsWith('/read') ? {} : { comment: { ...comment(10, 'Family update'), isOwn: true } } }));
  await render(Dialog, { appointmentId: 12, clientId: 4, family: true });
  expect(wrapper.findAll('input')).toHaveLength(0); expect(wrapper.text()).toContain('Automatically shared with'); expect(wrapper.text()).toContain('Other guardian');
  await wrapper.find('textarea').setValue('Family update'); await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/secure-session-comments/appointments/12', expect.objectContaining({ recipientUserIds: [3, 9] }), expect.anything());
});
it('requires the first family acknowledgement before sending a comment and leaves text on cancel', async () => {
  api.get.mockImplementation(async url => ({ data: url === '/secure-family-sharing-notice' ? { version: '2026-11-11', acknowledged: false, notice: 'All currently eligible family users, including both eligible parents, can see your update.' } : { ...thread(), sharingPolicy: 'family_automatic', recipients: [{ id: 3, name: 'Dr Avery', required: true }] } }));
  await render(Dialog, { appointmentId: 12, clientId: 4, family: true });
  await wrapper.find('textarea').setValue('Family update'); await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(wrapper.text()).toContain('Before your first shared message or comment');
  expect(api.post.mock.calls.some(([url]) => url === '/secure-session-comments/appointments/12')).toBe(false);
  expect(wrapper.findAll('button').find(b => b.text() === 'I understand — continue').attributes('disabled')).toBeDefined();
  await wrapper.findAll('button').find(b => b.text() === 'Go back without sending').trigger('click'); await flushPromises();
  expect(wrapper.find('textarea').element.value).toBe('Family update'); expect(api.post.mock.calls.some(([url]) => url === '/secure-session-comments/appointments/12')).toBe(false);
});
it('persists the versioned acknowledgement and resumes the original family send once', async () => {
  api.get.mockImplementation(async url => ({ data: url === '/secure-family-sharing-notice' ? { version: '2026-11-11', acknowledged: false, notice: 'All eligible family users can see updates.' } : { ...thread(), sharingPolicy: 'family_automatic', recipients: [{ id: 3, name: 'Dr Avery', required: true }] } }));
  api.post.mockImplementation(async url => ({ data: url.endsWith('/ack') ? { version: '2026-11-11', acknowledged: true } : url.endsWith('/read') ? {} : { comment: { ...comment(12, 'Shared family update'), isOwn: true } } }));
  await render(Dialog, { appointmentId: 12, clientId: 4, family: true });
  await wrapper.find('textarea').setValue('Shared family update'); await wrapper.find('form').trigger('submit'); await flushPromises();
  await wrapper.find('input[type=checkbox]').setValue(true); await wrapper.findAll('button').find(b => b.text() === 'I understand — continue').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/secure-family-sharing-notice/ack', { agencyId: 450, version: '2026-11-11', acknowledged: true }, expect.anything());
  expect(api.post.mock.calls.filter(([url]) => url === '/secure-session-comments/appointments/12')).toHaveLength(1);
  expect(wrapper.find('form').exists()).toBe(false); expect(wrapper.text()).toContain('Edit my comment');
});
it('does not carry a first-send acknowledgement dialog into another child or service', async () => {
  api.get.mockResolvedValue({ data: { version: '2026-11-11', acknowledged: false, notice: 'Shared care communications' } });
  await render(FamilySharingNotice, { agencyId: 450, scopeKey: 'child4' });
  const pending = wrapper.vm.ensureAcknowledged(); await flushPromises(); expect(wrapper.find('[role=dialog]').exists()).toBe(true);
  await wrapper.setProps({ scopeKey: 'child5' }); expect(await pending).toBe(false); expect(wrapper.find('[role=dialog]').exists()).toBe(false); expect(api.post).not.toHaveBeenCalled();
});
it('handles a server-required provider notice without resending the rejected message', async () => {
  api.get.mockResolvedValue({ data: { version: '2026-11-11', acknowledged: false, notice: { title: 'Understand who can see this communication', statements: ['All eligible family users can see this update.'] } } });
  api.post.mockResolvedValue({ data: { version: '2026-11-11', acknowledged: true } });
  await render(FamilySharingNoticeHost, { userId: 7, scopeKey: 'agency450' });
  expect(dispatchFamilySharingNoticeRequired({ response: { status: 409, data: { error: { code: 'FAMILY_SHARING_ACK_REQUIRED', agencyId: 450, version: '2026-11-11' } } }, config: { data: { body: 'Never forward this draft' } } })).toBe(true);
  await flushPromises(); expect(wrapper.text()).toContain('Understand who can see this communication'); expect(wrapper.text()).not.toContain('Never forward this draft');
  await wrapper.find('input[type=checkbox]').setValue(true); await wrapper.findAll('button').find(b => b.text() === 'I understand — continue').trigger('click'); await flushPromises();
  expect(api.post.mock.calls.map(([url]) => url)).toEqual(['/secure-family-sharing-notice/ack']); expect(wrapper.text()).toContain('original message was not sent');
});
it('does not prompt or retry for unrelated email and staff conversation errors', async () => {
  await render(FamilySharingNoticeHost, { userId: 7 });
  expect(dispatchFamilySharingNoticeRequired({ response: { status: 409, data: { error: { code: 'EMAIL_SEND_CONFLICT', agencyId: 450 } } } })).toBe(false);
  await flushPromises(); expect(api.get).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled(); expect(wrapper.find('[role=dialog]').exists()).toBe(false);
});
it('requires reviewing a changed audience and preserves the unsent comment before a retry', async () => {
  let changed = false;
  api.get.mockImplementation(async url => ({ data: url === '/secure-family-sharing-notice' ? { version: '2026-11-11', acknowledged: true } : { ...thread(), recipients: changed ? [...thread().recipients, { id: 13, name: 'Newly eligible guardian' }] : thread().recipients } }));
  api.post.mockImplementation(async url => {
    if (url.endsWith('/read')) return { data: {} };
    if (!changed) { changed = true; throw { response: { status: 409, data: { error: { code: 'SESSION_COMMENT_AUDIENCE_CHANGED' } } } }; }
    return { data: { comment: { ...comment(19, 'Preserved update'), isOwn: true } } };
  });
  await render(Dialog, { appointmentId: 12, clientId: 4 }); await wrapper.find('textarea').setValue('Preserved update'); await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(wrapper.find('textarea').element.value).toBe('Preserved update'); expect(wrapper.text()).toContain('Newly eligible guardian'); expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeDefined();
  await wrapper.find('input[type=checkbox]').setValue(true); await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(api.post.mock.calls.filter(([url]) => url === '/secure-session-comments/appointments/12').at(-1)[1].recipientUserIds).toEqual([7, 9, 13]); expect(wrapper.find('form').exists()).toBe(false);
});
it('previews every current shared recipient and sends a reviewed set excluding the author', async () => {
  api.post.mockResolvedValue({ data: { threadId: 40, agencyId: 450, shared: true, sharingPolicy: 'all_eligible_family', participants: [{ id: 7, name: 'Provider author' }, { id: 9, name: 'Parent One' }, { id: 11, name: 'Parent Two' }] } });
  await render(SecureFamilyAudience, { personKey: 'guardian:9', agencyId: 450, clientId: 4, meId: 7, required: true });
  expect(wrapper.text()).toContain('Parent One'); expect(wrapper.text()).toContain('Parent Two'); expect(wrapper.findAll('input')).toHaveLength(0);
  expect(wrapper.vm.recipientUserIds).toEqual([9, 11]); expect(await wrapper.vm.prepareSend()).toBe(true);
  expect(api.post.mock.calls.map(([url]) => url)).toEqual(['/messages/hub/ensure-thread']);
});
it('keeps a historical private message thread read-only without displaying a current family roster', async () => {
  api.get.mockResolvedValue({ data: { thread_id: 40, readOnly: true, sharingPolicy: 'historical_recipients', participants: [] } });
  await render(SecureFamilyAudience, { threadId: 40, meId: 7 });
  expect(wrapper.text()).toContain('previous secure conversation is read-only'); expect(wrapper.text()).not.toContain('Automatically shared with'); expect(await wrapper.vm.prepareSend()).toBe(false); expect(api.post).not.toHaveBeenCalled();
});
it('does not apply the family acknowledgement to ordinary internal staff chat', async () => {
  api.get.mockResolvedValue({ data: { thread_id: 40, thread_type: 'direct', message_channel: 'internal', participants: [{ id: 7 }, { id: 12 }] } });
  await render(SecureFamilyAudience, { threadId: 40, meId: 7 });
  expect(wrapper.text()).toBe(''); expect(await wrapper.vm.prepareSend()).toBe(true); expect(api.get).toHaveBeenCalledTimes(1); expect(api.post).not.toHaveBeenCalled();
});
it('requires a fresh review when a shared message audience changes and never sends automatically', async () => {
  let latest = false;
  api.post.mockImplementation(async () => ({ data: { threadId: 40, agencyId: 450, shared: true, sharingPolicy: 'all_eligible_family', participants: [{ id: 7, name: 'Provider' }, { id: 9, name: 'Parent One' }, ...(latest ? [{ id: 11, name: 'Newly eligible Parent Two' }] : [])] } }));
  await render(SecureFamilyAudience, { personKey: 'guardian:9', agencyId: 450, clientId: 4, meId: 7, required: true }); latest = true;
  await wrapper.vm.refreshAfterAudienceChange(); await flushPromises(); expect(wrapper.vm.canSend).toBe(false); expect(wrapper.text()).toContain('Newly eligible Parent Two');
  await wrapper.find('input[type=checkbox]').setValue(true); expect(await wrapper.vm.prepareSend()).toBe(true); expect(wrapper.vm.recipientUserIds).toEqual([9, 11]);
  expect(api.post.mock.calls.some(([url]) => url.endsWith('/send'))).toBe(false);
});

it('traps dialog focus and allows Escape without marking any additional comment read', async () => {
  await render(Dialog, { appointmentId: 12, clientId: 4 });
  const dialog = wrapper.find('[role=dialog]'), first = wrapper.find('button.aw-close');
  dialog.element.focus(); await dialog.trigger('keydown', { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(wrapper.find('textarea').element);
  first.element.focus(); await dialog.trigger('keydown', { key: 'Escape' }); expect(wrapper.emitted('close')).toHaveLength(1);
});
it('loads older thread pages while preserving a draft and its selected audience', async () => {
  api.get.mockImplementation(async (_, opts) => ({ data: opts.params.before ? { ...thread(), comments: [comment(1, 'Older update')], hasMore: false } : { ...thread(), hasMore: true, nextBefore: 8 } }));
  await render(Dialog, { appointmentId: 12, clientId: 4 });
  await wrapper.find('textarea').setValue('Unsent draft');
  await wrapper.findAll('button').find(b => b.text() === 'Older secure comments').trigger('click'); await flushPromises();
  expect(wrapper.text()).toContain('Older update'); expect(wrapper.text()).toContain('Private update'); expect(wrapper.find('textarea').element.value).toBe('Unsent draft'); expect(wrapper.text()).toContain('Parent Two');
});
it('does not acknowledge comments merely by listing today and opens the exact session over My Schedule', async () => {
  api.get.mockImplementation(async url => ({ data: url.endsWith('/today') ? { appointments: [{ ...appointment(), unreadCount: 1, comments: [comment()] }], showSplash: true, dayKey: '2026-11-11', timeZone: 'America/Denver' } : thread() }));
  await render(Host, { userId: 7 }); expect(wrapper.text()).toContain('unopened secure session comments'); expect(api.post).not.toHaveBeenCalled();
  await wrapper.find('[aria-label="View secure session comments for today"]').trigger('click'); await flushPromises();
  expect(wrapper.text()).toContain('Today’s Secure Session Comments'); expect(api.post).not.toHaveBeenCalled();
  await wrapper.findAll('button').find(b => b.text() === 'View comments →').trigger('click'); await flushPromises();
  expect(router.currentRoute.value.path).toBe('/qa/my-schedule'); expect(router.currentRoute.value.query.scheduleAppointmentId).toBe('12');
  expect(wrapper.text()).toContain('Private update'); expect(api.post).toHaveBeenCalledWith(expect.stringContaining('/12/read'), expect.objectContaining({ clientId: 4 }), expect.anything());
});
it('saves snooze and dismissal on the server for the authenticated user/day', async () => {
  api.get.mockResolvedValue({ data: { appointments: [{ ...appointment(), unreadCount: 1 }], showSplash: true, dayKey: '2026-11-11', timeZone: 'America/Denver' } });
  await render(Host, { userId: 7 }); await wrapper.findAll('button').find(b => b.text() === 'Dismiss for today').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/secure-session-comments/attention', { timeZone: 'America/Denver', action: 'dismiss_today', minutes: 30 }, expect.anything()); expect(wrapper.find('[role=dialog]').exists()).toBe(false);
});
it('never splashes after the final session has ended or a session is already completed', async () => {
  api.get.mockResolvedValue({ data: { appointments: [{ ...appointment(), endAt: new Date(Date.now() - 1).toISOString(), unreadCount: 2 }, { ...appointment(), status: 'completed', unreadCount: 1 }], showSplash: true, dayKey: '2026-11-11' } });
  await render(Host, { userId: 7 }); expect(wrapper.find('[role=dialog]').exists()).toBe(false);
  expect(activeTodayAppointments({ appointments: [] })).toEqual([]);
});
it('keeps a morning unread comment until the last session of the day ends even if that later session has no comment', () => {
  const earlier = { ...appointment(), startAt: new Date(Date.now() - 7200000).toISOString(), endAt: new Date(Date.now() - 3600000).toISOString(), status: 'completed', unreadCount: 1 };
  expect(activeTodayAppointments({ appointments: [earlier], lastSessionEndAt: appointment().endAt, dayFinished: false })).toEqual([earlier]);
  expect(activeTodayAppointments({ appointments: [earlier], lastSessionEndAt: appointment().endAt, dayFinished: true })).toEqual([]);
});
it('does not acknowledge an opened thread while the browser tab is hidden', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await render(Dialog, { appointmentId: 12, clientId: 4 }); expect(api.post).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange')); await flushPromises();
  expect(api.post).toHaveBeenCalledWith(expect.stringContaining('/12/read'), { clientId: 4, commentIds: [8], commentVersions: {8:1} }, expect.anything());
});
it('clears an open conversation and ignores a late response when the same user switches practices', async () => {
  let late; api.get.mockImplementation(url => url.endsWith('/today') ? Promise.resolve({ data: { appointments: [], showSplash: false } }) : new Promise(resolve => { late = resolve; }));
  await render(Host, { userId: 7, scopeKey: 'agency450' }); openSecureSessionComment(12, 4); await flushPromises();
  await wrapper.setProps({ scopeKey: 'agency999' }); late({ data: { ...thread(), comments: [comment(8, 'Previous practice private text')] } }); await flushPromises();
  expect(wrapper.text()).not.toContain('Previous practice'); expect(secureCommentState.selected).toBe(null); expect(api.post).not.toHaveBeenCalled();
});
it('keeps badge requests within their own transport and ignores old scope replies', async () => {
  let old; const first = { get: vi.fn().mockImplementation(() => new Promise(resolve => { old = resolve; })) }, second = { get: vi.fn().mockResolvedValue({ data: { appointments: [{ appointmentId: 22, clientId: 5, count: 1, unreadCount: 1 }] } }) };
  setSecureCommentsScope('scopeA'); requestCommentBadge(12, 4, first); requestCommentBadge(22, 5, second); await flushPromises();
  expect(first.get.mock.calls[0][1].params.appointmentIds).toBe('12'); expect(second.get.mock.calls[0][1].params.appointmentIds).toBe('22');
  setSecureCommentsScope('scopeB'); old({ data: { appointments: [{ appointmentId: 12, clientId: 4, count: 9, unreadCount: 9 }] } }); await flushPromises(); expect(secureCommentState.badges).toEqual({});
});
it('does not fetch protected content while locked and clears selected content on account changes', async () => {
  await render(Host, { userId: 7, enabled: false }); expect(api.get).not.toHaveBeenCalled();
  openSecureSessionComment(12, 4); await wrapper.setProps({ userId: 9 }); expect(wrapper.find('[role=dialog]').exists()).toBe(false); expect(secureCommentState.selected).toBe(null);
});
it('restores a past session comment deep link without requiring that date in today’s list', async () => {
  api.get.mockImplementation(async url => ({ data: url.endsWith('/today') ? { appointments: [], showSplash: false } : { ...thread(), appointment: { ...appointment(), startAt: '2025-01-02T15:00:00Z' } } }));
  await render(Host, { userId: 7 }); await router.push('/qa/my-schedule?secureCommentAppointmentId=12&secureCommentClientId=4'); await flushPromises();
  expect(wrapper.text()).toContain('Private update'); expect(wrapper.text()).toContain('2025');
});
it('links communication history to current appointment time and ignores a stale child result', async () => {
  const pending = new Map(); api.get.mockImplementation((_, opts) => new Promise(resolve => pending.set(opts.params.clientId, resolve)));
  await render(History, { clientId: 4 }); await wrapper.setProps({ clientId: 5 });
  pending.get(5)({ data: { comments: [{ ...comment(), appointment: appointment(5) }] } }); await flushPromises();
  pending.get(4)({ data: { comments: [{ ...comment(2), author: { name: 'Other child guardian' }, appointment: appointment(4) }] } }); await flushPromises();
  expect(wrapper.text()).not.toContain('Other child guardian'); expect(wrapper.text()).toContain('Secure comment');
  expect(wrapper.find('a').attributes('href')).toContain('secureCommentClientId=5'); await wrapper.find('a').trigger('click'); await flushPromises();
  expect(router.currentRoute.value.query.secureCommentClientId).toBe('5'); expect(secureCommentState.selected.clientId).toBe(5);
});
it('uses supplied artwork in the appointment button and only pulses an unread badge', async () => {
  secureCommentState.badges['12:4'] = { count: 1, unreadCount: 1 }; api.get.mockResolvedValue({ data: { appointments: [{ appointmentId: 12, clientId: 4, count: 1, unreadCount: 1 }] } });
  await render(Button, { appointmentId: 12, clientId: 4, iconOnly: true }); expect(wrapper.find('img').attributes('src')).toContain('secure-envelope-shield.png'); expect(wrapper.classes()).toContain('aw-comment-button--unread');
  await wrapper.trigger('click'); expect(secureCommentState.selected).toEqual({ appointmentId: 12, clientId: 4 });
});
it('provides a dismissible client-specific example without a real child’s details', async () => {
  await render(Tip, { appointmentId: 12, userId: 7, startAt: appointment().startAt, self: true }); expect(wrapper.text()).toContain('my journal'); expect(wrapper.text()).not.toContain('My child'); await wrapper.find('button').trigger('click'); expect(wrapper.text()).toBe('');
});
it('excludes school and support role preloads without broadening server rights', () => {
  expect(canUseSessionComments('school_staff')).toBe(false); expect(canUseSessionComments('support')).toBe(false); expect(canUseSessionComments('client_guardian')).toBe(true);
});
