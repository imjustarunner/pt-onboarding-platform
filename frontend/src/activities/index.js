import moodCheckInManifest from './mood-check-in/manifest.js';
import emotionDiceManifest from './emotion-dice/manifest.js';
import peacefulPondManifest from './peaceful-pond/manifest.js';
import feelingsAdventureManifest from './feelings-adventure/manifest.js';
import copingQuestManifest from './coping-quest/manifest.js';
import emotionCharadesManifest from './emotion-charades/manifest.js';
import calmDownBuilderManifest from './calm-down-builder/manifest.js';
import storyShelfManifest from './story-shelf/manifest.js';
import feelingsCaptureManifest from './feelings-capture/manifest.js';
import spaceCabinManifest from './space-cabin/manifest.js';

/** First-party embedded activity map for ActivityHost */
export const embeddedActivityComponents = {
  'mood-check-in': () => import('./mood-check-in/MoodCheckInActivity.vue'),
  'emotion-dice': () => import('./emotion-dice/EmotionDiceActivity.vue'),
  'peaceful-pond': () => import('./peaceful-pond/PeacefulPondActivity.vue'),
  'feelings-adventure': () => import('./feelings-adventure/FeelingsAdventureActivity.vue'),
  'coping-quest': () => import('./coping-quest/CopingQuestActivity.vue'),
  'emotion-charades': () => import('./emotion-charades/EmotionCharadesActivity.vue'),
  'calm-down-builder': () => import('./calm-down-builder/CalmDownBuilderActivity.vue'),
  'story-shelf': () => import('./story-shelf/StoryShelfActivity.vue'),
  'feelings-capture': () => import('./feelings-capture/FeelingsCaptureActivity.vue'),
  'space-cabin-conversation': () => import('./space-cabin/SpaceCabinActivity.vue')
};

export const embeddedActivityManifests = {
  'mood-check-in': moodCheckInManifest,
  'emotion-dice': emotionDiceManifest,
  'peaceful-pond': peacefulPondManifest,
  'feelings-adventure': feelingsAdventureManifest,
  'coping-quest': copingQuestManifest,
  'emotion-charades': emotionCharadesManifest,
  'calm-down-builder': calmDownBuilderManifest,
  'story-shelf': storyShelfManifest,
  'feelings-capture': feelingsCaptureManifest,
  'space-cabin-conversation': spaceCabinManifest
};

export function isEmbeddedActivityImplemented(activityId) {
  return Object.prototype.hasOwnProperty.call(embeddedActivityComponents, activityId);
}
