import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../auth';
vi.mock('../../services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: {} }), post: vi.fn() } }));
beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });
describe('public demo authentication', () => {
  it('keeps preview identity available without activating authenticated app behavior', () => {
    const auth = useAuthStore();
    auth.user = { id: 990010, role: 'school_staff', __schoolOnboardingDemoUser: true };
    expect(auth.user.id).toBe(990010);
    expect(auth.isAuthenticated).toBe(false);
  });
  it('continues to recognize a real school account', () => {
    const auth = useAuthStore();
    auth.user = { id: 42, role: 'school_staff', status: 'ACTIVE_EMPLOYEE' };
    expect(auth.isAuthenticated).toBe(true);
  });
});
