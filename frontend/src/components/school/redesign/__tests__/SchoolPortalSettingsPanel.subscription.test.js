import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../../../../services/api', () => ({ default: { get: m.get, patch: m.patch } }));
vi.mock('../../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 42, role: 'school_staff' } }) }));
vi.mock('../../../notifications/NotificationTypeSettingsPanel.vue', () => ({ default: { template: '<div />' } }));
import Panel from '../SchoolPortalSettingsPanel.vue';
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  m.get.mockResolvedValue({ data: { staff: [{ id: 42, group_email_subscription: 'all_mail' }], schoolGroupEmail: 'school@example.org' } });
  m.patch.mockResolvedValue({ data: { group_email_subscription: 'none' } });
});
async function open() {
  const w = mount(Panel, { props: { schoolOrganizationId: 440 } });
  await flushPromises(); return w;
}
it('explains the consequences and sends nothing when muting is cancelled', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const w = await open();
  await w.findAll('button').find(b => b.text().includes('No email')).trigger('click');
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('no longer receive school updates or enrollment messages'));
  expect(m.patch).not.toHaveBeenCalled();
  expect(w.find('[aria-selected="true"]').text()).toContain('Each email');
  w.unmount();
});
it('mutes only after confirmation and keeps a visible off warning', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const w = await open();
  await w.findAll('button').find(b => b.text().includes('No email')).trigger('click');
  await flushPromises();
  expect(m.patch).toHaveBeenCalledExactlyOnceWith('/school-portal/440/school-staff/42/group-subscription', { subscription: 'none' });
  expect(w.find('[role="status"]').text()).toContain('School group emails are turned off');
  w.unmount();
});
it('keeps the previous subscription and displays a failed sync', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  m.patch.mockRejectedValue({ response: { data: { error: { message: 'Google delivery could not be updated' } } } });
  const w = await open();
  await w.findAll('button').find(b => b.text().includes('No email')).trigger('click');
  await flushPromises();
  expect(w.text()).toContain('Google delivery could not be updated');
  expect(w.text()).not.toContain('Saved.');
  expect(w.find('[role="status"]').exists()).toBe(false);
  w.unmount();
});
it('does not invent an Each email selection when current delivery is unknown', async () => {
  m.get.mockResolvedValue({ data: [{ id: 42, group_email_subscription: null, saved_group_email_subscription: 'all_mail' }] });
  const w = await open();
  expect(w.find('[aria-selected="true"]').exists()).toBe(false);
  expect(w.text()).toContain('Could not verify your current Google Group subscription');
  w.unmount();
});
