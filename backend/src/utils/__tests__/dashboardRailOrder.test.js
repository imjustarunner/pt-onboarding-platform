import { describe, it, expect } from 'vitest';
import { sanitizeDashboardRailOrder } from '../dashboardRailOrder.js';

describe('dashboard rail preferences', () => {
  it('preserves dynamic portal ids while removing duplicates and invalid entries', () => {
    expect(sanitizeDashboardRailOrder(['my', 'portal_org_42', 'tools_nest', 'my', {}, 1, '', '<script>']))
      .toEqual(['my', 'portal_org_42', 'tools_nest']);
  });
  it('bounds the saved list', () => {
    expect(sanitizeDashboardRailOrder(Array.from({ length: 250 }, (_, i) => `portal_org_${i}`))).toHaveLength(200);
  });
});
