import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ClientGuardianContactEditor from '../ClientGuardianContactEditor.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { put: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
describe('paper packet guardian contact editor', () => {
  it('adds a contact without requiring an email and emits the saved encrypted-record projection', async () => {
    const wrapper = mount(ClientGuardianContactEditor, { props: { clientId: 22 } });
    await wrapper.get('button').trigger('click');
    await wrapper.findAll('input')[0].setValue('Pat');
    await wrapper.findAll('input')[3].setValue('555-0100');
    const profile = { firstName: 'Pat', phone: '555-0100', fullName: 'Pat' };
    api.put.mockResolvedValue({ data: { guardian_intake_profile: profile } });
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/clients/22/guardian-contact', expect.objectContaining({ firstName: 'Pat', phone: '555-0100', email: '' }));
    expect(wrapper.emitted('saved')).toEqual([[profile]]); expect(wrapper.text()).toContain('Guardian contact saved.');
  });
  it('prefills current values and keeps unsaved edits after a failed save', async () => {
    const wrapper = mount(ClientGuardianContactEditor, { props: { clientId: 22, profile: { firstName: 'Pat', lastName: 'Example', email: 'pat@example.com' } } });
    await wrapper.get('button').trigger('click');
    expect(wrapper.get('input[type=email]').element.value).toBe('pat@example.com');
    api.put.mockRejectedValue({ response: { data: { error: { message: 'Unable to save' } } } });
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toBe('Unable to save'); expect(wrapper.emitted('saved')).toBeUndefined();
    expect(wrapper.get('input[type=email]').element.value).toBe('pat@example.com');
  });
  it('cancels without changing the record', async () => {
    const wrapper = mount(ClientGuardianContactEditor, { props: { clientId: 22 } });
    await wrapper.get('button').trigger('click');
    await wrapper.findAll('button').find(b => b.text() === 'Cancel').trigger('click');
    expect(api.put).not.toHaveBeenCalled(); expect(wrapper.find('form').exists()).toBe(false);
  });
  it('does not apply an earlier client’s response after switching clients', async () => {
    let finish; api.put.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const wrapper = mount(ClientGuardianContactEditor, { props: { clientId: 22 } });
    await wrapper.get('button').trigger('click'); await wrapper.findAll('input')[0].setValue('Pat');
    await wrapper.get('form').trigger('submit');
    await wrapper.setProps({ clientId: 33, profile: null });
    finish({ data: { guardian_intake_profile: { firstName: 'Pat' } } }); await flushPromises();
    expect(wrapper.emitted('saved')).toBeUndefined(); expect(wrapper.text()).not.toContain('Pat');
    expect(wrapper.find('form').exists()).toBe(false);
  });
});
