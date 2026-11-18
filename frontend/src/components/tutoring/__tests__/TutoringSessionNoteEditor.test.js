import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, it, expect, vi } from 'vitest';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../../services/api', () => ({ default: api }));
import Editor from '../TutoringSessionNoteEditor.vue';

beforeEach(() => { api.mockReset(); });
const loaded = text => ({ data: { note: { summary: text, homework: 'Draw a model' } } });
const button = (wrapper, label) => wrapper.findAll('button').find(b => b.text() === label);

it('keeps draft text on a failed save and requires an ended visit plus personal confirmation to share', async () => {
  api.mockResolvedValueOnce(loaded('Original work')).mockRejectedValueOnce(new Error('Offline'));
  const wrapper = mount(Editor, { props: { appointmentId: 375, ended: false } });
  try {
    await flushPromises();
    await wrapper.find('textarea').setValue('Reviewed fraction work');
    await button(wrapper, 'Save session notes').trigger('click');
    await flushPromises();
    expect(wrapper.find('textarea').element.value).toBe('Reviewed fraction work');
    expect(wrapper.text()).toContain('Your text is kept');
    expect(button(wrapper, 'Sign and share').element.disabled).toBe(true);
    await wrapper.setProps({ ended: true });
    expect(button(wrapper, 'Sign and share').element.disabled).toBe(true);
    await wrapper.find('.attest input').setValue(true);
    api.mockResolvedValueOnce({ data: { note: { status: 'signed' } } });
    await button(wrapper, 'Sign and share').trigger('click');
    await flushPromises();
    expect(api.mock.calls.at(-1)[0].data).toMatchObject({
      signAndShare: true, signatureConfirmed: true, workedOn: 'Reviewed fraction work'
    });
    expect(wrapper.find('textarea').attributes()).toHaveProperty('readonly');
    expect(button(wrapper, 'Save session notes')).toBeUndefined();
  } finally { wrapper.unmount(); }
});

it('discards a stale save response after a service switch and allows the new draft to save', async () => {
  let finishOld;
  api.mockImplementation(config => {
    if (config.method === 'get') return Promise.resolve(loaded(`Service ${config.params.serviceId}`));
    if (config.params.serviceId === 1038) return new Promise(resolve => { finishOld = resolve; });
    return Promise.resolve({ data: { note: { status: 'saved' } } });
  });
  const wrapper = mount(Editor, { props: { appointmentId: 375, params: { serviceId: 1038 } } });
  try {
    await flushPromises();
    await button(wrapper, 'Save session notes').trigger('click');
    await wrapper.setProps({ params: { serviceId: 1042 } });
    await flushPromises();
    expect(wrapper.find('textarea').element.value).toBe('Service 1042');
    expect(button(wrapper, 'Save session notes').element.disabled).toBe(false);
    finishOld({ data: { note: { status: 'signed' } } });
    await flushPromises();
    expect(wrapper.find('textarea').element.value).toBe('Service 1042');
    expect(wrapper.text()).not.toContain('Signed and shared');
    await button(wrapper, 'Save session notes').trigger('click');
    await flushPromises();
    expect(api.mock.calls.at(-1)[0].params.serviceId).toBe(1042);
    expect(wrapper.text()).toContain('Session notes saved');
  } finally { wrapper.unmount(); }
});

it('does not prefill private plan results into the family summary',async()=>{api.mockResolvedValueOnce({data:{note:{status:'saved',summary:'Private checklist results',homework:'Private staff instructions',metadata_json:{documentationMode:'learning_plan_checklist'}}}});const wrapper=mount(Editor,{props:{appointmentId:375}});try{await flushPromises();expect(wrapper.findAll('textarea').map(t=>t.element.value)).toEqual(['','','']);expect(wrapper.text()).not.toContain('Private checklist results');expect(wrapper.text()).not.toContain('Private staff instructions');}finally{wrapper.unmount();}});
