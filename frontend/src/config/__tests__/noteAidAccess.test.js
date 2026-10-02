import { describe, expect, it } from 'vitest';
import {
  isMentalHealthPractice,
  noteAidWorkspaceLabel
} from '../noteAidAccess.js';

describe('note workspace labels', () => {
  it('uses Practice Notes for provider roles in mental-health practices', () => {
    expect(noteAidWorkspaceLabel({
      role: 'provider',
      tenant: { business_type: 'mental_health' }
    })).toBe('Practice Notes');
    expect(noteAidWorkspaceLabel({
      role: 'supervisor',
      tenant: { organization_type: 'clinical' }
    })).toBe('Practice Notes');
  });

  it('uses Notes Workspace for shared non-clinical work', () => {
    expect(noteAidWorkspaceLabel({
      role: 'provider',
      tenant: { business_type: 'tutoring' }
    })).toBe('Notes Workspace');
    expect(noteAidWorkspaceLabel({
      role: 'provider',
      tenant: { organization_type: 'life_coach' }
    })).toBe('Notes Workspace');
    expect(noteAidWorkspaceLabel({
      role: 'provider',
      tenant: { organization_type: 'consultant' }
    })).toBe('Notes Workspace');
  });

  it('keeps administrative users on the shared name outside AuricWell', () => {
    expect(noteAidWorkspaceLabel({
      role: 'super_admin',
      tenant: { business_type: 'mental_health' }
    })).toBe('Notes Workspace');
  });

  it('always names the dedicated AuricWell surface Practice Notes', () => {
    expect(noteAidWorkspaceLabel({ role: 'super_admin', auricwell: true })).toBe('Practice Notes');
  });

  it('recognizes clinical feature flags when business types are not present', () => {
    expect(isMentalHealthPractice({ feature_flags: { clinicalNoteSigningEnabled: true } })).toBe(true);
    expect(isMentalHealthPractice({ business_type: 'consulting' })).toBe(false);
  });
});
