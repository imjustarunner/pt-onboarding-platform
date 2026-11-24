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
  it('keeps Plotline prominent while showing the correct employer logo/name and contact link', async () => {
    api.get.mockResolvedValue({data:{agencyName:'ITSCO',candidateLabel:'QA Applicant',branding:{logoUrl:'https://itsco.health/assets/plotline/careers/itsco-logo.png',colorPalette:{primary:'#16457c'}},contact:{email:'po@itsco.health',teamLabel:'People Operations'},referenceName:'QA Referee',questionnaire:{version:3,traits:[]}}});
    const wrapper=mount(Form);await flushPromises();
    expect(wrapper.get('.reference-header img').attributes('alt')).toContain('Plotline');
    const employer=wrapper.get('.reference-employer');expect(employer.text()).toContain('ITSCO');
    expect(employer.get('img').attributes('src')).toBe('https://itsco.health/assets/plotline/careers/itsco-logo.png');
    expect(employer.get('a').attributes('href')).toBe('mailto:po@itsco.health');
    expect(wrapper.text()).not.toContain('Juniper');wrapper.unmount();
  });
  it('does not render unsafe employer images or contact URLs', async () => {
    api.get.mockResolvedValue({data:{agencyName:'Company QA',branding:{logoUrl:'javascript:alert(1)'},contact:{email:'javascript:alert(1)'},questionnaire:{version:3,traits:[]}}});
    const wrapper=mount(Form);await flushPromises();
    expect(wrapper.get('.reference-employer').find('img').exists()).toBe(false);
    expect(wrapper.get('.reference-employer').find('a').exists()).toBe(false);wrapper.unmount();
  });
  it('lists known contact details without repeated identity questions and saves explicit corrections with the answer', async () => {
    api.get.mockResolvedValue({data:{agencyName:'Juniper QA',candidateLabel:'Rory Q.',referenceContact:{referenceName:'Taylor Reference',referenceEmail:'taylor@example.test',referencePhone:'555-0100',referenceOrganization:'Example Consulting',relationshipType:'other',relationshipOther:'Former project mentor',relationshipDuration:'3_5_years'},questionnaire:{version:3,traits:[]}}});
    const wrapper = mount(Form);await flushPromises();
    const identity=wrapper.get('[aria-label="Your reference details"]');
    expect(identity.text()).toContain('Taylor Reference');expect(identity.text()).toContain('taylor@example.test');expect(identity.text()).toContain('555-0100');expect(identity.text()).toContain('Example Consulting');expect(identity.text()).toContain('Former project mentor');
    expect(identity.find('input').exists()).toBe(false);
    expect(wrapper.get('.reference-questionnaire').find('input[autocomplete="name"]').exists()).toBe(false);
    expect(wrapper.findAll('select').some(select=>select.element.value==='3_5_years')).toBe(true);
    await identity.get('button').trigger('click');
    expect(identity.get('[name="referenceEmail"]').element.value).toBe('taylor@example.test');
    await identity.get('[name="referenceEmail"]').setValue('corrected@example.test');
    await identity.get('[name="referencePhone"]').setValue('555-0101');
    await identity.get('button').trigger('click');
    await wrapper.get('form').trigger('submit');
    expect(api.post).not.toHaveBeenCalled();expect(wrapper.text()).toContain('corrected@example.test');
    await wrapper.findAll('button').find(button=>button.text()==='Edit responses').trigger('click');
    expect(wrapper.get('[aria-label="Your reference details"]').text()).toContain('corrected@example.test');
    await wrapper.get('form').trigger('submit');await wrapper.get('form').trigger('submit');await flushPromises();
    expect(api.post.mock.calls[0][1]).toMatchObject({referenceName:'Taylor Reference',referenceEmail:'corrected@example.test',referencePhone:'555-0101',relationshipType:'other',relationshipOther:'Former project mentor'});
    expect(api.get).toHaveBeenCalledTimes(1);wrapper.unmount();
  });
  it('opens only missing identity fields with known values already populated', async () => {
    const wrapper = mount(Form);await flushPromises();
    const identity=wrapper.get('[aria-label="Your reference details"]');
    expect(identity.text()).toContain('Complete any missing details');
    expect(identity.get('[name="referenceName"]').element.value).toBe('QA Reference');
    expect(identity.get('[name="relationshipType"]').element.value).toBe('');
    expect(identity.get('[name="referencePhone"]').attributes('required')).toBeUndefined();wrapper.unmount();
  });
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
