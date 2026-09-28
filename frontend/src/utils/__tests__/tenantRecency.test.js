import { beforeEach, describe, expect, it } from 'vitest';
import { readTenantVisits, recordTenantVisit, sortTenantsByRecency } from '../tenantRecency';

beforeEach(() => localStorage.clear());
describe('tenant recency', () => {
  it('keeps per-user visit timestamps and moves repeat visits to the front', () => {
    recordTenantVisit(1, 10, 100);
    recordTenantVisit(1, 20, 200);
    expect(sortTenantsByRecency([{ id: 10 }, { id: 20 }, { id: 30 }], readTenantVisits(1)).map(t => t.id)).toEqual([20, 10, 30]);
    recordTenantVisit(1, 10, 300);
    expect(sortTenantsByRecency([{ id: 20 }, { id: 10 }], readTenantVisits(1))[0].id).toBe(10);
    expect(readTenantVisits(2)).toEqual({});
  });
  it('handles invalid storage and leaves unvisited tenants in their original order', () => {
    localStorage.setItem('pt.tenantLastVisited:1', 'null');
    expect(readTenantVisits(1)).toEqual({});
    expect(sortTenantsByRecency([{ id: 2 }, { id: 1 }], { 1: 'bad' })).toEqual([{ id: 2 }, { id: 1 }]);
  });
});
