export default {
  id: 'coping-quest',
  displayName: 'Coping Quest',
  version: '1.0.0',
  type: 'choice_consequence_game',
  status: 'current_pilot',
  platforms: ['mobile', 'web'],
  launchMode: 'embedded',
  featureFlag: 'activity.copingQuest.enabled',
  estimatedDurationMinutes: { minimum: 8, maximum: 20 },
  oneLineDescription: 'Compare coping choices and discuss their likely effects.',
  supports: {
    sharedState: true,
    scoring: false,
    reducedMotion: true,
    providerFacilitationPanel: true,
    clientJournal: true,
    sharedNotes: true
  }
};
