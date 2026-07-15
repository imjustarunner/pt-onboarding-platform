/**
 * Run: node backend/src/services/studentSuccess.scoring.test.js
 */
import {
  calculateStudentSuccessScore,
  calculateWeightedStudentSuccessScore,
  calculateStudentOpportunityScore,
  studentSuccessStatusLabel,
  buildSummary
} from './studentSuccess.scoring.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calculateStudentSuccessScore([10, 10, 10]) === 100, 'avg 10s → 100');
assert(calculateStudentSuccessScore([5, 5]) === 50, 'avg 5s → 50');
assert(calculateStudentSuccessScore([]) === null, 'empty → null');
assert(calculateStudentSuccessScore([null, 8]) === 80, 'nulls excluded');

assert(
  calculateWeightedStudentSuccessScore([
    { score: 5, weight: 50 },
    { score: 10, weight: 50 }
  ]) === 75,
  'weighted mix'
);

assert(calculateStudentOpportunityScore(4, 9) === 63, 'opportunity score');
assert(studentSuccessStatusLabel(72) === 'Building Strong Skills', 'status label');

const template = {
  domains: [
    { key: 'attendance', label: 'Attendance', shortLabel: 'Attendance', weight: 8, successSystem: 'readiness', color: '#0EA5E9', ageGroups: ['high-school'], availableModes: ['full'] },
    { key: 'organization', label: 'Organization', shortLabel: 'Organization', weight: 12, successSystem: 'learning-habits', color: '#0284C7', ageGroups: ['high-school'], availableModes: ['full'] },
    { key: 'time_management', label: 'Time', shortLabel: 'Time', weight: 12, successSystem: 'learning-habits', color: '#22C55E', ageGroups: ['high-school'], availableModes: ['full'] },
    { key: 'assignment_completion', label: 'Assignments', shortLabel: 'Assignments', weight: 14, successSystem: 'learning-habits', color: '#84CC16', ageGroups: ['high-school'], availableModes: ['full'] },
    { key: 'study_skills', label: 'Study', shortLabel: 'Study', weight: 12, successSystem: 'learning-habits', color: '#8B5CF6', ageGroups: ['high-school'], availableModes: ['full'] },
    { key: 'academic_confidence', label: 'Confidence', shortLabel: 'Confidence', weight: 10, successSystem: 'learning-mindset', color: '#A855F7', ageGroups: ['high-school'], availableModes: ['full'] },
    { key: 'persistence', label: 'Persistence', shortLabel: 'Persistence', weight: 10, successSystem: 'learning-mindset', color: '#EC4899', ageGroups: ['high-school'], availableModes: ['full'] },
    { key: 'stress', label: 'Stress', shortLabel: 'Stress', weight: 8, successSystem: 'readiness', color: '#F59E0B', ageGroups: ['high-school'], availableModes: ['full'] },
    { key: 'teacher_support', label: 'Teacher Support', shortLabel: 'Teacher', weight: 7, successSystem: 'support-network', color: '#14B8A6', ageGroups: ['high-school'], availableModes: ['full'] },
    { key: 'goals_motivation', label: 'Goals', shortLabel: 'Goals', weight: 7, successSystem: 'learning-mindset', color: '#6366F1', ageGroups: ['high-school'], availableModes: ['full'] }
  ]
};

const responses = [
  { domainKey: 'attendance', score: 8 },
  { domainKey: 'organization', score: 4, importanceScore: 9 },
  { domainKey: 'time_management', score: 4 },
  { domainKey: 'assignment_completion', score: 4, reflectionChips: ['I avoid asking for help'] },
  { domainKey: 'study_skills', score: 8 },
  { domainKey: 'academic_confidence', score: 8 },
  { domainKey: 'persistence', score: 8 },
  { domainKey: 'stress', score: 4 },
  { domainKey: 'teacher_support', score: 8 },
  { domainKey: 'goals_motivation', score: 7 }
];

const summary = buildSummary(template, responses, { mode: 'full', educationLevel: 'high-school' });
assert(summary.studentSuccessScore != null, 'has score');
assert(summary.systemScores.learningHabits != null, 'habits system');
assert(summary.indicators.some((i) => i.key === 'confidence_completion'), 'confidence/completion');
assert(summary.indicators.some((i) => i.key === 'effort_organization'), 'effort/org');
assert(summary.indicators.some((i) => i.key === 'study_stress'), 'study/stress');
assert(summary.indicators.some((i) => i.key === 'support_help_seeking'), 'help seeking');
assert(summary.indicators.some((i) => i.key === 'time_completion_gap'), 'time/completion');

console.log('studentSuccess scoring tests passed');
console.log('sample score:', summary.studentSuccessScore, summary.studentSuccessStatus);
