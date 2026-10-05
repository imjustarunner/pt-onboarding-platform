import { describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import QuickChecklistModal from '../QuickChecklistModal.vue';
const mocks = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { put: mocks.put } }));

describe('checklist save feedback', () => {
  it('shows service confirmation and outstanding weekday without closing', async () => {
    mocks.put.mockResolvedValue({ data: { serviceConfirmation: { message: 'Being Seen confirmed. A school weekday still needs to be assigned.' } } });
    const wrapper = mount(QuickChecklistModal, { props: { client: { id: 5, first_service_at: '2026-09-15' } } });
    await wrapper.find('button.btn-primary').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="status"]').text()).toContain('Being Seen confirmed');
    expect(wrapper.find('[role="status"]').text()).toContain('weekday');
    expect(wrapper.emitted('saved')).toHaveLength(1);
    expect(wrapper.emitted('close')).toBeUndefined();
    wrapper.unmount();
  });
});
