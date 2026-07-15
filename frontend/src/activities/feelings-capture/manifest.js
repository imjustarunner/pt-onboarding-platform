export default {
  id: 'feelings-capture',
  displayName: 'Feelings Capture',
  version: '1.0.0',
  type: 'touch_matching_game',
  status: 'current_pilot',
  platforms: ['mobile', 'web'],
  launchMode: 'embedded',
  featureFlag: 'activity.feelingsCapture.enabled',
  estimatedDurationMinutes: { minimum: 5, maximum: 12 },
  oneLineDescription: 'Identify multiple emotions connected to a situation.',
  supports: {
    sharedState: true,
    turnTaking: false,
    scoring: false,
    reducedMotion: true,
    providerFacilitationPanel: true,
    clientJournal: true,
    sharedNotes: true,
    haptics: true,
    staticMode: true
  }
};
