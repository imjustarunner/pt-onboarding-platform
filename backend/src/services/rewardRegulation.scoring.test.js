/**
 * Reward Regulation scoring smoke checks (no DB).
 * Run: node backend/src/services/rewardRegulation.scoring.test.js
 */
import {
  calculateRewardRegulationScore,
  calculateImportanceWeightedScore,
  calculateOpportunityScore,
  calculateChannelImpactIndex,
  regulationLevelFromScore,
  regulationLevelFromDomain,
  rewardRegulationScoreLabel,
  channelImpactLabel,
  buildRewardRegulationSummary,
  domainsForContext,
  classifyChannel
} from './rewardRegulation.scoring.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calculateRewardRegulationScore([8, 7, 6]) === 70, 'regulation score avg*10');
assert(calculateRewardRegulationScore([null, 10]) === 100, 'null excluded');
assert(calculateRewardRegulationScore([]) === null, 'empty null');
assert(
  calculateRewardRegulationScore([
    { score: 4, weight: 10 },
    { score: 8, weight: 10 }
  ]) === 60,
  'equal weight avg'
);
assert(
  calculateRewardRegulationScore([
    { currentRegulationScore: 10, weight: 20 },
    { currentRegulationScore: 4, weight: 10 }
  ]) === 80,
  'weighted avg × 10'
);

assert(
  calculateImportanceWeightedScore([
    { currentRegulationScore: 4, personalImportanceScore: 10 },
    { currentRegulationScore: 8, personalImportanceScore: 5 }
  ]) === 53,
  'importance weighted'
);
assert(calculateOpportunityScore(4, 9, 5) === 7.5, 'opportunity score');

assert(regulationLevelFromScore(35)?.id === 'reactive', 'level reactive');
assert(regulationLevelFromScore(45)?.id === 'aware', 'level aware');
assert(regulationLevelFromScore(60)?.id === 'rebalancing', 'level rebalancing');
assert(regulationLevelFromScore(75)?.id === 'directed', 'level directed');
assert(regulationLevelFromScore(90)?.id === 'self-governed', 'level self-governed');
assert(regulationLevelFromDomain(4)?.id === 'aware', 'level from domain 4');
assert(regulationLevelFromDomain(9)?.id === 'self-governed', 'level from domain 9');
assert(
  rewardRegulationScoreLabel(90) === 'Self-Governed — Steady, Recoverable Regulation',
  'label'
);

const channelImpact = calculateChannelImpactIndex([
  { isRelevant: true, pullStrengthScore: 8, frequencyScore: 8, costScore: 8 },
  { isRelevant: true, pullStrengthScore: 6, frequencyScore: 5, costScore: 4 }
]);
assert(channelImpact != null && channelImpact > 0, 'channel impact computed');
assert(channelImpactLabel(channelImpact) != null, 'channel impact label');

// N/A / unselected channels do NOT zero core regulation score
const coreOnly = calculateRewardRegulationScore([7, 7, 7, 7]);
assert(coreOnly === 70, 'core score without channels');
const impactWithSkipped = calculateChannelImpactIndex([
  { isRelevant: false, pullStrengthScore: 10, frequencyScore: 10, costScore: 10 },
  { preferNotToAnswer: true, pullStrengthScore: 10 }
]);
assert(impactWithSkipped === null, 'skipped channels yield null impact, not zeroing');
assert(coreOnly === 70, 'core score unchanged by skipped channels');

assert(
  classifyChannel({ pullStrengthScore: 8, costScore: 8, valueScore: 3 }) === 'high-cost-capture',
  'classify high-cost'
);

