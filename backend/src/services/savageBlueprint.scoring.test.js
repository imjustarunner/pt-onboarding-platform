/**
 * Savage Blueprint scoring smoke checks (no DB).
 * Run: node backend/src/services/savageBlueprint.scoring.test.js
 */
import {
  calculateSavageScore,
  calculatePriorityWeightedScore,
  calculateOpportunityScore,
  isCostlyStrength,
  domainTierFromScore,
  domainTierFromPerformance,
  savageScoreLabel,
  buildSavageBlueprintSummary,
  domainsForContext
} from './savageBlueprint.scoring.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calculateSavageScore([8, 7, 6]) === 70, 'savage score avg*10');
assert(calculateSavageScore([null, 10]) === 100, 'null excluded');
assert(calculateSavageScore([]) === null, 'empty null');
assert(
  calculatePriorityWeightedScore([
    { currentPerformanceScore: 4, personalPriorityScore: 10 },
    { currentPerformanceScore: 8, personalPriorityScore: 5 }
  ]) === 53,
  'priority weighted'
);
assert(calculateOpportunityScore(4, 9, 5) === 7.5, 'opportunity score');
assert(isCostlyStrength(7, 8) === true, 'costly strength true');
assert(isCostlyStrength(7, 7) === false, 'costly strength false at effort 7');
assert(isCostlyStrength(6, 9) === false, 'costly strength false at performance 6');
assert(domainTierFromScore(35)?.id === 'foundation', 'tier foundation');
assert(domainTierFromScore(50)?.id === 'reliable', 'tier reliable');
assert(domainTierFromScore(70)?.id === 'resilient', 'tier resilient');
assert(domainTierFromScore(80)?.id === 'elite', 'tier elite');
assert(domainTierFromScore(95)?.id === 'savage', 'tier savage');
assert(domainTierFromPerformance(8)?.id === 'elite', 'tier from performance 8');
assert(domainTierFromPerformance(10)?.id === 'savage', 'tier from performance 10');
assert(domainTierFromPerformance(9)?.id === 'savage', 'tier from performance 9');
assert(savageScoreLabel(92) === 'Savage Blueprint — Integrated Intentional Execution', 'label');

const template = {
  settings: {},
  domains: [
    {
      key: 'physical_capability',
      label: 'Physical Capability',
      shortLabel: 'Physical',
      color: '#1B4332',
      savageSystem: 'body-and-performance',
      weight: 10,
      availableModes: ['full'],
      participantVersions: ['general-adult'],
      isActive: true
    },
    {
      key: 'mental_toughness',
      label: 'Mental Toughness',
      shortLabel: 'Mental',
      color: '#2D6A4F',
      savageSystem: 'body-and-performance',
      weight: 10,
      availableModes: ['full'],
      participantVersions: ['general-adult'],
      isActive: true
    },
    {
      key: 'discipline',
      label: 'Discipline',
      shortLabel: 'Discipline',
      color: '#6D597A',
      savageSystem: 'body-and-performance',
      weight: 10,
      availableModes: ['full'],
      participantVersions: ['general-adult'],
      isActive: true
    },
    {
      key: 'purpose_mission',
      label: 'Purpose & Mission',
      shortLabel: 'Purpose',
      color: '#40916C',
      savageSystem: 'mission-and-leadership',
      weight: 10,
      availableModes: ['full'],
      participantVersions: ['general-adult'],
      isActive: true
    },
    {
      key: 'leadership',
      label: 'Leadership',
      shortLabel: 'Leadership',
      color: '#52796F',
      savageSystem: 'mission-and-leadership',
      weight: 10,
      availableModes: ['full'],
      participantVersions: ['general-adult'],
      isActive: true
    },
    {
      key: 'financial_strength',
      label: 'Financial Strength',
      shortLabel: 'Financial',
      color: '#74C69D',
      savageSystem: 'mission-and-leadership',
      weight: 10,
      availableModes: ['full'],
      participantVersions: ['general-adult'],
      isActive: true
    },
    {
      key: 'relationships',
      label: 'Relationships',
      shortLabel: 'Relationships',
      color: '#1D3557',
      savageSystem: 'connection-and-emotional-mastery',
      weight: 10,
      availableModes: ['full'],
      participantVersions: ['general-adult'],
      isActive: true
    },
    {
      key: 'fatherhood',
      label: 'Fatherhood',
      shortLabel: 'Fatherhood',
      color: '#457B9D',
      savageSystem: 'connection-and-emotional-mastery',
      weight: 10,
      availableModes: ['full'],
      participantVersions: ['general-adult'],
      allowsNotApplicable: true,
      isActive: true
    },
    {
      key: 'emotional_intelligence',
      label: 'Emotional Intelligence',
      shortLabel: 'Emotional',
      color: '#B08968',
      savageSystem: 'connection-and-emotional-mastery',
      weight: 10,
      availableModes: ['full'],
      participantVersions: ['general-adult'],
      isActive: true
    },
    {
      key: 'brotherhood',
      label: 'Brotherhood',
      shortLabel: 'Brotherhood',
      color: '#9C6644',
      savageSystem: 'connection-and-emotional-mastery',
      weight: 10,
      availableModes: ['full'],
      participantVersions: ['general-adult'],
      isActive: true
    },
    {
      key: 'adventure_challenge',
      label: 'Adventure & Challenge',
      shortLabel: 'Adventure',
      color: '#BC6C25',
      savageSystem: 'challenge-and-legacy',
      weight: 10,
      availableModes: ['full'],
      participantVersions: ['general-adult'],
      isActive: true
    },
    {
      key: 'legacy',
      label: 'Legacy',
      shortLabel: 'Legacy',
      color: '#8B5E34',
      savageSystem: 'challenge-and-legacy',
      weight: 10,
      availableModes: ['full'],
      participantVersions: ['general-adult'],
      isActive: true
    }
  ]
};

