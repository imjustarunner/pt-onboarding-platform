/**
 * Run: node backend/src/services/relationshipHealth.scoring.test.js
 */
import {
  calculateIndividualRelationshipIndex,
  calculatePartnerDifference,
  differenceStatusLabel,
  buildComparison,
  buildIndividualSummary
} from './relationshipHealth.scoring.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calculateIndividualRelationshipIndex([10, 10]) === 100, 'index 100');
assert(calculatePartnerDifference(8, 4) === 4, 'diff');
assert(differenceStatusLabel(4) === 'Meaningful Perception Gap', 'status');

const template = {
  domains: [
    { key: 'communication', label: 'Communication', shortLabel: 'Comm', color: '#0EA5E9', availableModes: ['full'], conversationPrompts: [] },
    { key: 'trust', label: 'Trust', shortLabel: 'Trust', color: '#0284C7', availableModes: ['full'], conversationPrompts: [] },
    { key: 'intimacy', label: 'Intimacy', shortLabel: 'Intimacy', color: '#EC4899', availableModes: ['full'], conversationPrompts: [] },
    { key: 'friendship', label: 'Friendship', shortLabel: 'Friendship', color: '#22C55E', availableModes: ['full'], conversationPrompts: [] },
    { key: 'conflict', label: 'Conflict', shortLabel: 'Conflict', color: '#F59E0B', availableModes: ['full'], conversationPrompts: [] },
    { key: 'parenting', label: 'Parenting', shortLabel: 'Parenting', color: '#8B5CF6', availableModes: ['full'], conversationPrompts: [], allowsNotApplicable: true },
    { key: 'finances', label: 'Finances', shortLabel: 'Finances', color: '#14B8A6', availableModes: ['full'], conversationPrompts: [] },
    { key: 'teamwork', label: 'Teamwork', shortLabel: 'Teamwork', color: '#6366F1', availableModes: ['full'], conversationPrompts: [] },
    { key: 'appreciation', label: 'Appreciation', shortLabel: 'Appreciation', color: '#A855F7', availableModes: ['full'], conversationPrompts: [] },
    { key: 'shared_vision', label: 'Shared Vision', shortLabel: 'Vision', color: '#0F766E', availableModes: ['full'], conversationPrompts: [] }
  ]
};

const a = [
  { domainKey: 'communication', currentExperienceScore: 8 },
  { domainKey: 'trust', currentExperienceScore: 4 },
  { domainKey: 'intimacy', currentExperienceScore: 5 },
  { domainKey: 'friendship', currentExperienceScore: 9 },
  { domainKey: 'conflict', currentExperienceScore: 4 },
  { domainKey: 'parenting', isNotApplicable: true },
  { domainKey: 'finances', currentExperienceScore: 4 },
  { domainKey: 'teamwork', currentExperienceScore: 8 },
  { domainKey: 'appreciation', currentExperienceScore: 8 },
  { domainKey: 'shared_vision', currentExperienceScore: 8 }
];
const b = [
  { domainKey: 'communication', currentExperienceScore: 8 },
  { domainKey: 'trust', currentExperienceScore: 4 },
  { domainKey: 'intimacy', currentExperienceScore: 4 },
  { domainKey: 'friendship', currentExperienceScore: 8 },
  { domainKey: 'conflict', currentExperienceScore: 4 },
  { domainKey: 'parenting', isNotApplicable: true },
  { domainKey: 'finances', currentExperienceScore: 8 },
  { domainKey: 'teamwork', currentExperienceScore: 7 },
  { domainKey: 'appreciation', currentExperienceScore: 4 },
  { domainKey: 'shared_vision', currentExperienceScore: 8 }
];

const ind = buildIndividualSummary(template, a, 'full');
assert(ind.individualRelationshipIndex != null, 'individual index');

const cmp = buildComparison(template, a, b, 'full');
assert(cmp.sharedStrengths.some((s) => s.domainKey === 'communication'), 'shared strength');
assert(cmp.sharedConcerns.some((s) => s.domainKey === 'trust'), 'shared concern');
assert(cmp.perceptionGaps.some((s) => s.domainKey === 'finances'), 'finances gap');
assert(cmp.perceptionGaps.some((s) => s.domainKey === 'appreciation'), 'appreciation gap');
assert(!cmp.comparisons.some((c) => c.domainKey === 'parenting'), 'NA parenting excluded');
assert(cmp.insights.some((i) => i.key === 'comm_strength'), 'comm insight');
assert(cmp.insights.some((i) => i.key === 'appreciation_gap'), 'appreciation insight');

console.log('relationshipHealth scoring tests passed');
console.log('couple index:', cmp.coupleRelationshipIndex, cmp.coupleStatus);
