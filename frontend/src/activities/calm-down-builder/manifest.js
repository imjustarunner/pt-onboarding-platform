export default {
  id: 'calm-down-builder',
  displayName: 'Calm Down Builder',
  version: '1.0.0',
  type: 'sequence_builder',
  status: 'current_pilot',
  platforms: ['mobile', 'web'],
  launchMode: 'embedded',
  featureFlag: 'activity.calmDownBuilder.enabled',
  estimatedDurationMinutes: { minimum: 8, maximum: 20 },
  oneLineDescription: 'Build and practice a personalized sequence of calming tools.',
  supports: {
    sharedState: true,
    scoring: false,
    reducedMotion: true,
    providerFacilitationPanel: true,
    clientJournal: true,
    sharedNotes: true
  }
};
