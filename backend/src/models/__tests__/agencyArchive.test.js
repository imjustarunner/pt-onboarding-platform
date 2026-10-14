import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import Agency from '../Agency.model.js';
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockImplementation(async sql=>sql.includes('information_schema')?[[{COLUMN_NAME:'is_archived'}]]:[{affectedRows:1}]);});
it('archives as inactive and retains historical records',async()=>{
  expect(await Agency.archive(394,501)).toBe(true);
  const writes=pool.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE'));
  expect(writes).toHaveLength(1);expect(writes[0][0]).toContain('is_archived = TRUE, is_active = FALSE');expect(writes[0][1]).toEqual([501,394]);
  expect(pool.execute.mock.calls.some(([sql])=>/DELETE|TRUNCATE/.test(sql))).toBe(false);
});
it('restores active agency access only through the explicit restore operation',async()=>{
  expect(await Agency.restore(394)).toBe(true);
  expect(pool.execute.mock.calls.at(-1)[0]).toContain('is_archived = FALSE, is_active = TRUE');
});
it('excludes archived organizations from public slug lookups including inactive school portals',async()=>{
  pool.execute.mockImplementation(async sql=>sql.includes('information_schema')?[[]]:[[]]);
  expect(await Agency.findBySlug('closed-practice')).toBeNull();
  const lookup=pool.execute.mock.calls.find(([sql])=>sql.includes('WHERE slug = ?'));
  expect(lookup[0]).toContain('COALESCE(is_archived, 0) = 0');expect(lookup[0]).toContain("IN ('school', 'program', 'learning')");
});
