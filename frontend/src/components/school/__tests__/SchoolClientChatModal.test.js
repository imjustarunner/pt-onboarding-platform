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

  it('defaults to Comments tab and shows school_staff guidance', async () => {
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

    expect(wrapper.find('.tab.active').text()).toContain('Comments');
    expect(wrapper.text()).toContain('If you have a question about the client, please send us a message.');

    const tabs = wrapper.findAll('button.tab');
    await tabs[1].trigger('click'); // Messages
    expect(wrapper.find('.tab.active').text()).toContain('Messages');
    expect(wrapper.text()).toContain('Messages are for questions/inquiries');
  });
});

