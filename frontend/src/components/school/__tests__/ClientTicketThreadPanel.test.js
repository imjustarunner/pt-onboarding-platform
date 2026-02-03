import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ClientTicketThreadPanel from '../ClientTicketThreadPanel.vue';
import { useAuthStore } from '../../../store/auth';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

describe('ClientTicketThreadPanel', () => {
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);

    const authStore = useAuthStore();
    authStore.user = { id: 1, role: 'school_staff' };

    api.get.mockImplementation(async (url) => {
      const u = String(url);
      if (u === '/support-tickets/client-tickets') {
        return {
          data: {
            tickets: [
              { id: 200, status: 'closed', question: 'Q2', answer: 'A2', ai_summary: 'S2' },
              { id: 100, status: 'open', question: 'Q1', answer: null, ai_summary: null }
            ]
          }
        };
      }
      if (u === '/support-tickets/100/messages') {
        return {
          data: {
            ticket: { id: 100, status: 'open', question: 'Q1' },
            messages: [{ id: 1, parent_message_id: null, body: 'Hello', created_at: new Date().toISOString() }]
          }
        };
      }
      if (u === '/support-tickets/200/messages') {
        return {
          data: {
            ticket: { id: 200, status: 'closed', question: 'Q2', answer: 'A2', ai_summary: 'S2' },
            messages: [{ id: 2, parent_message_id: null, body: 'Closed thread', created_at: new Date().toISOString() }]
          }
        };
      }
      return { data: {} };
    });
  });

  it('loads ticket history and defaults to newest open/answered ticket', async () => {
    const wrapper = mount(ClientTicketThreadPanel, {
      props: {
        client: { id: 10, initials: 'AB' },
        schoolOrganizationId: 123
      },
      global: {
        plugins: [pinia],
        stubs: {
          SupportTicketThreadMessage: true
        }
      }
    });

    await new Promise((r) => setTimeout(r, 0));

    // It should select ticket #100 (open) even though #200 is newer but closed.
    expect(wrapper.text()).toContain('Ticket #100');
    expect(api.get).toHaveBeenCalledWith('/support-tickets/client-tickets', expect.any(Object));
    expect(api.get).toHaveBeenCalledWith('/support-tickets/100/messages');
    expect(wrapper.find('.summary-card').exists()).toBe(false);
  });

  it('selects a different ticket and shows clickable summary for closed/answered', async () => {
    const wrapper = mount(ClientTicketThreadPanel, {
      props: {
        client: { id: 10, initials: 'AB' },
        schoolOrganizationId: 123
      },
      global: {
        plugins: [pinia],
        stubs: {
          SupportTicketThreadMessage: true
        }
      }
    });

    await new Promise((r) => setTimeout(r, 0));

    const closedBtn = wrapper.findAll('button.ticket-item').find((b) => b.text().includes('#200'));
    expect(closedBtn).toBeTruthy();
    await closedBtn.trigger('click');

    // Let async selection + message load resolve.
    await new Promise((r) => setTimeout(r, 0));

    expect(api.get).toHaveBeenCalledWith('/support-tickets/200/messages');
    expect(wrapper.text()).toContain('Ticket #200');
    expect(wrapper.find('.summary-card').exists()).toBe(true);
  });

  it('can explicitly start a new ticket even when a ticket is selected', async () => {
    api.post.mockResolvedValue({ data: { id: 300, status: 'open', question: 'New Q' } });

    const wrapper = mount(ClientTicketThreadPanel, {
      props: {
        client: { id: 10, initials: 'AB' },
        schoolOrganizationId: 123
      },
      global: {
        plugins: [pinia],
        stubs: {
          SupportTicketThreadMessage: true
        }
      }
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.text()).toContain('Ticket #100');

    // Enter "new ticket" mode.
    const newTicketBtn = wrapper.find('.tickets-header .btn-link');
    await newTicketBtn.trigger('click');
    expect(wrapper.text()).toContain('Starting a new ticket');

    // Send should create a new ticket (POST /support-tickets).
    await wrapper.find('textarea.textarea').setValue('Help with something new');
    await wrapper.find('button.btn.btn-primary').trigger('click');

    expect(api.post).toHaveBeenCalledWith('/support-tickets', expect.objectContaining({ question: 'Help with something new' }));
  });
});

