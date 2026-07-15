export default {
  id: 'mood-check-in',
  displayName: 'Mood Check-In',
  version: '1.0.0',
  type: 'core_activity',
  status: 'live_current',
  platforms: ['mobile', 'web'],
  launchMode: 'embedded',
  estimatedDurationMinutes: { minimum: 1, maximum: 5 },
  oneLineDescription:
    'Share how you are feeling at the beginning, middle, or end of a session.',
  supports: {
    sharedState: true,
    scoring: false,
    reducedMotion: true,
    providerFacilitationPanel: true,
    clientJournal: true,
    sharedNotes: true
  }
};
