import assert from 'assert';
import {
  calculatePersonalFulfillmentIndex,
  calculateWeightedFulfillmentIndex,
  calculateFulfillmentOpportunityScore,
  personalFulfillmentIndexLabel,
  domainStatusLabel,
  matrixQuadrant,
  buildPersonalFulfillmentSummary
} from '../src/services/personalFulfillment.scoring.js';

assert.strictEqual(calculatePersonalFulfillmentIndex([5, 7]), 60);
assert.strictEqual(
  calculateWeightedFulfillmentIndex([
    { fulfillmentScore: 4, importanceScore: 10 },
    { fulfillmentScore: 8, importanceScore: 2 }
  ]),
  Math.round(((4 * 10 + 8 * 2) / 12) * 10)
);
assert.ok(calculateFulfillmentOpportunityScore(4, 9) > 0);
assert.strictEqual(personalFulfillmentIndexLabel(72), 'Generally Fulfilling');
assert.strictEqual(domainStatusLabel(8), 'Strong Fulfillment Source');
assert.strictEqual(matrixQuadrant(8, 9), 'nourishing-anchors');
assert.strictEqual(matrixQuadrant(4, 9), 'high-value-growth');
assert.strictEqual(matrixQuadrant(8, 4), 'pleasant-extras');
assert.strictEqual(matrixQuadrant(4, 3), 'lower-priority');

const summary = buildPersonalFulfillmentSummary(
  {
    settings: {},
    domains: [
      {
        key: 'purpose',
        label: 'Purpose',
        shortLabel: 'Purpose',
        color: '#0f766e',
        fulfillmentSystem: 'meaning-and-direction',
        weight: 10,
        participantVersions: ['general-adult'],
        availableModes: ['full']
      },
      {
        key: 'energy',
        label: 'Energy',
        shortLabel: 'Energy',
        color: '#dc2626',
        fulfillmentSystem: 'capability-and-progress',
        weight: 10,
        participantVersions: ['general-adult'],
        availableModes: ['full']
      },
      {
        key: 'joy',
        label: 'Joy',
        shortLabel: 'Joy',
        color: '#ea580c',
        fulfillmentSystem: 'positive-experience',
        weight: 10,
        participantVersions: ['general-adult'],
        availableModes: ['full']
      }
    ]
  },
  [
    { domainKey: 'purpose', currentFulfillmentScore: 9, personalImportanceScore: 9 },
    { domainKey: 'energy', currentFulfillmentScore: 4, personalImportanceScore: 9 },
    { domainKey: 'joy', currentFulfillmentScore: 4, personalImportanceScore: 3 }
  ],
  { mode: 'full', participantVersion: 'general-adult' }
);

assert.ok(summary.personalFulfillmentIndex != null);
assert.strictEqual(summary.highImportanceOpportunities[0].domainKey, 'energy');
assert.ok(summary.insights.some((t) => /purpose|energy|recovery/i.test(t)));
// Momentum must not change standard index
assert.strictEqual(
  calculatePersonalFulfillmentIndex([9, 4, 4]),
  summary.personalFulfillmentIndex
);

console.log('personalFulfillment.scoring tests passed');
