/**
 * Men's Life scoring smoke checks (no DB).
 * Run: node backend/src/services/mensLife.scoring.test.js
 */
import {
  calculateMensLifeIndex,
  calculateImportanceWeightedMensLifeIndex,
  calculateLifeDevelopmentOpportunityScore,
  calculateRoleStrainScore,
  mensLifeIndexLabel,
  buildMensLifeSummary,
  buildDeterministicInsights
} from './mensLife.scoring.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calculateMensLifeIndex([8, 7, 6]) === 70, 'index avg*10');
assert(calculateMensLifeIndex([null, 10]) === 100, 'null excluded');
assert(calculateMensLifeIndex([]) === null, 'empty null');
assert(
  calculateImportanceWeightedMensLifeIndex([
    { currentStrengthScore: 4, personalImportanceScore: 10 },
    { currentStrengthScore: 8, personalImportanceScore: 5 }
  ]) === 53,
  'weighted index'
);
assert(calculateLifeDevelopmentOpportunityScore(4, 9, 5) === 7.45, 'opportunity');
assert(calculateRoleStrainScore(8, 9) === 5.7, 'role strain');
assert(mensLifeIndexLabel(72) === 'Strong Foundation With Clear Priorities', 'label');

const template = {
  settings: {},
  domains: [
    {
      key: 'purpose',
      label: 'Purpose',
      shortLabel: 'Purpose',
      color: '#1E3A5F',
      lifeSystem: 'meaning-and-direction',
      isActive: true,
      participantVersions: ['married-men'],
      availableModes: ['full']
    },
    {
      key: 'friendships',
      label: 'Friendships',
      shortLabel: 'Friendships',
      color: '#0F766E',
      lifeSystem: 'relationships-and-responsibility',
      isActive: true,
      participantVersions: ['married-men'],
      availableModes: ['full']
    },
    {
      key: 'leadership',
      label: 'Leadership',
      shortLabel: 'Leadership',
      color: '#1D4ED8',
      lifeSystem: 'strength-and-stewardship',
      isActive: true,
      participantVersions: ['married-men'],
      availableModes: ['full']
    },
    {
      key: 'emotional_health',
      label: 'Emotional Health',
      shortLabel: 'Emotional',
      color: '#0E7490',
      lifeSystem: 'inner-stability',
      isActive: true,
      participantVersions: ['married-men'],
      availableModes: ['full']
    },
    {
      key: 'marriage',
      label: 'Marriage',
      shortLabel: 'Marriage',
      color: '#8B5E3C',
      lifeSystem: 'relationships-and-responsibility',
      isActive: true,
      participantVersions: ['married-men'],
      availableModes: ['full']
    }
  ]
};

const summary = buildMensLifeSummary(template, [
  {
    domainKey: 'purpose',
    currentStrengthScore: 9,
    personalImportanceScore: 9,
    currentMomentumScore: 7
  },
  {
    domainKey: 'leadership',
    currentStrengthScore: 8,
    personalImportanceScore: 8,
    currentMomentumScore: 6
  },
  {
    domainKey: 'friendships',
    currentStrengthScore: 4,
    personalImportanceScore: 8,
    currentMomentumScore: 4
  },
  {
    domainKey: 'emotional_health',
    currentStrengthScore: 4,
    personalImportanceScore: 7,
    currentMomentumScore: 5
  },
  {
    domainKey: 'marriage',
    currentStrengthScore: 8,
    personalImportanceScore: 9,
    currentMomentumScore: 7
  }
]);

assert(summary.mensLifeIndex != null, 'summary index');
assert(summary.insights.some((t) => t.toLowerCase().includes('friendship')), 'leadership/friendship insight');
assert(!summary.insights.join(' ').toLowerCase().includes('real man'), 'no masculinity stereotypes');
assert(!summary.insights.join(' ').toLowerCase().includes('weak'), 'no weak language');

const insights = buildDeterministicInsights([
  {
    domainKey: 'purpose',
    label: 'Purpose',
    currentStrengthScore: 9,
    personalImportanceScore: 9,
    currentMomentumScore: 7
  },
  {
    domainKey: 'emotional_health',
    label: 'Emotional Health',
    currentStrengthScore: 4,
    personalImportanceScore: 8,
    currentMomentumScore: 4
  }
]);
assert(
  insights.some((t) => t.toLowerCase().includes('emotional')),
  'purpose + emotional health insight'
);

console.log('mensLife.scoring.test.js: all checks passed');
