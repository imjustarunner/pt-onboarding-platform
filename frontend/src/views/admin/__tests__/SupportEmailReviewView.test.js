import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import SupportEmailReviewView from '../SupportEmailReviewView.vue';
import api from '../../../services/api';

const state = vi.hoisted(() => ({ route: null, replace: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => state.route, useRouter: () => ({ replace: state.replace }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 } }) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

function payload() {
  return {
    config: { enabled: true, sendTime: '18:00', weekdaysOnly: true, timeZone: 'America/Denver' },
    window: { date: '2026-10-26', start: '2026-10-24T00:00:00Z', end: '2026-10-27T00:00:00Z', timeZone: 'America/Denver' },
    totals: { tickets: 1, drafts: 2, sent: 1, failed: 1, unsentDrafts: 1 },
    coverage: { completeMailboxCoverage: false, inProgress: true, personalMailboxReplies: 'Personal mailbox replies may be missing.' },
    rows: [{
      ticketId: 51, subject: 'Referral packet', owner: { id: 8, name: 'Alex Rivera' },
      originalReceived: { body: 'The original question.', receivedAt: '2026-10-26T15:00:00Z' },
      draftSnapshots: [
        { id: 10, body: 'First draft, saved before any edits.', createdAt: '2026-10-26T15:01:00Z', readable: true, originalReceived: { body: 'The exact received email used for this draft.', receivedAt: '2026-10-26T15:00:00Z' } },
        { id: 11, body: 'Second draft version.', createdAt: '2026-10-26T15:02:00Z', readable: true }
      ],
      deliveries: [
        { id: 20, body: 'The final reply that was sent.', status: 'sent', draftSnapshotId: 10, occurredAt: '2026-10-26T16:00:00Z' },
        { id: 21, body: 'A failed delivery attempt.', status: 'failed', draftSnapshotId: 11, occurredAt: '2026-10-26T16:05:00Z' }
      ],
      comparison: { draftId: 10, generatedDraft: 'First draft, saved before any edits.', sentBody: 'The final reply that was sent.', edited: true, missingDraft: false },
      coverageFlags: []
    }]
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.route = reactive({ query: { agencyId: '2', date: '2026-10-26' }, params: { organizationSlug: 'itsco' } });
  api.get.mockResolvedValue({ data: payload() });
});

describe('daily support email review', () => {
  it('shows the received email, immutable draft and confirmed sent reply in separate columns', async () => {
    const wrapper = mount(SupportEmailReviewView); await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/support-email-review', expect.objectContaining({ params: { agencyId: 2, date: '2026-10-26' } }));
    expect(wrapper.find('.received').text()).toContain('The exact received email used for this draft.');
    expect(wrapper.find('.drafted').text()).toContain('First draft, saved before any edits.');
    expect(wrapper.find('.actual').text()).toContain('The final reply that was sent.');
    expect(wrapper.find('.actual').text()).not.toContain('A failed delivery attempt.');
    expect(wrapper.text()).toContain('Draft edited before sending');
    expect(wrapper.text()).toContain('Today’s review is still in progress');
    expect(wrapper.text()).toContain('Weekdays at 18:00');
    expect(api.post).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('preserves every draft version and failed/queued delivery without labeling it sent', async () => {
    const data = payload();
    data.rows[0].deliveries.push({ id: 22, status: 'queued', body: 'Queued only.', occurredAt: '2026-10-26T16:06:00Z' });
    api.get.mockResolvedValue({ data });
    const wrapper = mount(SupportEmailReviewView); await flushPromises();
    expect(wrapper.find('.history').text()).toContain('Second draft version.');
    expect(wrapper.find('.history').text()).toContain('Failed — not confirmed sent');
    expect(wrapper.find('.history').text()).toContain('Queued — not yet sent');
    expect(wrapper.find('.actual').text()).not.toContain('Queued only.');
    wrapper.unmount();
  });

  it('pairs each selected reply with its own incoming email and saved draft', async () => {
    const data = payload();
    const row = data.rows[0];
    row.draftSnapshots[1].originalReceived = { body: 'A later incoming question.' };
    row.deliveries.push({ id: 23, status: 'sent', body: 'The later reply.', draftSnapshotId: 11,
      occurredAt: '2026-10-26T17:00:00Z', originalReceived: { body: 'A later incoming question.' } });
    row.comparison = { draftId: 11, generatedDraft: 'Second draft version.', missingDraft: false };
    api.get.mockResolvedValue({ data });
    const wrapper = mount(SupportEmailReviewView); await flushPromises();
    expect(wrapper.find('.received').text()).toContain('A later incoming question.');
    expect(wrapper.find('.drafted').text()).toContain('Second draft version.');
    expect(wrapper.find('.actual').text()).toContain('The later reply.');
    expect(wrapper.find('.actual').text()).not.toContain('The final reply that was sent.');
    await wrapper.find('.reply-picker select').setValue(20);
    expect(wrapper.find('.received').text()).toContain('The exact received email used for this draft.');
    expect(wrapper.find('.drafted').text()).toContain('First draft, saved before any edits.');
    expect(wrapper.find('.actual').text()).toContain('The final reply that was sent.');
    expect(wrapper.find('.actual').text()).not.toContain('The later reply.');
    wrapper.unmount();
  });

  it('does not borrow a later email or draft for an earlier reply without captured evidence', async () => {
    const data = payload();
    data.rows[0].deliveries.unshift({ id: 19, status: 'sent', body: 'An early reply.',
      occurredAt: '2026-10-26T14:00:00Z' });
    api.get.mockResolvedValue({ data });
    const wrapper = mount(SupportEmailReviewView); await flushPromises();
    await wrapper.find('.reply-picker select').setValue(19);
    expect(wrapper.find('.received').text()).toContain('not captured');
    expect(wrapper.find('.received').text()).not.toContain('The original question.');
    expect(wrapper.find('.drafted').text()).not.toContain('First draft');
    expect(wrapper.find('.actual').text()).toContain('An early reply.');
    expect(wrapper.text()).toContain('No captured draft to compare');
    wrapper.unmount();
  });

  it('does not call an unreadable saved draft edited or missing', async () => {
    const data = payload();
    data.rows[0].draftSnapshots.unshift({ id: 9, readable: false, body: null });
    data.rows[0].deliveries.unshift({ id: 19, status: 'sent', body: 'An early reply.', composedBody: 'An early reply.',
      draftSnapshotId: 9, occurredAt: '2026-10-26T14:00:00Z' });
    api.get.mockResolvedValue({ data });
    const wrapper = mount(SupportEmailReviewView); await flushPromises();
    await wrapper.find('.reply-picker select').setValue(19);
    expect(wrapper.find('.conversation-heading').text()).toContain('Saved draft unavailable');
    expect(wrapper.find('.conversation-heading').text()).not.toContain('Draft edited before sending');
    expect(wrapper.find('.conversation-heading').text()).not.toContain('No captured draft to compare');
    expect(wrapper.find('.drafted').text()).toContain('The saved draft could not be read.');
    wrapper.unmount();
  });

  it('treats a missing draft and unconfirmed delivery as unknown rather than unchanged or sent', async () => {
    const data = payload();
    data.rows[0].draftSnapshots = [];
    data.rows[0].comparison = { missingDraft: true, edited: null };
    data.rows[0].deliveries = [{ id: 30, status: 'unknown', body: 'Delivery uncertain.' }];
    api.get.mockResolvedValue({ data });
    const wrapper = mount(SupportEmailReviewView); await flushPromises();
    expect(wrapper.text()).toContain('No captured draft to compare');
    expect(wrapper.find('.drafted').text()).toContain('No original draft was captured for this message.');
    expect(wrapper.find('.actual').text()).toContain('No confirmed email delivery');
    expect(wrapper.text()).not.toContain('Draft used unchanged');
    wrapper.unmount();
  });

  it('renders untrusted email and draft text as text, never HTML', async () => {
    const data = payload();
    data.rows[0].comparison.generatedDraft = '<img src=x onerror=alert(1)>Hello';
    api.get.mockResolvedValue({ data });
    const wrapper = mount(SupportEmailReviewView); await flushPromises();
    expect(wrapper.find('.drafted').text()).toContain('<img src=x onerror=alert(1)>Hello');
    expect(wrapper.find('img').exists()).toBe(false);
    wrapper.unmount();
  });

  it('discards a slow response for an earlier review day', async () => {
    const wrapper = mount(SupportEmailReviewView); await flushPromises();
    let resolveOld;
    api.get.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    await wrapper.find('input[type=date]').setValue('2026-10-25'); await flushPromises();
    const latest = payload(); latest.rows[0].subject = 'New selected day';
    api.get.mockResolvedValue({ data: latest });
    await wrapper.find('input[type=date]').setValue('2026-10-24'); await flushPromises();
    resolveOld({ data: payload() }); await flushPromises();
    expect(wrapper.find('.conversation-heading h2').text()).toBe('New selected day');
    wrapper.unmount();
  });

  it('clears previously visible correspondence after access is denied', async () => {
    const wrapper = mount(SupportEmailReviewView); await flushPromises();
    api.get.mockRejectedValue({ response: { data: { error: { message: 'Access denied.' } } } });
    await wrapper.find('button').trigger('click'); await flushPromises();
    expect(wrapper.find('[role=alert]').text()).toBe('Access denied.');
    expect(wrapper.text()).not.toContain('The final reply that was sent.');
    wrapper.unmount();
  });

  it('uses the digest agency query even when another agency is selected in the app', async () => {
    state.route.query.agencyId = '9';
    const wrapper = mount(SupportEmailReviewView); await flushPromises();
    expect(api.get.mock.calls[0][1].params.agencyId).toBe(9);
    wrapper.unmount();
  });
});
