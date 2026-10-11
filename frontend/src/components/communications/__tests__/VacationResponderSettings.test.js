import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Component from '../VacationResponderSettings.vue';
const m = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: m }));
const fixture = () => ({ agencyName: 'ITSCO', providerName: 'Pat', defaults: { supportContact: 'support@example.test', templates: { provider_colorado_springs: 'Springs: {provider_name} until {return_at}', provider_denver: 'Denver: {provider_name} until {return_at}' } }, config: { enabled: false, state: 'off', timeZone: 'America/Denver', templateKey: 'provider_colorado_springs', messageTemplate: '', endsAt: null, plannedOutId: null }, plannedOuts: [{ id: 4, status: 'approved', allDay: true, start: '2026-10-10', end: '2026-10-15' }], canManageDefaults: false, sources: [] });
beforeEach(() => { vi.clearAllMocks(); m.get.mockResolvedValue({ data: fixture() }); m.put.mockResolvedValue({ data: { config: { ...fixture().config, state: 'waiting', enabled: true } } }); });
it('previews regional copy and saves an explicit opt-in/end without sending mail', async () => {
  const w = mount(Component, { props: { agencyId: 2 } }); await flushPromises();
  await w.find('select').setValue(4); await w.findAll('select')[1].setValue('provider_denver'); await w.find('input[type=datetime-local]').setValue('2026-10-15T09:00'); await w.find('input[type=checkbox]').setValue(true);
  expect(w.find('pre').text()).toContain('Denver: Pat until 2026-10-15 09:00');
  await w.find('form').trigger('submit'); await flushPromises();
  expect(m.put).toHaveBeenCalledWith('/email-settings/vacation', expect.objectContaining({ agencyId: 2, enabled: true, plannedOutId: 4, endsLocal: '2026-10-15T09:00', messageTemplate: '' }));
  expect(w.text()).toContain('Waiting for approved absence'); expect(w.text()).not.toContain('Save agency defaults'); w.unmount();
});
it('offers personal editing but safely renders HTML as text', async () => {
  const w = mount(Component, { props: { agencyId: 2 } }); await flushPromises();
  await w.findAll('input[type=checkbox]')[1].setValue(true); await w.find('textarea').setValue('<script>bad</script> until {return_at}');
  expect(w.find('pre').text()).toContain('<script>bad</script>'); expect(w.find('pre script').exists()).toBe(false); w.unmount();
});
it('shows expiration as off and allows an administrator to edit company defaults', async () => {
  const f = fixture(); f.config = { ...f.config, state: 'expired', enabled: true }; f.canManageDefaults = true; m.get.mockResolvedValue({ data: f });
  const w = mount(Component, { props: { agencyId: 2 } }); await flushPromises(); expect(w.find('input[type=checkbox]').element.checked).toBe(false); expect(w.text()).toContain('Expired · Off'); expect(w.text()).toContain('Save agency defaults'); w.unmount();
});
