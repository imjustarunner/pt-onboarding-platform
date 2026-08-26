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

  it('exposes clinical summary, notes, and medical record for clinical clients', () => {
    const items = recordsSubnav({
      canViewClinical: true,
      canViewMedicalRecord: true,
      canViewBilling: true,
      showClinicalSurfaces: true,
      showLearningSurfaces: false
    });
    expect(items.map((i) => i.id)).toEqual([
      'overview',
      'clinical-summary',
      'notes',
      'medical-record',
      'treatment-plans',
      'documents',
      'billing',
      'authorizations',
      'audit'
    ]);
  });

  it('shows student summary + learning plans for learning-only surfaces', () => {
    const items = recordsSubnav({
      canViewClinical: true,
      canViewMedicalRecord: true,
      showLearningSurfaces: true,
      showClinicalSurfaces: false
    });
    expect(items.map((i) => i.id)).toContain('student-summary');
    expect(items.map((i) => i.id)).toContain('learning-plans');
    expect(items.map((i) => i.id)).not.toContain('medical-record');
    expect(items.map((i) => i.id)).not.toContain('clinical-summary');
  });

  it('shows both clinical and learning surfaces for dual enrollment in learning tenant', () => {
    const items = recordsSubnav({
      canViewClinical: true,
      canViewMedicalRecord: true,
      showClinicalSurfaces: true,
      showLearningSurfaces: true
    });
    expect(items.map((i) => i.id)).toEqual([
      'overview',
      'clinical-summary',
      'student-summary',
      'notes',
      'medical-record',
      'treatment-plans',
      'learning-plans',
      'documents',
      'authorizations',
      'audit'
    ]);
  });

  it('maps clinical tabs to separate Records subs', () => {
    expect(resolveChartTab('clinical').sub).toBe('clinical-summary');
    expect(resolveChartTab('student-summary').sub).toBe('student-summary');
    expect(resolveChartTab('clinical-notes').sub).toBe('notes');
    expect(resolveChartTab('learning-plans').sub).toBe('learning-plans');
    expect(resolveChartTab('intake-note').sub).toBe('intake-note');
    expect(resolveChartTab('medical-record').sub).toBe('medical-record');
    expect(panelVisible('clinical', 'records', 'clinical-summary')).toBe(true);
    expect(panelVisible('student-summary', 'records', 'student-summary')).toBe(true);
    expect(panelVisible('clinical-notes', 'records', 'notes')).toBe(true);
    expect(panelVisible('learning-plans', 'records', 'learning-plans')).toBe(true);
    expect(panelVisible('intake-note', 'records', 'notes')).toBe(false);
    expect(panelVisible('medical-record', 'records', 'notes')).toBe(false);
    expect(panelVisible('medical-record', 'records', 'medical-record')).toBe(true);
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
