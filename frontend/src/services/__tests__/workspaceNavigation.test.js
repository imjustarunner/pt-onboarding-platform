import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigateWorkspace } from '../workspaceNavigation';
import api from '../api';
import { hasRememberedGoogleAccount } from '../../utils/googleAccountMemory';

vi.mock('../api', () => ({ default: { post: vi.fn() } }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => ({ user: { role: 'super_admin' } }) }));
vi.mock('../../store/branding', () => ({ useBrandingStore: () => ({ portalHostPortalUrl: 'itsco' }) }));
vi.mock('../../utils/googleAccountMemory', () => ({ hasRememberedGoogleAccount: vi.fn(() => false) }));

describe('workspace transitions', () => {
  let location;
  const router = { resolve: ({ path }) => ({ href: path }), push: vi.fn(), replace: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    hasRememberedGoogleAccount.mockReturnValue(false);
    location = { hostname: 'app.itsco.health', assign: vi.fn(), replace: vi.fn() };
    vi.stubGlobal('window', { location });
    api.post.mockResolvedValue({ data: { handoffToken: 'one-time-code' } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hands off authentication to HQ and navigates without changing the current workspace first', async () => {
    await navigateWorkspace({ hostname: 'plottwisthq.com', path: '/tisi/admin' }, router, { agencyId: 2 });
    expect(api.post).toHaveBeenCalledWith('/auth/brand-switch/handoff', { targetHost: 'plottwisthq.com', agencyId: 2, rememberGoogle: false }, expect.any(Object));
    expect(location.assign).toHaveBeenCalledWith('https://plottwisthq.com/tisi/admin?bs=one-time-code');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('reloads on an HQ tenant switch without minting a cross-host token', async () => {
    location.hostname = 'plottwisthq.com';
    await navigateWorkspace({ hostname: 'plottwisthq.com', path: '/itsco/admin' }, router);
    expect(api.post).not.toHaveBeenCalled();
    expect(location.assign).toHaveBeenCalledWith('https://plottwisthq.com/itsco/admin');
  });

  it('preserves an opted-in remembered Google account across hosts', async () => {
    hasRememberedGoogleAccount.mockReturnValue(true);
    await navigateWorkspace({ hostname: 'plottwisthq.com', path: '/admin' }, router);
    expect(api.post).toHaveBeenCalledWith('/auth/brand-switch/handoff', { targetHost: 'plottwisthq.com', rememberGoogle: true }, expect.any(Object));
  });

  it('lets the destination require login when handoff is unavailable', async () => {
    api.post.mockRejectedValue(new Error('Unavailable'));
    await navigateWorkspace({ hostname: 'plottwisthq.com', path: '/admin' }, router);
    expect(location.assign).toHaveBeenCalledWith('https://plottwisthq.com/admin');
  });
});
