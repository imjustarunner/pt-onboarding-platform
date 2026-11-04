import { describe, expect, it } from 'vitest';
import { normalizeUpdateSelection } from '../clientUpdateSelection.js';

describe('client update selection', () => {
  it('keeps a la carte documents, assessments, and portal steps', () => {
    expect(normalizeUpdateSelection({
      documents: [4, 4, '8'],
      assessments: ['values_alignment', 'values-alignment'],
      portalSteps: ['information', 'payment', 'information']
    })).toEqual({
      documents: [4, 8],
      assessments: ['values_alignment', 'values-alignment'],
      portalSteps: ['information', 'payment']
    });
  });

  it('rejects a full enrollment packet and an empty selection', () => {
    expect(() => normalizeUpdateSelection({ fullPacket: true, documents: [1] })).toThrow(/full enrollment/i);
    expect(() => normalizeUpdateSelection({})).toThrow(/at least one/i);
  });
});
