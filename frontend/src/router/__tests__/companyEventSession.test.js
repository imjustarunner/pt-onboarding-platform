import { beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import router from '../index';
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
});
it('recovers a valid cookie on a public event before deciding whether to show sign-in', async () => {
  api.get.mockImplementation(async url => ({ data: url === '/users/me' ? { id: 712, role: 'staff', status: 'active', email: 'synthetic@example.test' } : {} }));
  expect(useAuthStore().isAuthenticated).toBe(false);
  await router.push('/conversa/events/itsco/potluck-8#event-potluck');
  expect(api.get).toHaveBeenCalledWith('/users/me', { skipGlobalLoading: true, skipAuthRedirect: true });
  expect(useAuthStore().user.id).toBe(712);
  expect(router.currentRoute.value.fullPath).toBe('/conversa/events/itsco/potluck-8#event-potluck');
});
it('keeps anonymous invitations public when there is no authenticated cookie', async () => {
  api.get.mockImplementation(async url => {
    if (url === '/users/me') throw { response: { status: 401 } };
    return { data: {} };
  });
  await router.push('/conversa/events/itsco/public-potluck-9');
  expect(useAuthStore().isAuthenticated).toBe(false);
  expect(router.currentRoute.value.name).toBe('ConversaEvent');
});
