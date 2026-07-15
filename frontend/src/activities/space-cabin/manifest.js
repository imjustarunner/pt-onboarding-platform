export default {
  id: 'space-cabin-conversation',
  displayName: 'Space Cabin Conversation',
  version: '1.0.0',
  type: 'immersive_narrative',
  status: 'current_pilot',
  platforms: ['mobile', 'web'],
  launchMode: 'embedded',
  webFullFidelity: true,
  featureFlag: 'activity.spaceCabin.enabled',
  estimatedDurationMinutes: { minimum: 10, maximum: 30 },
  oneLineDescription:
    'Practice communication and perspective taking with an immersive cabin scene.',
  supports: {
    sharedState: true,
    turnTaking: false,
    scoring: false,
    reducedMotion: true,
    providerFacilitationPanel: true,
    clientJournal: true,
    sharedNotes: true,
    performanceProfiles: true,
    narrativeBranching: true
  }
};
