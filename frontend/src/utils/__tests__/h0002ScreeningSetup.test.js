import { describe, it, expect } from 'vitest';
import { defaultDurationMinutesForServiceCode } from '../noteAidSessionQueue.js';
import { findNoteAidByToolOrCode } from '../../config/noteAidWorkspace.js';

describe('H0002 screening documentation', () => {
  it('opens the general screening aid for new H0002 work', () => {
    expect(findNoteAidByToolOrCode({ serviceCode: 'H0002' }).aid.toolId).toBe('clinical_screening_review');
  });
  it('preserves the PSC-specific writer for existing PSC drafts', () => {
    expect(findNoteAidByToolOrCode({ toolId: 'clinical_psc_17', serviceCode: 'H0002' }).aid.toolId).toBe('clinical_psc_17');
  });
  it('does not invent a therapy duration', () => {
    expect(defaultDurationMinutesForServiceCode('H0002')).toBeNull();
    expect(defaultDurationMinutesForServiceCode('90834')).toBe(45);
  });
});
