import { describe, it, expect } from 'vitest';
import { isEmbeddedActivityImplemented, embeddedActivityManifests } from '../index.js';
import { PACKS, BOARD_SPACES, spaceType } from '../feelings-adventure/contentPacks.js';
import { COPING_CARDS, CONTEXT_MARKS } from '../coping-quest/contentPacks.js';
import { EMOTION_OPTIONS } from '../emotion-charades/contentPacks.js';
import { CALM_TOOLS, PATH_SIZE_OPTIONS } from '../calm-down-builder/contentPacks.js';
import { TOPICS, storiesForTopic, findStory } from '../story-shelf/contentPacks.js';

const PHASE3_IDS = [
  'feelings-adventure',
  'coping-quest',
  'emotion-charades',
  'calm-down-builder',
  'story-shelf'
];

describe('Phase 3 embedded activity registry', () => {
  it('registers all Phase 3 activities without dropping Phase 2/4/5', () => {
    for (const id of PHASE3_IDS) {
      expect(isEmbeddedActivityImplemented(id)).toBe(true);
      expect(embeddedActivityManifests[id].id).toBe(id);
      expect(embeddedActivityManifests[id].launchMode).toBe('embedded');
      expect(embeddedActivityManifests[id].status).toBe('current_pilot');
    }
    expect(isEmbeddedActivityImplemented('mood-check-in')).toBe(true);
    expect(isEmbeddedActivityImplemented('emotion-dice')).toBe(true);
    expect(isEmbeddedActivityImplemented('peaceful-pond')).toBe(true);
    expect(isEmbeddedActivityImplemented('feelings-capture')).toBe(true);
    expect(isEmbeddedActivityImplemented('space-cabin-conversation')).toBe(true);
  });

  it('uses activity.* feature flags', () => {
    expect(embeddedActivityManifests['feelings-adventure'].featureFlag).toBe(
      'activity.feelingsAdventure.enabled'
    );
    expect(embeddedActivityManifests['coping-quest'].featureFlag).toBe(
      'activity.copingQuest.enabled'
    );
    expect(embeddedActivityManifests['emotion-charades'].featureFlag).toBe(
      'activity.emotionCharades.enabled'
    );
    expect(embeddedActivityManifests['calm-down-builder'].featureFlag).toBe(
      'activity.calmDownBuilder.enabled'
    );
    expect(embeddedActivityManifests['story-shelf'].featureFlag).toBe(
      'activity.storyShelf.enabled'
    );
  });

  it('disables diagnostic scoring on all Phase 3 manifests', () => {
    for (const id of PHASE3_IDS) {
      expect(embeddedActivityManifests[id].supports.scoring).toBe(false);
    }
  });
});

describe('Feelings Adventure content', () => {
  it('has packs and cooperative board spaces', () => {
    expect(Object.keys(PACKS).length).toBeGreaterThanOrEqual(2);
    expect(BOARD_SPACES).toBeGreaterThan(4);
    expect(spaceType(0)).toBe('start');
    expect(spaceType(BOARD_SPACES - 1)).toBe('finish');
  });
});

describe('Coping Quest content', () => {
  it('avoids permanent good/bad classification helpers', () => {
    expect(COPING_CARDS.length).toBeGreaterThanOrEqual(5);
    expect(CONTEXT_MARKS).toContain('context_dependent');
    expect(CONTEXT_MARKS).toContain('worth_discussing');
  });
});

describe('Emotion Charades content', () => {
  it('provides emotion options for private deals', () => {
    expect(EMOTION_OPTIONS.length).toBeGreaterThanOrEqual(6);
  });
});

describe('Calm Down Builder content', () => {
  it('supports 3–5 tool paths', () => {
    expect(PATH_SIZE_OPTIONS).toEqual([3, 4, 5]);
    expect(CALM_TOOLS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('StoryShelf content', () => {
  it('includes grief set with content notes and reading pages', () => {
    expect(TOPICS.some((t) => t.id === 'grief')).toBe(true);
    const grief = storiesForTopic('grief');
    expect(grief.length).toBe(6);
    expect(grief.every((s) => Array.isArray(s.pages) && s.pages.length > 0)).toBe(true);
    expect(findStory('grief', 'star-i-still-see')?.contentNote).toBeTruthy();
  });
});
