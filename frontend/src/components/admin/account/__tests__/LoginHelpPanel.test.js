import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import LoginHelpPanel from '../LoginHelpPanel.vue';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../../services/api', () => ({ default: api }));
const report = (canSend = true) => ({ canSend, agency: { id: 2, name: 'ITSCO' }, user: { name: 'Jill', username: 'jill@school.example' },
  checks: [{ code: 'account', status: canSend ? 'ok' : 'blocked', message: canSend ? 'Active account' : 'Account locked' }],
  loginLinks: [], email: { to: 'jill@school.example', from: 'technology@itsco.health', replyTo: 'technology@itsco.health', preview: 'Hello Jill' } });
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: report() }); });
describe('Login help panel', () => {
  it('checks without sending and carries the selected agency', async () => {
    const w = mount(LoginHelpPanel, { props: { userId: 42, agencyId: 2 } });
    await w.findAll('button')[0].trigger('click'); await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/users/42/login-help', { params: { agencyId: 2 } });
    expect(api.post).not.toHaveBeenCalled(); expect(w.text()).toContain('jill@school.example'); w.unmount();
  });
  it('prevents a send after a blocked check but lets the operator recheck', async () => {
    api.get.mockResolvedValue({ data: report(false) });
    const w = mount(LoginHelpPanel, { props: { userId: 42, agencyId: 2 } });
    await w.findAll('button')[0].trigger('click'); await flushPromises();
    expect(w.findAll('button')[1].attributes('disabled')).toBeDefined();
    expect(w.findAll('button')[0].attributes('disabled')).toBeUndefined(); w.unmount();
  });
  it('does not describe queued mail as sent', async () => {
    api.post.mockResolvedValue({ data: { outcome: 'queued', report: report() } });
    const w = mount(LoginHelpPanel, { props: { userId: 42, agencyId: 2 } });
    await w.findAll('button')[1].trigger('click'); await flushPromises();
    expect(w.find('[role="status"]').text()).toContain('has not been sent yet'); w.unmount();
  });
  it('discards stale results after switching users', async () => {
    let resolve; api.get.mockReturnValue(new Promise(r => { resolve = r; }));
    const w = mount(LoginHelpPanel, { props: { userId: 42, agencyId: 2 } });
    await w.findAll('button')[0].trigger('click'); await w.setProps({ userId: 43 });
    resolve({ data: report() }); await flushPromises();
    expect(w.text()).not.toContain('jill@school.example'); w.unmount();
  });
});
