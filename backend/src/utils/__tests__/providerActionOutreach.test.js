import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateSeconds,
  formatEstimateLabel,
  formatActiveDuration,
  pdfFilenameForProvider,
  SECONDS_PER_CLIENT
} from '../providerActionOutreach.js';

describe('providerActionOutreach', () => {
  it('estimates 15 seconds per client', () => {
    assert.equal(SECONDS_PER_CLIENT, 15);
    assert.equal(estimateSeconds(16), 240);
    assert.equal(formatEstimateLabel(240), '~ 4 min');
  });

  it('names the pdf after the provider', () => {
    assert.equal(
      pdfFilenameForProvider({ firstName: 'Jane', lastName: 'Doe' }),
      'Doe_Jane_client-action.pdf'
    );
  });

  it('formats active time', () => {
    assert.equal(formatActiveDuration(12), '12s');
    assert.equal(formatActiveDuration(75), '1m 15s');
  });
});
