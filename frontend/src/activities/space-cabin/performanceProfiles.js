/**
 * Scene-performance / immersive profiles (spec §26.12).
 * V1 stores the selected profile in shared activity runtime state.
 * Reduced Motion also follows the OS/browser preference from ActivityHost.
 */

export const PERFORMANCE_PROFILES = [
  {
    id: 'high',
    label: 'High',
    sceneQuality: 'full',
    effects: 'full',
    intendedUse: 'Desktop with strong connection'
  },
  {
    id: 'balanced',
    label: 'Balanced',
    sceneQuality: 'medium',
    effects: 'reduced',
    intendedUse: 'Standard laptop or tablet'
  },
  {
    id: 'mobile',
    label: 'Mobile',
    sceneQuality: 'reduced',
    effects: 'limited',
    intendedUse: 'Modern phone'
  },
  {
    id: 'low_bandwidth',
    label: 'Low bandwidth',
    sceneQuality: 'static',
    effects: 'off',
    intendedUse: 'Weak connection'
  },
  {
    id: 'reduced_motion',
    label: 'Reduced motion',
    sceneQuality: 'static',
    effects: 'minimal',
    intendedUse: 'Accessibility preference'
  }
];

/** Scene mood tint — pragmatic immersive-profile V1 (not a full identity system). */
export const SCENE_MOODS = [
  { id: 'curious', label: 'Curious', accent: '#7ec8e3' },
  { id: 'calm', label: 'Calm', accent: '#8fbf9f' },
  { id: 'warm', label: 'Warm', accent: '#e8b86d' },
  { id: 'tense', label: 'Focused', accent: '#c9897a' }
];

export function defaultProfileForLayout(layout) {
  return layout === 'web' ? 'balanced' : 'mobile';
}

export function resolveEffectiveProfile({ profileId, reducedMotion, layout }) {
  if (reducedMotion) return 'reduced_motion';
  const known = PERFORMANCE_PROFILES.some((p) => p.id === profileId);
  if (known) return profileId;
  return defaultProfileForLayout(layout);
}

export function profileAllowsEffects(profileId) {
  return !['low_bandwidth', 'reduced_motion'].includes(profileId);
}

export function profileIsStatic(profileId) {
  return ['low_bandwidth', 'reduced_motion'].includes(profileId);
}
