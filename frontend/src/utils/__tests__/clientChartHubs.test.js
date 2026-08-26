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
      isClinical: true
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

  it('hides medical record only for learning-primary (not clinical) clients', () => {
    const learningOnly = recordsSubnav({
      canViewClinical: true,
      canViewMedicalRecord: true,
      isLearning: true,
      isClinical: false
    });
    expect(learningOnly.map((i) => i.id)).toContain('clinical-summary');
    expect(learningOnly.map((i) => i.id)).toContain('notes');
    expect(learningOnly.map((i) => i.id)).not.toContain('medical-record');
    expect(learningOnly.find((i) => i.id === 'clinical-summary')?.label).toBe('Student summary');

    const clinicalInLearning = recordsSubnav({
      canViewClinical: true,
      canViewMedicalRecord: true,
      isLearning: true,
      isClinical: true
    });
    expect(clinicalInLearning.map((i) => i.id)).toContain('medical-record');
    expect(clinicalInLearning.find((i) => i.id === 'clinical-summary')?.label).toBe('Clinical summary');
  });

  it('maps clinical tabs to separate Records subs', () => {
    expect(resolveChartTab('clinical').sub).toBe('clinical-summary');
    expect(resolveChartTab('clinical-notes').sub).toBe('notes');
    expect(resolveChartTab('intake-note').sub).toBe('intake-note');
    expect(resolveChartTab('medical-record').sub).toBe('medical-record');
    expect(panelVisible('clinical', 'records', 'clinical-summary')).toBe(true);
    expect(panelVisible('clinical-notes', 'records', 'notes')).toBe(true);
    expect(panelVisible('intake-note', 'records', 'notes')).toBe(false);
    expect(panelVisible('medical-record', 'records', 'notes')).toBe(false);
    expect(panelVisible('medical-record', 'records', 'medical-record')).toBe(true);
    expect(panelVisible('phi', 'records', 'notes')).toBe(false);
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
