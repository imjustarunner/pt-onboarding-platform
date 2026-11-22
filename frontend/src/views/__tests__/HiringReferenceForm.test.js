// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Form from '../public/HiringReferenceFormView.vue';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: api }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { token: 'synthetic-reference' } }) }));
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: {
    agencyName: 'Juniper Consulting QA', candidateLabel: 'Rory Q.', referenceName: 'QA Reference',
    questionnaire: { scale: '1 to 5', traits: [] }, disclaimer: 'Confidential reference.'
  } });
  api.post.mockResolvedValue({ data: { ok: true } });
});
describe('Plotline public reference', () => {
  it('reviews before submitting and retains the organization signup link after completion', async () => {
    const wrapper = mount(Form);
    await flushPromises();
    expect(wrapper.get('img').attributes('alt')).toContain('Plotline');
    await wrapper.get('form').trigger('submit');
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Review your responses');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(api.post).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Your response has been sent to Juniper Consulting QA');
    const link = wrapper.findAll('a').find(a => a.text() === 'Want to use Plotline for your organization?');
    expect(link.attributes('href')).toBe('https://plotlinepo.com/plotline/start');
    expect(link.attributes('rel')).toContain('noreferrer');
    wrapper.unmount();
  });
  it('shows an expired invitation without exposing a questionnaire', async () => {
    api.get.mockRejectedValue({ response: { data: { error: { message: 'This reference link has expired.' } } } });
    const wrapper = mount(Form);
    await flushPromises();
    expect(wrapper.text()).toContain('This reference link has expired.');
    expect(wrapper.find('form').exists()).toBe(false);
    wrapper.unmount();
  });
  it('lets a referee decline without submitting partially filled answers', async () => {
    const wrapper = mount(Form);
    await flushPromises();
    await wrapper.findAll('button').find(b=>b.text()==='Unable to provide a reference').trigger('click');
    expect(api.post).not.toHaveBeenCalled();
    await wrapper.findAll('button').find(b=>b.text()==='Confirm unable to provide').trigger('click');
    await flushPromises();
    expect(api.post.mock.calls[0][1]).toEqual({declined:true});
    expect(wrapper.text()).toContain('The hiring team has been told');
    wrapper.unmount();
  });

});
