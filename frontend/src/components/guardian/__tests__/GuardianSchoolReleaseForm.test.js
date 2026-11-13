import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import api from '../../../services/api';
import Form from '../GuardianSchoolReleaseForm.vue';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../public/SmartSchoolRoiFlow.vue', () => ({
  default: {
    props: ['publicKey', 'sessionToken', 'roiContext', 'link', 'boundClient'],
    template: '<form class="school-roi-form">Begin release for {{ roiContext.school.name }}</form>'
  }
}));

describe('in-portal school release', () => {
  it('does not open a public release form when this guardian has no document access',async()=>{
    api.get.mockRejectedValueOnce({response:{status:403}});
    const wrapper=mount(Form,{props:{clientId:928}});await flushPromises();
    expect(wrapper.find('form').exists()).toBe(false);expect(api.get).toHaveBeenCalledTimes(1);wrapper.unmount();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    api.post.mockResolvedValue({ data: { sessionToken: 'real-issued-release-session-123456' } });
  });
  it('shows the school release form without a signing link', async () => {
    api.get.mockImplementation(async (url) => {
      if (String(url).includes('/school-release')) {
        return { data: { ready: true, publicKey: 'abc123', schoolOrganizationId: 326, schoolName: 'Twain Elementary School', status: 'in_progress' } };
      }
      return { data: { roiContext: { school: { name: 'Twain Elementary School' } }, link: { id: 85, title: 'Smart School ROI' }, boundClient: { id: 928 } } };
    });
    const wrapper = mount(Form, { props: { clientId: 928 } });
    await flushPromises();
    expect(wrapper.text()).toContain('Begin release for Twain Elementary School');
    expect(wrapper.text()).not.toContain('http');
    expect(wrapper.find('a').exists()).toBe(false);
    expect(api.get).toHaveBeenCalledWith('/guardian-portal/clients/928/school-release');
    expect(api.get).toHaveBeenCalledWith('/public-intake/abc123');
    expect(api.post).toHaveBeenCalledWith('/public-intake/abc123/session', {});
    expect(wrapper.findComponent({name:'SmartSchoolRoiFlow'}).props('sessionToken')).toBe('real-issued-release-session-123456');
    wrapper.findComponent({name:'SmartSchoolRoiFlow'}).vm.$emit('completed',{documentId:99});
    await flushPromises();expect(wrapper.emitted('completed')?.[0]).toEqual([{documentId:99}]);
    wrapper.unmount();
  });

  it('shows the completed release without reopening a blank form', async () => {
    api.get.mockResolvedValue({ data: { ready: false, status: 'completed', schoolOrganizationId: 326 } });
    const wrapper = mount(Form, { props: { clientId: 928, schoolId: 326 } });
    await flushPromises();
    expect(wrapper.text()).toContain('This school release is signed and saved on the chart.');
    expect(wrapper.find('form').exists()).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not show another school’s release on a former school', async () => {
    api.get.mockResolvedValue({ data: { ready: true, publicKey: 'abc123', schoolOrganizationId: 326, schoolName: 'Twain' } });
    const wrapper = mount(Form, { props: { clientId: 928, schoolId: 19 } });
    await flushPromises();
    expect(wrapper.find('form').exists()).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('never opens a signing form if the real session request fails or returns no token', async () => {
    api.get.mockImplementation(async url => ({ data: String(url).includes('/school-release')
      ? { ready: true, publicKey: 'abc123' }
      : { roiContext: { school: { name: 'Twain' } }, link: { id: 85 } } }));
    api.post.mockResolvedValue({ data: {} });
    const wrapper = mount(Form, { props: { clientId: 928 } });
    await flushPromises();
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').text()).toContain('could not be opened');
    wrapper.unmount();
  });

  it('discards a late session response after switching children', async () => {
    let finishFirst;
    api.get.mockImplementation(async url => {
      if (String(url).includes('/school-release')) return { data: { ready: true, publicKey: String(url).includes('/928/') ? 'child-one' : 'child-two' } };
      return { data: { roiContext: { school: { name: 'Twain' } }, link: { id: 85 } } };
    });
    api.post.mockImplementation(url => String(url).includes('child-one')
      ? new Promise(resolve => { finishFirst = resolve; })
      : Promise.resolve({ data: { sessionToken: 'second-child-real-session-123456' } }));
    const wrapper = mount(Form, { props: { clientId: 928 } });
    await flushPromises();
    await wrapper.setProps({ clientId: 929 });
    await flushPromises();
    finishFirst({ data: { sessionToken: 'first-child-real-session-123456' } });
    await flushPromises();
    expect(wrapper.findComponent({name:'SmartSchoolRoiFlow'}).props()).toMatchObject({
      publicKey: 'child-two', sessionToken: 'second-child-real-session-123456'
    });
    wrapper.unmount();
  });
});

it('shows both guardian decisions and the restrictive result on the completed release',async()=>{
 api.get.mockResolvedValue({data:{status:'completed',decisions:[{schoolStaffUserId:3,staffName:'Synthetic Staff',effectiveDecision:'none',conflict:true,guardians:[{guardianName:'Parent One',decision:'roi_docs'},{guardianName:'Parent Two',decision:'none'}]}]}});
 const wrapper=mount(Form,{props:{clientId:928}});await flushPromises();
 expect(wrapper.text()).toContain('Parent One: Permitted goals and objectives');
 expect(wrapper.text()).toContain('Parent Two: No clinical sharing');
 expect(wrapper.text()).toContain('The more restrictive permission applies.');
 expect(wrapper.find('form').exists()).toBe(false);wrapper.unmount();
});
