import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../api';
import { getStartupData } from '../startupRequests';
vi.mock('../api', () => ({ default: { get: vi.fn() } }));
const path = '/communications/center-summary';
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe('shared dashboard startup reads', () => {
  it('shares pending reads and gives each caller independent data, then fetches fresh data', async () => {
    let finish;
    api.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue({ data: { tickets: { open: 9 } } });
    const first = getStartupData(path, { params: { agencyId: 2 }, skipGlobalLoading: true });
    const second = getStartupData(path, { params: { agencyId: 2 }, skipAuthRedirect: true });
    expect(api.get).toHaveBeenCalledTimes(1);
    finish({ data: { tickets: { open: 4 } } });
    const [one, two] = await Promise.all([first, second]);
    one.data.tickets.open = 0;
    expect(two.data.tickets.open).toBe(4);
    expect((await getStartupData(path, { params: { agencyId: 2 } })).data.tickets.open).toBe(9);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('keeps sharing during profile hydration and bounds a stalled shared request', async () => {
    let finish;
    api.get.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }));
    const first = getStartupData(path);
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin', first_name: 'Updated', agencies: [2] }));
    const second = getStartupData(path);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(path, expect.objectContaining({ timeout: 30000 }));
    finish({ data: {} });
    await Promise.all([first, second]);
  });

  it('does not reuse a failed request', async () => {
    api.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: {} });
    const requests = [getStartupData(path), getStartupData(path)];
    expect(api.get).toHaveBeenCalledTimes(1);
    expect((await Promise.allSettled(requests)).every(result => result.status === 'rejected')).toBe(true);
    await getStartupData(path);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('keeps agency, session, and demo-window requests separate while old reads are pending', async () => {
    const finishes = [];
    api.get.mockImplementation(() => new Promise(resolve => finishes.push(resolve)));
    localStorage.setItem('sessionId', 'first');
    const requests = [getStartupData(path, { params: { agencyId: 2 } }), getStartupData(path, { params: { agencyId: 3 } })];
    localStorage.setItem('sessionId', 'second');
    requests.push(getStartupData(path, { params: { agencyId: 2 } }));
    localStorage.setItem('currentAgency', JSON.stringify({ id: 5 }));
    requests.push(getStartupData(path, { params: { agencyId: 2 } }));
    sessionStorage.setItem('__pt_demo_window_token__', 'demo-fixture');
    requests.push(getStartupData(path, { params: { agencyId: 2 } }));
    expect(api.get).toHaveBeenCalledTimes(5);
    finishes.forEach(finish => finish({ data: {} }));
    await Promise.all(requests);
  });

  it('does not share cancellable requests or reads outside the startup allowlist', async () => {
    api.get.mockResolvedValue({ data: {} });
    const signal = new AbortController().signal;
    await Promise.all([
      getStartupData(path, { signal }), getStartupData(path, { signal }),
      getStartupData('/users/me'), getStartupData('/users/me')
    ]);
    expect(api.get).toHaveBeenCalledTimes(4);
  });
});
