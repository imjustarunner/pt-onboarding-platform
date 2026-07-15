export default {
  id: 'peaceful-pond',
  displayName: 'Peaceful Pond',
  version: '1.0.0',
  type: 'calming_game',
  status: 'current_pilot',
  platforms: ['mobile', 'web'],
  launchMode: 'embedded',
  featureFlag: 'activity.peacefulPond.enabled',
  estimatedDurationMinutes: { minimum: 4, maximum: 12 },
  oneLineDescription:
    'Name a worry, pause, and symbolically set it down for a moment.',
  supports: {
    sharedState: true,
    scoring: false,
    reducedMotion: true,
    providerFacilitationPanel: true,
    clientJournal: true,
    sharedNotes: true
  }
};