const baseResponses = [
  { domainKey: 'physical_capability', currentPerformanceScore: 8, personalPriorityScore: 7, effortCostScore: 4 },
  { domainKey: 'mental_toughness', currentPerformanceScore: 7, personalPriorityScore: 8, effortCostScore: 5 },
  { domainKey: 'discipline', currentPerformanceScore: 8, personalPriorityScore: 8, effortCostScore: 9 },
  { domainKey: 'purpose_mission', currentPerformanceScore: 9, personalPriorityScore: 9, effortCostScore: 5 },
  { domainKey: 'leadership', currentPerformanceScore: 7, personalPriorityScore: 7, effortCostScore: 6 },
  { domainKey: 'financial_strength', currentPerformanceScore: 6, personalPriorityScore: 7, effortCostScore: 5 },
  { domainKey: 'relationships', currentPerformanceScore: 5, personalPriorityScore: 9, effortCostScore: 4 },
  { domainKey: 'emotional_intelligence', currentPerformanceScore: 6, personalPriorityScore: 8, effortCostScore: 5 },
  { domainKey: 'brotherhood', currentPerformanceScore: 5, personalPriorityScore: 8, effortCostScore: 4 },
  { domainKey: 'adventure_challenge', currentPerformanceScore: 7, personalPriorityScore: 6, effortCostScore: 5 },
  { domainKey: 'legacy', currentPerformanceScore: 6, personalPriorityScore: 7, effortCostScore: 4 }
];

// Fatherhood N/A does not reduce score
const withFatherhoodHigh = [
  ...baseResponses,
  { domainKey: 'fatherhood', currentPerformanceScore: 3, personalPriorityScore: 5, effortCostScore: 3 }
];
const withoutFatherhood = [...baseResponses];

const summaryWithLowFatherhood = buildSavageBlueprintSummary(template, withFatherhoodHigh, {
  fatherhoodApplicable: true
});
const summaryNa = buildSavageBlueprintSummary(template, withoutFatherhood, {
  fatherhoodApplicable: false,
  context: { fatherhoodApplicable: false }
});

assert(summaryNa.fatherhoodExcluded === true, 'fatherhood excluded flag');
assert(
  domainsForContext(template, { fatherhoodApplicable: false }).every((d) => d.key !== 'fatherhood'),
  'fatherhood removed from context domains'
);
assert(
  summaryNa.savageScore > summaryWithLowFatherhood.savageScore,
  'Fatherhood N/A does not reduce score vs low fatherhood included'
);
assert(summaryNa.incomplete === false, 'no incomplete warning when fatherhood N/A and others scored');
assert(
  summaryNa.domains.every((d) => d.domainKey !== 'fatherhood'),
  'fatherhood absent from scored domains when N/A'
);

// Costly strength detection in summary
assert(
  summaryNa.costlyStrengths.some((x) => x.domainKey === 'discipline'),
  'discipline marked costly strength'
);

// Tier mapping on domains
const savageDomain = summaryNa.domains.find((d) => d.domainKey === 'purpose_mission');
assert(savageDomain?.tier === 'savage', 'purpose_mission tier savage (90)');
assert(savageDomain?.score100 === 90, 'score100 = performance*10');
const eliteDomain = summaryNa.domains.find((d) => d.domainKey === 'physical_capability');
assert(eliteDomain?.tier === 'elite', 'physical_capability tier elite (80)');

const foundationLike = buildSavageBlueprintSummary(
  template,
  [{ domainKey: 'physical_capability', currentPerformanceScore: 3, personalPriorityScore: 8 }],
  { fatherhoodApplicable: false, context: { fatherhoodApplicable: false } }
);
assert(foundationLike.domains[0]?.tier === 'foundation', 'tier foundation at 30');
assert(foundationLike.savageScore === 30, 'single domain savage score');

console.log('savageBlueprint.scoring.test.js: all assertions passed');
