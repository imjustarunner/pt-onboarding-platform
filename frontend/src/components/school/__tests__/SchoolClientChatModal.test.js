import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
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

    vi.clearAllMocks();
    api.get.mockImplementation(async (url) => {
      if (String(url).includes('/comments')) {
        return { data: [] };
      }
      if (String(url).startsWith('/clients/')) {
        return { data: { parent_contact_attempt_count: 3 } };
      }
      return { data: {} };
    });
    api.post.mockResolvedValue({ data: {} });
  });

  it('renders comments + messages panes and auto-expands on interaction', async () => {
    const wrapper = mount(SchoolClientChatModal, {
      props: {
        client: { id: 10, initials: 'AB', client_status_key: 'active', client_status_label: 'Active', school_staff_effective_access_state: 'roi' },
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
    expect(wrapper.text()).toContain('Contact attempts: 3');
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

  it('opens a client-specific school consent on SchoolCareBridge from the agency app', async () => {
    const originalUrl = window.location.href;
    globalThis.jsdom.reconfigure({ url: 'https://app.itsco.health/itsco/dashboard' });
    let wrapper;
    try {
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);
      api.post.mockImplementation(async url => ({ data: String(url).endsWith('/smart-roi-link') ? { issued_link: { public_key: 'school-consent-key' } } : {} }));
      wrapper = mount(SchoolClientChatModal, {
        props: { client: { id: 10, initials: 'AB', school_staff_effective_access_state: 'roi' }, schoolOrganizationId: 123 },
        global: { plugins: [pinia], stubs: { ClientTicketThreadPanel: true, WaitlistNoteModal: true } }
      });
      await flushPromises();
      await wrapper.findAll('button').find(button => button.text() === 'Launch Smart ROI').trigger('click');
      await flushPromises();
      expect(open).toHaveBeenCalledWith('https://schoolcarebridge.org/intake/school-consent-key', '_blank', 'noopener');
    } finally {
      wrapper?.unmount();
      globalThis.jsdom.reconfigure({ url: originalUrl });
    }
  });
});


it('hides expired ROI history and documents without requesting their contents', async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: 1, role: 'school_staff' };
  vi.clearAllMocks();
  const wrapper = mount(SchoolClientChatModal, {
    props: { client: { id: 10, initials: 'AB', school_staff_effective_access_state: 'expired' }, schoolOrganizationId: 123 },
    global: { plugins: [pinia], stubs: { ClientTicketThreadPanel: true, PhiDocumentsPanel: true } }
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(wrapper.text()).toContain('ROI expired');
  expect(wrapper.find('.dual').exists()).toBe(false);
  expect(wrapper.findComponent({ name: 'PhiDocumentsPanel' }).exists()).toBe(false);
  expect(api.get).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
  wrapper.unmount();
});
