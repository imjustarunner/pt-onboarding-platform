import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../chat.controller.js', () => ({ getOrCreateClubThread: vi.fn() }));
vi.mock('../../services/agencyAnnouncementAutomation.service.js', () => ({ getTodayCelebrationBannerItems: vi.fn(), getAnnouncementAutomationQueue: vi.fn() }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import { listAgencyToastAnnouncements, listAgencyBannerAnnouncements, createAgencyScheduledAnnouncement, updateAgencyScheduledAnnouncement } from '../agencyAnnouncements.controller.js';

const request = () => ({ params: { id: '7' }, user: { id: 10, role: 'support' } });
const response = () => { const r = { json: vi.fn(), status: vi.fn() }; r.status.mockReturnValue(r); return r; };
beforeEach(() => { vi.clearAllMocks(); User.getAgencies.mockResolvedValue([{ id: 7 }]); });
it('rejects cross-agency reads before looking up toasts', async () => {
  User.getAgencies.mockResolvedValue([{ id: 99 }]);
  const res = response(); await listAgencyToastAnnouncements(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403); expect(pool.execute).not.toHaveBeenCalled();
});
it('keeps staff/role/user targeting and separates toasts from banners/splashes', async () => {
  const rows = [{ id: 1, display_type: 'toast', audience: 'everyone' }, { id: 2, display_type: 'toast', audience: 'providers' }, { id: 3, display_type: 'toast', audience: 'specific_users', recipient_user_ids: '[20]' }, { id: 4, display_type: 'toast', audience: 'specific_users', recipient_user_ids: '[10]' }];
  pool.execute.mockResolvedValue([rows]); const res = response();
  await listAgencyToastAnnouncements(request(), res, vi.fn());
  expect(res.json.mock.calls[0][0].map((r) => r.id)).toEqual([1, 4]);
  expect(res.json.mock.calls[0][0][0].display_type).toBe('toast');
  expect(pool.execute.mock.calls[0][0]).toContain("AND display_type = 'toast'");
  await listAgencyBannerAnnouncements(request(), response(), vi.fn());
  expect(pool.execute.mock.calls[1][0]).toContain("AND display_type <> 'toast'");
});
it('preserves toast delivery on create and update', async () => {
  pool.execute.mockResolvedValue([{ insertId: 5, affectedRows: 1 }]);
  const req = { ...request(), body: { message: 'Our offices are closed today.', display_type: 'toast', starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 86400000).toISOString(), splash_image_url: null } };
  const res = response(), next = vi.fn();
  await createAgencyScheduledAnnouncement(req, res, next);
  expect(next).not.toHaveBeenCalled(); expect(res.json.mock.calls[0][0].announcement.display_type).toBe('toast');
  await updateAgencyScheduledAnnouncement({ ...req, params: { ...req.params, announcementId: '5' } }, res, next);
  expect(next).not.toHaveBeenCalled(); expect(res.json.mock.calls[1][0].announcement.display_type).toBe('toast');
});