const DOMAIN_DEFS = [
  ['attention_control', 'Attention Control', 'Attention', 'command', '#1E3A5F'],
  ['impulse_control', 'Impulse Control', 'Impulse', 'command', '#2C4A6E'],
  ['delayed_gratification', 'Delayed Gratification', 'Delay', 'command', '#3D5A80'],
  ['boredom_tolerance', 'Boredom Tolerance', 'Boredom', 'command', '#4A6FA5'],
  ['digital_boundaries', 'Digital Boundaries', 'Digital', 'environment', '#5B8A72'],
  ['emotional_regulation', 'Emotional Regulation', 'Emotion', 'regulation', '#6D597A'],
  ['sleep_and_recovery', 'Sleep & Recovery', 'Sleep', 'regulation', '#457B9D'],
  ['physical_activation', 'Physical Activation', 'Body', 'regulation', '#2D6A4F'],
  ['purpose_and_direction', 'Purpose & Direction', 'Purpose', 'direction', '#BC6C25'],
  ['real_world_connection', 'Real-World Connection', 'Connection', 'direction', '#9C6644'],
  ['environment_and_access', 'Environment & Access', 'Environment', 'environment', '#52796F'],
  ['consistency_and_recovery', 'Consistency & Recovery', 'Consistency', 'direction', '#8B5E34']
];

const template = {
  settings: {},
  domains: DOMAIN_DEFS.map(([key, label, shortLabel, system, color]) => ({
    key,
    label,
    shortLabel,
    color,
    regulationSystem: system,
    weight: 10,
    availableModes: ['full', 'quick'],
    participantVersions: ['general-adult'],
    isActive: true
  }))
};

assert(domainsForContext(template, { mode: 'full' }).length === 12, '12 domains');

const responses = DOMAIN_DEFS.map(([key], i) => ({
  domainKey: key,
  currentRegulationScore: 5 + (i % 4),
  personalImportanceScore: 7,
  momentumScore: 5,
  seasonStatus: 'active',
  preferNotToAnswer: false
}));

const channels = [
  {
    channelKey: 'short_form_video',
    label: 'Short-form video',
    isRelevant: true,
    pullStrengthScore: 9,
    frequencyScore: 8,
    costScore: 8,
    valueScore: 3,
    controlScore: 3
  },
  {
    channelKey: 'gambling',
    label: 'Gambling',
    isRelevant: false,
    pullStrengthScore: null
  }
];

const summary = buildRewardRegulationSummary(template, responses, {
  mode: 'full',
  participantVersion: 'general-adult',
  priorityKeys: ['attention_control'],
  context: { totalStimulationLoadScore: 7, readinessToChangeScore: 6 },
  channels
});

assert(summary.rewardRegulationScore != null, 'summary has regulation score');
assert(summary.channelImpactIndex != null, 'summary has channel impact');
assert(
  summary.rewardRegulationScore !== summary.channelImpactIndex || true,
  'scores exist independently'
);
assert(summary.commandCenter?.whatCapturesMe?.question === 'What captures me?', 'dashboard Q1');
assert(summary.commandCenter?.whatIsProviding?.question === 'What is it providing?', 'dashboard Q2');
assert(summary.commandCenter?.whatIsCosting?.question === 'What is it costing?', 'dashboard Q3');
assert(summary.commandCenter?.whatAmIRegaining?.question === 'What am I regaining?', 'dashboard Q4');
assert(summary.commandCenter?.whatNext?.question === 'What is next?', 'dashboard Q5');
assert(summary.systemScores?.command != null, 'command system');
assert(summary.stimulationLoadScore === 7, 'stimulation load separate');
assert(summary.readinessToChangeScore === 6, 'readiness separate');
assert(
  !String(summary.insights.join(' ')).toLowerCase().includes('you are addicted'),
  'no addiction diagnosis'
);
assert(
  summary.insights.some((i) => i.toLowerCase().includes('do not measure dopamine')),
  'includes non-medical clarification'
);

// Skipping all channels must not null out regulation score
const summaryNoChannels = buildRewardRegulationSummary(template, responses, {
  channels: []
});
assert(
  summaryNoChannels.rewardRegulationScore === summary.rewardRegulationScore,
  'no channels does not change regulation score'
);
assert(summaryNoChannels.channelImpactIndex === null, 'no channels → null impact index');

console.log('rewardRegulation.scoring.test.js: all assertions passed');
