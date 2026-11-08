import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import api from '../../../services/api';
import Form from '../GuardianSchoolReleaseForm.vue';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
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
  beforeEach(() => vi.clearAllMocks());
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
    wrapper.unmount();
  });

  it('does not show another school’s release on a former school', async () => {
    api.get.mockResolvedValue({ data: { ready: true, publicKey: 'abc123', schoolOrganizationId: 326, schoolName: 'Twain' } });
    const wrapper = mount(Form, { props: { clientId: 928, schoolId: 19 } });
    await flushPromises();
    expect(wrapper.find('form').exists()).toBe(false);
    wrapper.unmount();
  });
});
