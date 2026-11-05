import { beforeEach, expect, it, vi } from 'vitest';
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute } }));
import { dashboardIconManifest } from '../dashboardIconManifest.service.js';
beforeEach(() => execute.mockReset());

it('resolves only configured dashboard icons in one query, including custom overrides', async () => {
  execute.mockResolvedValue([[{ id: 2, file_path: 'icons/clients.svg' }, { id: 3, file_path: 'icons/custom.svg' }]]);
  const result = await dashboardIconManifest({
    my_dashboard_clients_icon_id: 2,
    theme_settings: JSON.stringify({ dashboardIconOverrides: { dashboard: { overview: 3, clients: 2 }, admin: { users: 900 } } }),
    unrelated_secret: 'never-public'
  }, { my_dashboard_my_schedule_icon_id: 1, my_dashboard_my_schedule_icon_path: 'icons/schedule.svg' });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(execute.mock.calls[0][1]).toEqual([2, 3]);
  expect(result.fields.my_dashboard_clients_icon_path).toBe('icons/clients.svg');
  expect(result.fields.my_dashboard_my_schedule_icon_path).toBe('icons/schedule.svg');
  expect(result.pathsById[3]).toBe('icons/custom.svg');
  expect(JSON.stringify(result)).not.toContain('never-public');
  expect(JSON.stringify(result)).not.toContain('900');
});

it('keeps a tenant assignment ahead of the platform and uses joined paths without another query', async () => {
  const result = await dashboardIconManifest({ my_dashboard_clients_icon_id: 2, my_dashboard_clients_icon_path: 'icons/tenant.svg' },
    { my_dashboard_clients_icon_id: 1, my_dashboard_clients_icon_path: 'icons/platform.svg' });
  expect(result.fields.my_dashboard_clients_icon_path).toBe('icons/tenant.svg');
  expect(result.pathsById[1]).toBeUndefined();
  expect(execute).not.toHaveBeenCalled();
});

it('reads the latest platform defaults once for a public theme and exposes only configured artwork', async () => {
  execute.mockResolvedValueOnce([[{ id: 4, internal_config: 'private', my_dashboard_clients_icon_id: 2 }]])
    .mockResolvedValueOnce([[{ id: 2, file_path: 'icons/clients.svg' }]]);
  const result = await dashboardIconManifest({});
  expect(execute).toHaveBeenCalledTimes(2);
  expect(execute.mock.calls[0][0]).toContain('ORDER BY id DESC LIMIT 1');
  expect(result.fields.my_dashboard_clients_icon_path).toBe('icons/clients.svg');
  expect(JSON.stringify(result)).not.toContain('private');
});
