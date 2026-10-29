import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { getOutreachSchool } from '../outreachHub.service.js';

describe('school history across outreach trips', () => {
  it('returns earlier conversations plus unrecorded stop notes and clearly labelled trip-wide notes', async () => {
    pool.execute.mockImplementation(async sql => {
      if (sql.includes('SUM(a.contact_type')) return [[{ id: 20, agency_id: 2, name: 'School', notes: 'Original school context' }]];
      if (sql.includes('FROM outreach_activities a')) return [[{ id: 1, trip_id: 3, trip_title: 'October visits', contact_type: 'visit', notes: 'Spoke to principal', activity_at: '2026-10-20' }]];
      if (sql.includes('FROM outreach_school_notes n')) return [[{ id: 2, body: 'Call next month', note_kind: 'follow_up', trip_id: 3, trip_title: 'October visits', created_at: '2026-10-20' }]];
      if (sql.includes('FROM outreach_trip_stops ts')) return [[{ stop_id: 10, trip_id: 3, trip_title: 'October visits', attendance_notes: 'Spoke to principal', trip_notes: 'Bring updated flyers', planned_date: '2026-10-20' }, { stop_id: 11, trip_id: 4, trip_title: 'New trip', attendance_notes: 'Front office closed', planned_date: '2026-10-29' }]];
      return [[]];
    });
    const school = await getOutreachSchool(2,20);
    expect(school.general_notes).toBe('Original school context');
    expect(school.feed.filter(item => item.body === 'Spoke to principal')).toHaveLength(1);
    expect(school.feed).toEqual(expect.arrayContaining([
      expect.objectContaining({ body:'Call next month', trip_title:'October visits' }),
      expect.objectContaining({ title:'Trip-wide note', body:'Bring updated flyers' }),
      expect.objectContaining({ title:'Visit note', body:'Front office closed' })
    ]));
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('t.agency_id = ?'), [2,20]);
  });
});
