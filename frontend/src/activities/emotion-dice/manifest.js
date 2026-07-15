export default {
  id: 'emotion-dice',
  displayName: 'Emotion Dice',
  version: '1.0.0',
  type: 'discussion_game',
  status: 'live_current',
  platforms: ['mobile', 'web'],
  launchMode: 'embedded',
  featureFlag: 'activity.emotionDice.enabled',
  estimatedDurationMinutes: { minimum: 5, maximum: 15 },
  oneLineDescription: 'Roll an emotion and use it to begin a conversation.',
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
