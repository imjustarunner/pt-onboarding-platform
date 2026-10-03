import { describe, it, expect } from 'vitest';
import { school, providers, clients, demoResponse } from '../fixtures';

describe('public school demo boundary', () => {
  it('resolves fictional provider profiles and assigned students through the shared portal contracts', () => {
    for (const provider of providers) {
      const base = `/school-portal/${school.id}/providers/${provider.provider_user_id}`;
      expect(demoResponse(`${base}/profile`).first_name).toBe(provider.first_name);
      expect(demoResponse(`${base}/assigned-clients`)).toEqual(clients.filter(c => c.provider_id === provider.provider_user_id));
    }
  });
  it('rejects every mutation and unknown destination without a network fallback', () => {
    for (const method of ['post', 'put', 'patch', 'delete']) {
      expect(() => demoResponse(`/school-portal/${school.id}/clients`, { method })).toThrow(/Nothing was sent or saved/);
    }
    for (const path of ['/billing/claims', '/auth/login', '/school-portal/1/clients', `/school-portal/${school.id}/providers/1/profile`, '/clients/1', `/school-portal/${school.id}/clients/1/comments`]) {
      expect(() => demoResponse(path)).toThrow(/fictional demo/);
    }
  });
  it('uses the real roster search contract without adding records', () => {
    expect(demoResponse(`/school-portal/${school.id}/clients`, { params: { q: 'Willow' } })).toHaveLength(1);
    expect(demoResponse(`/school-portal/${school.id}/clients?q=unknown`)).toEqual([]);
    expect(clients).toHaveLength(4);
  });
});
