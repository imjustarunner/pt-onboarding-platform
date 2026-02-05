import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import SchoolNotificationsPanel from '../redesign/SchoolNotificationsPanel.vue';
import { useAuthStore } from '../../../store/auth';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn()
  }
}));

describe('SchoolNotificationsPanel', () => {
  let pinia;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T12:00:00.000Z'));

    pinia = createPinia();
    setActivePinia(pinia);

    const authStore = useAuthStore();
    authStore.user = { id: 5, role: 'admin' };

    api.get.mockImplementation(async (url) => {
      const u = String(url);
      if (u === '/users/5/preferences') {
        return { data: { school_portal_notifications_progress: { '123': '2026-01-01T00:00:00.000Z' } } };
      }
      if (u === '/school-portal/123/notifications/feed') {
        return {
          data: [
            { id: 'n1', kind: 'announcement', title: 'T1', message: 'M1', created_at: '2026-01-05T00:00:00.000Z', actor_name: 'A' },
            { id: 'n2', kind: 'announcement', title: 'T2', message: 'M2', created_at: '2026-01-09T00:00:00.000Z', actor_name: 'B' }
          ]
        };
      }
      return { data: {} };
    });
    api.put.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not mark notifications as seen on open', async () => {
    const wrapper = mount(SchoolNotificationsPanel, {
      props: { schoolOrganizationId: 123 },
      global: { plugins: [pinia] }
    });

    // Flush immediate watch + onMounted async work.
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
      await nextTick();
    }

    // Admins can create announcements.
    expect(wrapper.text()).toContain('Create announcement');

    // Panel should not mark as seen automatically.
    expect(api.post).not.toHaveBeenCalled();

    // Items should still be unread.
    expect(wrapper.findAll('.item.unread').length).toBeGreaterThan(0);

    // Mark all read should update preferences.
    const buttons = wrapper.findAll('button');
    const markBtn = buttons.find((btn) => btn.text().includes('Mark all read'));
    expect(markBtn).toBeTruthy();
    await markBtn.trigger('click');
    await nextTick();
    expect(api.post).toHaveBeenCalled();
    const lastCall = api.post.mock.calls[api.post.mock.calls.length - 1];
    expect(lastCall?.[0]).toBe('/school-portal/123/notifications/read');
  });
});

