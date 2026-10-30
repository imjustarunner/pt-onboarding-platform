import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import GuardianEnrollmentStart from '../GuardianEnrollmentStart.vue';
const { get, post, push } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), push: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { get, post } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
beforeEach(() => {
 vi.resetAllMocks();
 get.mockResolvedValue({ data: { options: [
  { id: 1, agencyId: 450, agencyName: 'Demo', channel: 'office', language: 'en' },
  { id: 2, agencyId: 450, agencyName: 'Demo', channel: 'school', organizationName: 'Cedar Grove', language: 'es' }
 ] } });
 post.mockResolvedValue({ data: { path: '/intake/office-key?session=abcdef123456' } });
});
it('starts a child enrollment with only the selected form and subject, then opens its private session', async () => {
 const wrapper = mount(GuardianEnrollmentStart, { props: { agencyId: 450 } }); await flushPromises();
 await wrapper.find('form').trigger('submit'); await flushPromises();
 expect(post).toHaveBeenCalledWith('/guardian-portal/enrollments', { linkId: 1, subject: 'dependent' });
 expect(push).toHaveBeenCalledWith('/intake/office-key?session=abcdef123456');wrapper.unmount();
});
it('offers self enrollment with office forms and prevents using a school form for the adult', async () => {
 const wrapper = mount(GuardianEnrollmentStart, { props: { agencyId: 450, language: 'es' } }); await flushPromises();
 await wrapper.find('input[value="self"]').setValue();
 expect(wrapper.findAll('option').map(option => option.text()).join(' ')).not.toContain('Cedar Grove');
 await wrapper.find('select').setValue('1'); await wrapper.find('form').trigger('submit'); await flushPromises();
 expect(post).toHaveBeenCalledWith('/guardian-portal/enrollments', { linkId: 1, subject: 'self' });
 expect(wrapper.text()).toContain('Inscribir');wrapper.unmount();
});
it('shows an actionable start failure without navigating or losing the selected choice', async () => {
 post.mockRejectedValue({ response: { data: { error: { message: 'Enrollment unavailable' } } } });
 const wrapper = mount(GuardianEnrollmentStart, { props: { agencyId: 450 } }); await flushPromises();
 await wrapper.find('form').trigger('submit'); await flushPromises();
 expect(wrapper.find('[role="alert"]').text()).toContain('Enrollment unavailable');
 expect(wrapper.find('select').element.value).toBe('1');expect(push).not.toHaveBeenCalled();wrapper.unmount();
});
