import { beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../config/database.js';
import UserPreferences from '../UserPreferences.model.js';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());

describe('dashboard order persistence', () => {
  it('updates only the supplied account preference and serializes the order', async () => {
    db.execute.mockResolvedValueOnce([[{ user_id: 7, theme_preference: 'light' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ user_id: 7, dashboard_rail_order_json: ['my', 'overview'] }]]);
    await UserPreferences.update(7, { dashboard_rail_order_json: ['my', 'overview'] });
    const [sql, params] = db.execute.mock.calls[1];
    expect(sql).toContain('dashboard_rail_order_json = ?');
    expect(sql).not.toContain('theme_preference =');
    expect(params).toEqual(['["my","overview"]', 7]);
  });
  it('creates the preference for a person without an existing preferences row', async () => {
    db.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 1 }]).mockResolvedValueOnce([[{ user_id: 8 }]]);
    await UserPreferences.update(8, { dashboard_rail_order_json: [] });
    expect(db.execute.mock.calls[1][0]).toContain('INSERT INTO user_preferences (user_id, dashboard_rail_order_json)');
    expect(db.execute.mock.calls[1][1]).toEqual([8, '[]']);
  });
});
