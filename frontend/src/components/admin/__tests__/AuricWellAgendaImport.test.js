import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AuricWellAgendaImport from '../AuricWellAgendaImport.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const options = { timeZone: 'America/Denver', clients: [{ id: 41, label: 'Avery Hart' }], services: [{ id: 3, name: 'Therapy', serviceCode: '90834' }], locations: [{ id: 5, name: 'Office', placeOfService: '11' }] };
const preview = { rows: [{ rowId: 'line-1', clientInput: 'Avery Hart', clientId: 41, date: '2026-11-16', startTime: '09:00', endTime: '09:50', tenantServiceId: 3, serviceLocationId: 5, modality: 'IN_PERSON', recurrence: 'ONCE', occurrenceCount: 1, errors: [], warnings: [], status: 'ready' }], summary: { newAppointments: 1, existingAppointments: 0, blockedRows: 0, sameDayWarning: false }, previewToken: 'reviewed-token' };
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text().includes(text));
async function setup() {
  const wrapper = mount(AuricWellAgendaImport, { props: { agencyId: 2, providerId: 19, providerLabel: 'Jordan Provider' } });
  await flushPromises();
  await wrapper.get('input[type=date]').setValue('2026-11-16');
  await wrapper.get('textarea').setValue('Monday | 09:00 | 09:50 | Avery Hart');
  return wrapper;
}
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: options });
  api.post.mockImplementation(async url => ({ data: url.endsWith('/preview') ? structuredClone(preview) : { ok: true, complete: true, createdCount: 1, existingCount: 0, appointments: [{ id: 100 }] } }));
});

describe('AuricWell agenda review', () => {
  it('reads without booking, invalidates a checked preview on edits, and locks the parent while requests run', async () => {
    const wrapper = await setup();
    await button(wrapper, 'Read pasted agenda').trigger('click'); await flushPromises();
    expect(api.post.mock.calls.map(([url]) => url)).toEqual(['/auricwell-agenda-import/preview']);
    expect(button(wrapper, 'Create reviewed').element.disabled).toBe(true);
    await wrapper.findAll('input[type=checkbox]').at(-1).setValue(true);
    expect(button(wrapper, 'Create reviewed').element.disabled).toBe(false);
    await wrapper.get('input[aria-label="Start for row 1"]').setValue('10:00');
    expect(button(wrapper, 'Create reviewed').element.disabled).toBe(true);
    expect(wrapper.emitted('busy').some(([value]) => value === true)).toBe(true);
    expect(wrapper.emitted('busy').at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it('commits the reviewed tenant/provider rows only after explicit confirmation and reports saved IDs', async () => {
    const wrapper = await setup();
    await button(wrapper, 'Read pasted agenda').trigger('click'); await flushPromises();
    await wrapper.findAll('input[type=checkbox]').at(-1).setValue(true);
    await button(wrapper, 'Create reviewed').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenLastCalledWith('/auricwell-agenda-import/commit', expect.objectContaining({ agencyId: 2, providerId: 19, confirm: true, previewToken: 'reviewed-token', rows: [expect.objectContaining({ clientId: 41 })] }), expect.objectContaining({ headers: { 'X-Agency-Id': '2' } }));
    expect(wrapper.emitted('saved')[0][0]).toMatchObject({ agencyId: 2, providerId: 19, appointments: [{ id: 100 }] });
    expect(wrapper.text()).toContain('Scheduled 1 new appointments');
    expect(button(wrapper, 'Create reviewed').element.disabled).toBe(true);
    wrapper.unmount();
  });

  it('clears the old preview and paste when switching providers', async () => {
    const wrapper = await setup();
    await button(wrapper, 'Read pasted agenda').trigger('click'); await flushPromises();
    await wrapper.setProps({ providerId: 20 }); await flushPromises();
    expect(wrapper.get('textarea').element.value).toBe('');
    expect(button(wrapper, 'Create reviewed')).toBeUndefined();
    expect(api.get).toHaveBeenLastCalledWith('/auricwell-agenda-import/options', { params: { agencyId: 2, providerId: 20 }, headers: { 'X-Agency-Id': '2' } });
    wrapper.unmount();
  });
});

it('switches between exact dates and recurrence, and retains explicit resolution for ambiguous initials', async () => {
  const wrapper = await setup();
  await wrapper.get('select').setValue('recurring');
  expect(button(wrapper, 'Read pasted agenda').element.disabled).toBe(true);
  await wrapper.findAll('input[type=date]')[1].setValue('2026-12-17');
  api.get.mockResolvedValue({ data: { ...options, clients: [...options.clients, { id: 42, label: 'Ava Harris' }] } });
  await button(wrapper, 'Refresh provider').trigger('click');
  await flushPromises();
  api.post.mockResolvedValueOnce({ data: { ...preview, previewToken: null, rows: [{ ...preview.rows[0], clientId: null,
    clientInput: 'AvHa', clientCandidateIds: [41, 42], status: 'blocked', errors: ['Multiple clients match.'] }] } });
  await button(wrapper, 'Read pasted agenda').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenLastCalledWith('/auricwell-agenda-import/preview', expect.objectContaining({ scheduleMode: 'recurring', untilDate: '2026-12-17' }), expect.objectContaining({ headers: { 'X-Agency-Id': '2' } }));
  const select = wrapper.get('[aria-label="Client for row 1"]');
  expect(select.element.selectedIndex).toBe(0);
  expect(wrapper.text()).toContain('Multiple clients match.');
  await select.setValue(42);
  await button(wrapper, 'Check reviewed appointments').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenLastCalledWith('/auricwell-agenda-import/preview', expect.objectContaining({ rows: [expect.objectContaining({ clientId: 42 })] }), expect.objectContaining({ headers: { 'X-Agency-Id': '2' } }));
  wrapper.unmount();
});
