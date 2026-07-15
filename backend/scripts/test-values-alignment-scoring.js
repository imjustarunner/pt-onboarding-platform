import assert from 'assert';
import {
  calculateSignedAlignmentGap,
  calculateAbsoluteAlignmentGap,
  calculateValueAlignmentScore,
  calculateValuesAlignmentIndex,
  calculateCurrentLifeIndex,
  calculateAlignmentOpportunityScore,
  calculateRebalancingOpportunityScore,
  signedGapStatusLabel,
  valuesAlignmentIndexLabel,
  buildLifeAlignmentSummary
} from '../src/services/valuesAlignment.scoring.js';

assert.strictEqual(calculateSignedAlignmentGap(5, 8), 3);
assert.strictEqual(calculateSignedAlignmentGap(9, 6), -3);
assert.strictEqual(calculateSignedAlignmentGap(7, 7), 0);
assert.strictEqual(calculateAbsoluteAlignmentGap(5, 8), 3);
assert.strictEqual(calculateAbsoluteAlignmentGap(9, 6), 3);
assert.strictEqual(calculateValueAlignmentScore(7, 7), 100);
assert.strictEqual(calculateValueAlignmentScore(5, 8), 70);
assert.strictEqual(calculateValueAlignmentScore(9, 6), 70);
assert.strictEqual(calculateValuesAlignmentIndex([100, 70, null]), 85);
assert.strictEqual(calculateCurrentLifeIndex([5, 7]), 60);
assert.ok(calculateAlignmentOpportunityScore(5, 8, 8) > 0);
assert.strictEqual(calculateRebalancingOpportunityScore(9, 6), 3);
assert.strictEqual(signedGapStatusLabel(0), 'Closely Aligned');
assert.strictEqual(signedGapStatusLabel(3), 'Meaningful Growth Opportunity');
assert.strictEqual(signedGapStatusLabel(-3), 'Meaningful Overextension');
assert.strictEqual(valuesAlignmentIndexLabel(76), 'Generally Aligned');

const summary = buildLifeAlignmentSummary(
  {
    values: [
      { key: 'health', label: 'Health', color: '#f00' },
      { key: 'service', label: 'Service', color: '#0f0' }
    ]
  },
  [
    { valueKey: 'health', currentLifeScore: 5, idealLifeScore: 9 },
    { valueKey: 'service', currentLifeScore: 8, idealLifeScore: 6 }
  ],
  ['health']
);

assert.strictEqual(summary.valuesAlignmentIndex, 70);
assert.strictEqual(summary.needingMoreAttention[0].valueKey, 'health');
assert.strictEqual(summary.rebalancingOpportunities[0].valueKey, 'service');
assert.ok(summary.insights.some((t) => /Health/i.test(t) || /health/i.test(t) || /Service/i.test(t)));

// Confidence must not change alignment score
assert.strictEqual(calculateValueAlignmentScore(5, 8), 70);

console.log('valuesAlignment.scoring tests passed');
