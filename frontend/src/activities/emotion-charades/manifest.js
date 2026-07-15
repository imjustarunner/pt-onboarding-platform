export default {
  id: 'emotion-charades',
  displayName: 'Emotion Charades',
  version: '1.0.0',
  type: 'expressive_game',
  status: 'current_pilot',
  platforms: ['mobile', 'web'],
  launchMode: 'embedded',
  featureFlag: 'activity.emotionCharades.enabled',
  estimatedDurationMinutes: { minimum: 8, maximum: 20 },
  oneLineDescription: 'Practice recognizing and expressing emotional cues.',
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
