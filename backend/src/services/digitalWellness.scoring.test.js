/**
 * Quick Digital Wellness scoring smoke checks (no DB).
 * Run: node backend/src/services/digitalWellness.scoring.test.js
 */
import {
  calculateDigitalWellnessIndex,
  calculateDigitalFrictionScore,
  calculateDigitalWellnessOpportunityScore,
  digitalWellnessIndexLabel,
  buildDigitalWellnessSummary,
  buildDeterministicInsights
} from './digitalWellness.scoring.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calculateDigitalWellnessIndex([8, 7, 6]) === 70, 'index avg*10');
assert(calculateDigitalWellnessIndex([null, 10]) === 100, 'null excluded');
assert(calculateDigitalWellnessIndex([]) === null, 'empty null');
assert(calculateDigitalFrictionScore(4, 5) === 6.6, 'friction formula');
assert(
  calculateDigitalWellnessOpportunityScore(4, 5, 9) === 7.35,
  'opportunity formula'
);
assert(digitalWellnessIndexLabel(71) === 'Generally Intentional', 'label');

const template = {
  settings: {},
  domains: [
    {
      key: 'screen_time',
      label: 'Screen Time',
      shortLabel: 'Screen Time',
      color: '#0EA5E9',
      digitalWellnessSystem: 'digital-consumption',
      isActive: true,
      participantVersions: ['general-adult'],
      availableModes: ['full']
    },
    {
      key: 'sleep',
      label: 'Sleep',
      shortLabel: 'Sleep',
      color: '#6366F1',
      digitalWellnessSystem: 'recovery-and-body',
      isActive: true,
      participantVersions: ['general-adult'],
      availableModes: ['full']
    },
    {
      key: 'focus',
      label: 'Focus',
      shortLabel: 'Focus',
      color: '#F97316',
      digitalWellnessSystem: 'performance-and-attention',
      isActive: true,
      participantVersions: ['general-adult'],
      availableModes: ['full']
    },
    {
      key: 'gaming',
      label: 'Gaming',
      shortLabel: 'Gaming',
      color: '#8B5CF6',
      digitalWellnessSystem: 'digital-consumption',
      isActive: true,
      participantVersions: ['general-adult'],
      availableModes: ['full']
    },
    {
      key: 'balance',
      label: 'Balance',
      shortLabel: 'Balance',
      color: '#64748B',
      digitalWellnessSystem: 'integration',
      isActive: true,
      participantVersions: ['general-adult'],
      availableModes: ['full']
    }
  ]
};

const summary = buildDigitalWellnessSummary(
  template,
  [
    {
      domainKey: 'screen_time',
      currentWellnessScore: 8,
      intentionalControlScore: 8,
      personalImportanceScore: 5
    },
    {
      domainKey: 'sleep',
      currentWellnessScore: 4,
      intentionalControlScore: 5,
      personalImportanceScore: 9,
      reflectionChips: ['Gaming']
    },
    {
      domainKey: 'focus',
      currentWellnessScore: 4,
      intentionalControlScore: 4
    },
    {
      domainKey: 'gaming',
      currentWellnessScore: 4,
      intentionalControlScore: 4,
      reflectionChips: ['I lose sleep']
    },
    {
      domainKey: 'balance',
      currentWellnessScore: 7,
      intentionalControlScore: 7
    }
  ],
  {
    usageSummary: { recreationalScreenHours: 5 }
  }
);

assert(summary.digitalWellnessIndex != null, 'summary index');
assert(
  summary.insights.some((t) => t.toLowerCase().includes('sleep')),
  'gaming/sleep insight'
);
assert(
  !summary.insights.join(' ').toLowerCase().includes('addict'),
  'no addiction language'
);

const highDurationInsights = buildDeterministicInsights(
  [
    {
      domainKey: 'screen_time',
      currentWellnessScore: 9,
      intentionalControlScore: 8,
      reflectionChips: []
    },
    {
      domainKey: 'balance',
      currentWellnessScore: 8,
      intentionalControlScore: 8,
      reflectionChips: []
    }
  ],
  { usageSummary: { recreationalScreenHours: 5 }, index: 85 }
);
assert(
  highDurationInsights.some((t) => t.includes('intentional')),
  'high duration + high wellness insight'
);

console.log('digitalWellness.scoring.test.js: all checks passed');
