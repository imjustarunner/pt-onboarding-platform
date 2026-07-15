import assert from 'assert';
import {
  calculateTeenWellBeingIndex,
  calculateTeenSupportOpportunityScore,
  teenWellBeingIndexLabel,
  domainStatusLabel,
  buildTeenWellBeingSummary,
  domainsForContext
} from '../src/services/teenWellBeing.scoring.js';

assert.strictEqual(calculateTeenWellBeingIndex([5, 7]), 60);
assert.strictEqual(calculateTeenWellBeingIndex([null, 8, 6]), 70);
assert.strictEqual(calculateTeenSupportOpportunityScore(4, 8, 8), 7.5);
assert.strictEqual(teenWellBeingIndexLabel(68), 'Mixed but Supported');
assert.strictEqual(domainStatusLabel(4), 'Current Challenge');
assert.strictEqual(domainStatusLabel(9), 'Current Strength');

const template = {
  settings: {},
  domains: [
    {
      key: 'confidence',
      label: 'Confidence',
      shortLabel: 'Confidence',
      color: '#0ea5e9',
      wellbeingSystem: 'inner-well-being',
      weight: 10,
      ageVersions: ['ages-15-to-18'],
      availableModes: ['full']
    },
    {
      key: 'school',
      label: 'School',
      shortLabel: 'School',
      color: '#6366f1',
      wellbeingSystem: 'daily-functioning',
      weight: 10,
      ageVersions: ['ages-15-to-18'],
      availableModes: ['full']
    },
    {
      key: 'sleep',
      label: 'Sleep',
      shortLabel: 'Sleep',
      color: '#8b5cf6',
      wellbeingSystem: 'regulation-and-recovery',
      weight: 10,
      ageVersions: ['ages-15-to-18'],
      availableModes: ['full']
    },
    {
      key: 'stress',
      label: 'Stress',
      shortLabel: 'Stress',
      color: '#ef4444',
      wellbeingSystem: 'regulation-and-recovery',
      weight: 10,
      ageVersions: ['ages-15-to-18'],
      availableModes: ['full']
    },
    {
      key: 'purpose',
      label: 'Purpose',
      shortLabel: 'Purpose',
      color: '#f97316',
      wellbeingSystem: 'inner-well-being',
      weight: 10,
      ageVersions: ['ages-15-to-18'],
      availableModes: ['full']
    }
  ]
};

const filtered = domainsForContext(template, {
  mode: 'full',
  ageVersion: 'ages-12-to-14'
});
assert.strictEqual(filtered.length, 0);

const summary = buildTeenWellBeingSummary(
  template,
  [
    { domainKey: 'confidence', currentExperienceScore: 4 },
    { domainKey: 'school', currentExperienceScore: 4 },
    { domainKey: 'sleep', currentExperienceScore: 4 },
    { domainKey: 'stress', currentExperienceScore: 4 },
    { domainKey: 'purpose', currentExperienceScore: 8, preferNotToAnswer: false }
  ],
  { mode: 'full', ageVersion: 'ages-15-to-18' }
);

assert.ok(summary.teenWellBeingIndex != null);
assert.ok(summary.insights.some((t) => /confidence|school|sleep|stress/i.test(t)));
// Support need must not affect index
const indexOnly = calculateTeenWellBeingIndex([4, 4, 4, 4, 8]);
assert.strictEqual(summary.teenWellBeingIndex, indexOnly);

console.log('teenWellBeing.scoring tests passed');
