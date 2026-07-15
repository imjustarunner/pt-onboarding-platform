export default {
  id: 'feelings-adventure',
  displayName: 'Feelings Adventure',
  version: '1.0.0',
  type: 'cooperative_board_game',
  status: 'current_pilot',
  platforms: ['mobile', 'web'],
  launchMode: 'embedded',
  featureFlag: 'activity.feelingsAdventure.enabled',
  estimatedDurationMinutes: { minimum: 10, maximum: 25 },
  oneLineDescription: 'Explore emotions and choices through situation cards.',
  supports: {
    sharedState: true,
    turnTaking: true,
    scoring: false,
    reducedMotion: true,
    providerFacilitationPanel: true,
    clientJournal: true,
    sharedNotes: true
  }
};
