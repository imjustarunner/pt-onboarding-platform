import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SchoolClientChatModal from '../SchoolClientChatModal.vue';
import { useAuthStore } from '../../../store/auth';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn()
  }
}));

describe('SchoolClientChatModal', () => {
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);

    const authStore = useAuthStore();
    authStore.user = { id: 1, role: 'school_staff' };

    api.get.mockImplementation(async (url) => {
      if (String(url).includes('/comments')) {
        return { data: [] };
      }
      if (String(url).startsWith('/clients/')) {
        return { data: {} };
      }
      return { data: {} };
    });
    api.post.mockResolvedValue({ data: {} });
  });

  it('renders comments + messages panes and auto-expands on interaction', async () => {
    const wrapper = mount(SchoolClientChatModal, {
      props: {
        client: { id: 10, initials: 'AB', client_status_key: 'active', client_status_label: 'Active' },
        schoolOrganizationId: 123
      },
      global: {
        plugins: [pinia],
        stubs: {
          ClientTicketThreadPanel: true,
          WaitlistNoteModal: true
        }
      }
    });

    // Let onMounted() finish.
    await new Promise((r) => setTimeout(r, 0));

    // Both panes visible by default.
    expect(wrapper.find('.dual').classes()).toContain('dual-active-both');
    expect(wrapper.text()).toContain('Comments');
    expect(wrapper.text()).toContain('Messages (ticketed)');
    expect(wrapper.text()).toContain('If you have a question about the client, please send us a message.');
    expect(wrapper.text()).toContain('Messages are for questions/inquiries');

    // Interacting with Messages expands it.
    const msgPane = wrapper.find('[data-tour="school-client-modal-messages"]');
    await msgPane.trigger('focusin');
    expect(wrapper.find('.dual').classes()).toContain('dual-active-messages');

    // Show both resets.
    const showBoth = wrapper.find('[data-tour="school-client-modal-messages"] .btn-link');
    await showBoth.trigger('click');
    expect(wrapper.find('.dual').classes()).toContain('dual-active-both');
  });
});

