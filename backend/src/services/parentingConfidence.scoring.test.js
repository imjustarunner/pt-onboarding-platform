/**
 * Parenting Confidence scoring smoke checks (no DB).
 * Run: node backend/src/services/parentingConfidence.scoring.test.js
 */
import {
  calculateParentingConfidenceIndex,
  calculateImportanceWeightedParentingIndex,
  calculateParentingOpportunityScore,
  calculateParentingStrainScore,
  parentingConfidenceIndexLabel,
  buildParentingConfidenceSummary,
  buildDeterministicInsights,
  matrixQuadrant
} from './parentingConfidence.scoring.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calculateParentingConfidenceIndex([8, 7, 6]) === 70, 'index avg*10');
assert(calculateParentingConfidenceIndex([null, 10]) === 100, 'null excluded');
assert(calculateParentingConfidenceIndex([]) === null, 'empty null');
assert(
  calculateImportanceWeightedParentingIndex([
    { currentCapacityScore: 4, personalImportanceScore: 10 },
    { currentCapacityScore: 8, personalImportanceScore: 5 }
  ]) === 53,
  'weighted index'
);
assert(calculateParentingOpportunityScore(4, 9, 8) === 7.75, 'opportunity');
assert(calculateParentingStrainScore(8, 9) === 5.7, 'strain');
assert(parentingConfidenceIndexLabel(72) === 'Strong Foundation With Clear Priorities', 'label');
assert(matrixQuadrant(8, 9) === 'core-strengths', 'quadrant strength');
assert(matrixQuadrant(4, 9) === 'high-value-support', 'quadrant support');

const template = {
  settings: {},
  domains: [
    {
      key: 'consistency',
      label: 'Consistency',
      shortLabel: 'Consistency',
      color: '#B45309',
      parentingSystem: 'guidance-and-structure',
      isActive: true,
      participantVersions: ['general-caregiver'],
      availableModes: ['full']
    },
    {
      key: 'patience',
      label: 'Patience',
      shortLabel: 'Patience',
      color: '#0F766E',
      parentingSystem: 'connection-and-emotional-support',
      isActive: true,
      participantVersions: ['general-caregiver'],
      availableModes: ['full']
    },
    {
      key: 'self_care',
      label: 'Self-Care',
      shortLabel: 'Self-Care',
      color: '#65A30D',
      parentingSystem: 'caregiver-capacity',
      isActive: true,
      participantVersions: ['general-caregiver'],
      availableModes: ['full']
    },
    {
      key: 'support',
      label: 'Support',
      shortLabel: 'Support',
      color: '#4D7C0F',
      parentingSystem: 'caregiver-capacity',
      isActive: true,
      participantVersions: ['general-caregiver'],
      availableModes: ['full']
    },
    {
      key: 'confidence',
      label: 'Confidence',
      shortLabel: 'Confidence',
      color: '#C2410C',
      parentingSystem: 'caregiver-capacity',
      isActive: true,
      participantVersions: ['general-caregiver'],
      availableModes: ['full']
    },
    {
      key: 'family_balance',
      label: 'Family Balance',
      shortLabel: 'Balance',
      color: '#78716C',
      parentingSystem: 'family-integration',
      isActive: true,
      participantVersions: ['general-caregiver'],
      availableModes: ['full']
    }
  ]
};

const summary = buildParentingConfidenceSummary(template, [
  {
    domainKey: 'consistency',
    currentCapacityScore: 9,
    personalImportanceScore: 9,
    supportNeedScore: 3
  },
  {
    domainKey: 'patience',
    currentCapacityScore: 4,
    personalImportanceScore: 9,
    supportNeedScore: 8
  },
  {
    domainKey: 'self_care',
    currentCapacityScore: 3,
    personalImportanceScore: 8,
    supportNeedScore: 9
  },
  {
    domainKey: 'support',
    currentCapacityScore: 4,
    personalImportanceScore: 8,
    supportNeedScore: 8
  },
  {
    domainKey: 'confidence',
    currentCapacityScore: 8,
    personalImportanceScore: 8,
    supportNeedScore: 3
  },
  {
    domainKey: 'family_balance',
    currentCapacityScore: 4,
    personalImportanceScore: 9,
    supportNeedScore: 7
  }
]);

assert(summary.parentingConfidenceIndex != null, 'summary index');
assert(summary.strengths.some((x) => x.domainKey === 'consistency'), 'strengths');
assert(summary.highValueSupportAreas.length >= 1, 'high-value support areas');
assert(
  summary.insights.some((t) => t.toLowerCase().includes('recovery') || t.toLowerCase().includes('support')),
  'consistency/patience or support insight'
);
assert(!summary.insights.join(' ').toLowerCase().includes('unfit'), 'no fitness language');
assert(!summary.insights.join(' ').toLowerCase().includes('abuse'), 'no abuse conclusions in insights');
assert(!summary.insights.join(' ').toLowerCase().includes('punish'), 'no punishment language');

const insights = buildDeterministicInsights([
  {
    domainKey: 'self_care',
    label: 'Self-Care',
    currentCapacityScore: 3,
    personalImportanceScore: 8,
    supportNeedScore: 9
  },
  {
    domainKey: 'support',
    label: 'Support',
    currentCapacityScore: 3,
    personalImportanceScore: 8,
    supportNeedScore: 8
  }
]);
assert(
  insights.some((t) => t.toLowerCase().includes('support') || t.toLowerCase().includes('recovery')),
  'self-care + support insight'
);

console.log('parentingConfidence.scoring.test.js: all checks passed');
