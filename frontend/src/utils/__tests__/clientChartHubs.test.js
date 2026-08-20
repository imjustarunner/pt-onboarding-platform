import { describe, it, expect } from 'vitest';
import {
  resolveChartTab,
  recordsSubnav,
  panelVisible,
  chartNavTarget,
  RECORDS_SECONDARY_SUBS
} from '../clientChartHubs.js';

describe('clientChartHubs Record Center', () => {
  it('defaults Records to overview landing', () => {
    expect(resolveChartTab('records')).toEqual({ hub: 'records', sub: 'overview' });
    expect(chartNavTarget('records', '')).toEqual({ activeTab: 'records', hubSub: 'overview' });
  });

  it('exposes seven primary Records sections', () => {
    const items = recordsSubnav({ canViewBilling: true });
    expect(items.map((i) => i.id)).toEqual([
      'overview',
      'clinical-notes',
      'treatment-plans',
      'documents',
      'billing',
      'authorizations',
      'audit'
    ]);
  });

  it('maps clinical legacy tabs into Clinical Notes', () => {
    expect(resolveChartTab('intake-note').sub).toBe('clinical-notes');
    expect(resolveChartTab('medical-record').sub).toBe('clinical-notes');
    expect(panelVisible('intake-note', 'records', 'clinical-notes')).toBe(true);
    expect(panelVisible('medical-record', 'records', 'clinical-notes')).toBe(true);
    expect(panelVisible('phi', 'records', 'clinical-notes')).toBe(false);
  });

  it('keeps surveys as secondary Records surface', () => {
    expect(RECORDS_SECONDARY_SUBS).toContain('surveys');
    expect(resolveChartTab('surveys')).toEqual({ hub: 'records', sub: 'surveys' });
    expect(panelVisible('surveys', 'records', 'surveys')).toBe(true);
  });

  it('does not show Account profile under Overview hub', () => {
    expect(panelVisible('account', 'overview', '')).toBe(false);
    expect(panelVisible('account', 'account', 'profile')).toBe(true);
  });
});
