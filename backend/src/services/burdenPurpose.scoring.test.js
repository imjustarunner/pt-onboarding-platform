/**
 * Burden & Purpose scoring smoke checks (no DB).
 * Run: node backend/src/services/burdenPurpose.scoring.test.js
 */
import {
  calculateBurdenReadinessIndex,
  calculateImportanceWeightedReadiness,
  calculateGrowthOpportunityScore,
  isOverextensionSignal,
  isAvoidanceSignal,
  burdenReadinessLabel,
  determineDevelopmentalOrientation,
  buildBurdenPurposeSummary,
  matrixQuadrant
} from './burdenPurpose.scoring.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calculateBurdenReadinessIndex([8, 7, 6]) === 70, 'readiness avg*10');
assert(calculateBurdenReadinessIndex([null, 10]) === 100, 'null excluded');
assert(calculateBurdenReadinessIndex([]) === null, 'empty null');
assert(
  calculateImportanceWeightedReadiness([
    { currentPracticeScore: 4, personalImportanceScore: 10 },
    { currentPracticeScore: 8, personalImportanceScore: 5 }
  ]) === 53,
  'weighted readiness'
);
assert(calculateGrowthOpportunityScore(4, 9, 8) === 7.05, 'growth opportunity');
assert(calculateGrowthOpportunityScore(4, 9, 8, { avoidance: true }) === 8.55, 'avoidance adjustment');
assert(isOverextensionSignal(8, 9, 3) === true, 'overextension true');
assert(isOverextensionSignal(8, 9, 7) === false, 'overextension false');
assert(burdenReadinessLabel(72) === 'Strong Practice With Clear Priorities', 'label');
assert(matrixQuadrant(9, 8) === 'meaningful-sustainable', 'matrix sustainable');
assert(matrixQuadrant(9, 3) === 'overextended-meaning', 'matrix overextended');

// Avoidance never inferred from low practice alone
assert(
  isAvoidanceSignal({
    currentPracticeScore: 3,
    personalImportanceScore: 9,
    sustainableCapacityScore: 8,
    reflectionChips: ['Work or craft'],
    barriers: []
  }) === false,
  'low practice alone is not avoidance'
);

assert(
  isAvoidanceSignal({
    currentPracticeScore: 3,
    personalImportanceScore: 9,
    sustainableCapacityScore: 8,
    reflectionChips: ['I avoid challenge even though it matters'],
    barriers: []
  }) === true,
  'avoidance requires marker + gates'
);

assert(
  isAvoidanceSignal({
    currentPracticeScore: 3,
    personalImportanceScore: 5,
    sustainableCapacityScore: 8,
    reflectionChips: ['I avoid challenge even though it matters']
  }) === false,
  'avoidance blocked when importance gate fails'
);

// High readiness can still be Builder (no steward/legacy evidence pattern)
const highBuilderScored = [
  {
    domainKey: 'purpose',
    currentPracticeScore: 9,
    personalImportanceScore: 9,
    sustainableCapacityScore: 8,
    reflectionChips: []
  },
  {
    domainKey: 'discipline',
    currentPracticeScore: 9,
    personalImportanceScore: 8,
    sustainableCapacityScore: 8,
    reflectionChips: []
  },
  {
    domainKey: 'resilience',
    currentPracticeScore: 8,
    personalImportanceScore: 8,
    sustainableCapacityScore: 7,
    reflectionChips: []
  },
  {
    domainKey: 'physical_readiness',
    currentPracticeScore: 8,
    personalImportanceScore: 7,
    sustainableCapacityScore: 7,
    reflectionChips: []
  },
  {
    domainKey: 'mental_fortitude',
    currentPracticeScore: 8,
    personalImportanceScore: 8,
    sustainableCapacityScore: 7,
    reflectionChips: []
  },
  {
    domainKey: 'character',
    currentPracticeScore: 7,
    personalImportanceScore: 8,
    sustainableCapacityScore: 7,
    reflectionChips: []
  },
  {
    domainKey: 'responsibility',
    currentPracticeScore: 6,
    personalImportanceScore: 7,
    sustainableCapacityScore: 7,
    reflectionChips: []
  },
  {
    domainKey: 'relationships',
    currentPracticeScore: 5,
    personalImportanceScore: 7,
    sustainableCapacityScore: 6,
    reflectionChips: []
  },
  {
    domainKey: 'service',
    currentPracticeScore: 5,
    personalImportanceScore: 6,
    sustainableCapacityScore: 6,
    reflectionChips: []
  },
  {
    domainKey: 'voluntary_challenge',
    currentPracticeScore: 7,
    personalImportanceScore: 7,
    sustainableCapacityScore: 7,
    reflectionChips: []
  },
  {
    domainKey: 'adventure',
    currentPracticeScore: 6,
    personalImportanceScore: 6,
    sustainableCapacityScore: 7,
    reflectionChips: []
  },
  {
    domainKey: 'legacy',
    currentPracticeScore: 6,
    personalImportanceScore: 7,
    sustainableCapacityScore: 7,
    reflectionChips: []
  }
];

const highOrientation = determineDevelopmentalOrientation(highBuilderScored);
assert(highOrientation.id === 'builder', 'high score can still be Builder');
assert(highOrientation.selfReported === true, 'orientation self-reported');
assert(highOrientation.notARankOfWorth === true, 'not a rank of worth');

const template = {
  settings: {},
  domains: highBuilderScored.map((x) => ({
    key: x.domainKey,
    label: x.domainKey.replace(/_/g, ' '),
    shortLabel: x.domainKey.slice(0, 8),
    color: '#1B4332',
    burdenSystem:
      ['purpose', 'character', 'legacy'].includes(x.domainKey)
        ? 'direction-and-identity'
        : ['discipline', 'resilience', 'physical_readiness', 'mental_fortitude'].includes(
              x.domainKey
            )
          ? 'capacity-and-readiness'
          : ['responsibility', 'relationships', 'service'].includes(x.domainKey)
            ? 'responsibility-and-contribution'
            : 'growth-and-exploration',
    isActive: true,
    participantVersions: ['general-adult'],
    availableModes: ['full']
  }))
};

const summary = buildBurdenPurposeSummary(template, highBuilderScored);
assert(summary.burdenReadinessIndex != null && summary.burdenReadinessIndex >= 70, 'high readiness');
assert(summary.orientation.id === 'builder', 'summary orientation builder');
assert(summary.dashboard?.whatIsDrivingMe?.question, 'dashboard driving');
assert(summary.dashboard?.whatAmICarryingWell?.question, 'dashboard carrying');
assert(summary.dashboard?.whereAmIAvoidingGrowth?.question, 'dashboard avoiding');
assert(summary.dashboard?.whatShouldIDoNext?.question, 'dashboard next');
assert(!summary.insights.join(' ').toLowerCase().includes('tough it out'), 'no toughness glorification');
assert(summary.safetyNote.toLowerCase().includes('abuse-as-loyalty'), 'safety mentions abuse-as-loyalty ban');

// Importance/capacity do not change standard readiness
const readinessOnlyPractice = calculateBurdenReadinessIndex([8, 8, 8]);
assert(readinessOnlyPractice === 80, 'practice-only readiness');

console.log('burdenPurpose.scoring.test.js: all checks passed');
