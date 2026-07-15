/**
 * Marriage Alignment scoring smoke checks (no DB).
 * Run: node backend/src/services/marriageAlignment.scoring.test.js
 */
import {
  calculateIndividualMarriageAlignmentIndex,
  calculateMarriageAlignmentIndex,
  calculateCoupleCurrentAlignmentAverage,
  calculateCurrentPerceptionGap,
  calculateSharedDesiredEmphasis,
  calculateDesiredEmphasisGap,
  calculateSharedDirectionIndex,
  calculateMarriageAlignmentOpportunityScore,
  marriageAlignmentIndexLabel,
  buildIndividualSummary,
  buildComparison
} from './marriageAlignment.scoring.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calculateIndividualMarriageAlignmentIndex([8, 7, 6]) === 70, 'individual index');
assert(calculateIndividualMarriageAlignmentIndex([null, 10]) === 100, 'null excluded');
assert(calculateIndividualMarriageAlignmentIndex([]) === null, 'empty null');
assert(calculateCoupleCurrentAlignmentAverage(7, 6) === 6.5, 'couple avg');
assert(calculateCurrentPerceptionGap(8, 5) === 3, 'perception gap');
assert(calculateSharedDesiredEmphasis(9, 9) === 9, 'shared desired');
assert(calculateDesiredEmphasisGap(5, 9) === 4, 'desired gap');
assert(calculateSharedDirectionIndex([1, 1, 0]) === 93, 'direction index');
assert(calculateMarriageAlignmentOpportunityScore(5, 9, 2, 1) === 5.35, 'opportunity');
assert(marriageAlignmentIndexLabel(72) === 'Generally Aligned', 'status label');
assert(calculateMarriageAlignmentIndex([7, 6.5, 8]) === 72, 'shared index');

const template = {
  settings: {},
  domains: [
    {
      key: 'goals',
      label: 'Goals',
      shortLabel: 'Goals',
      color: '#8B5E3C',
      alignmentSystem: 'shared-direction',
      isActive: true,
      availableVersions: ['general'],
      availableModes: ['full'],
      conversationPrompts: []
    },
    {
      key: 'parenting',
      label: 'Parenting',
      shortLabel: 'Parenting',
      color: '#A16207',
      alignmentSystem: 'home-and-responsibility',
      isActive: true,
      availableVersions: ['general'],
      availableModes: ['full'],
      allowsNotRelevant: true,
      conversationPrompts: []
    },
    {
      key: 'household',
      label: 'Household',
      shortLabel: 'Household',
      color: '#B45309',
      alignmentSystem: 'home-and-responsibility',
      isActive: true,
      availableVersions: ['general'],
      availableModes: ['full'],
      conversationPrompts: []
    },
    {
      key: 'time_together',
      label: 'Time Together',
      shortLabel: 'Time',
      color: '#C2410C',
      alignmentSystem: 'connection-and-partnership',
      isActive: true,
      availableVersions: ['general'],
      availableModes: ['full'],
      conversationPrompts: []
    },
    {
      key: 'adventure',
      label: 'Adventure',
      shortLabel: 'Adventure',
      color: '#0F766E',
      alignmentSystem: 'vitality-and-experience',
      isActive: true,
      availableVersions: ['general'],
      availableModes: ['full'],
      conversationPrompts: []
    },
    {
      key: 'growth',
      label: 'Growth',
      shortLabel: 'Growth',
      color: '#1D4ED8',
      alignmentSystem: 'shared-direction',
      isActive: true,
      availableVersions: ['general'],
      availableModes: ['full'],
      conversationPrompts: []
    }
  ]
};

const a = [
  { domainKey: 'goals', currentAlignmentScore: 9, desiredEmphasisScore: 9 },
  { domainKey: 'parenting', isNotRelevant: true },
  { domainKey: 'household', currentAlignmentScore: 4, desiredEmphasisScore: 9 },
  { domainKey: 'time_together', currentAlignmentScore: 6, desiredEmphasisScore: 9 },
  { domainKey: 'adventure', currentAlignmentScore: 7, desiredEmphasisScore: 5 },
  { domainKey: 'growth', currentAlignmentScore: 8, desiredEmphasisScore: 8 }
];
const b = [
  { domainKey: 'goals', currentAlignmentScore: 8, desiredEmphasisScore: 9 },
  { domainKey: 'parenting', isNotRelevant: true },
  { domainKey: 'household', currentAlignmentScore: 5, desiredEmphasisScore: 9 },
  { domainKey: 'time_together', currentAlignmentScore: 5, desiredEmphasisScore: 9 },
  { domainKey: 'adventure', currentAlignmentScore: 7, desiredEmphasisScore: 9 },
  { domainKey: 'growth', currentAlignmentScore: 9, desiredEmphasisScore: 9 }
];

const ind = buildIndividualSummary(template, a, 'full', 'general');
assert(ind.individualMarriageAlignmentIndex != null, 'individual summary index');
assert(ind.possiblePriorities.some((p) => p.domainKey === 'household'), 'household priority idea');

const cmp = buildComparison(template, a, b, { mode: 'full', participantVersion: 'general' });
assert(!cmp.comparisons.some((c) => c.domainKey === 'parenting'), 'NA parenting excluded');
assert(cmp.sharedStrengths.some((s) => s.domainKey === 'goals'), 'goals shared strength');
assert(cmp.sharedGrowthPriorities.some((s) => s.domainKey === 'household'), 'household growth');
assert(cmp.differentFuturePriorities.some((s) => s.domainKey === 'adventure'), 'adventure priority gap');
assert(cmp.marriageAlignmentIndex != null, 'marriage alignment index');
assert(cmp.sharedDirectionIndex != null, 'shared direction index');
assert(cmp.insights.length > 0, 'deterministic insights');

console.log('marriageAlignment scoring tests passed');
console.log('indexes:', cmp.marriageAlignmentIndex, cmp.sharedDirectionIndex, cmp.marriageAlignmentStatus);
