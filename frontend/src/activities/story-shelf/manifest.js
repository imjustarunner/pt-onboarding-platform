export default {
  id: 'story-shelf',
  displayName: 'StoryShelf',
  version: '1.0.0',
  type: 'shared_reading',
  status: 'current_pilot',
  platforms: ['mobile', 'web'],
  launchMode: 'embedded',
  featureFlag: 'activity.storyShelf.enabled',
  estimatedDurationMinutes: { minimum: 10, maximum: 30 },
  oneLineDescription: 'Select topic-based short stories and read them aloud or together.',
  supports: {
    sharedState: true,
    scoring: false,
    reducedMotion: true,
    providerFacilitationPanel: true,
    clientJournal: true,
    sharedNotes: true
  }
};
