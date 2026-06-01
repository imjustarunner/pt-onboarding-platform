/** Default tap-to-select presets for Skill Builders session observations (v1). */

export const SKILL_BUILDERS_OBSERVATION_PRESETS = {
  overallStatus: [
    { id: 'doing_well', label: 'Doing well' },
    { id: 'mixed', label: 'Mixed' },
    { id: 'struggling', label: 'Struggling' },
    { id: 'not_participating', label: 'Not participating' }
  ],
  behaviorValence: [
    { id: 'positive', label: 'Positive' },
    { id: 'concerning', label: 'Concerning' },
    { id: 'mixed', label: 'Mixed' }
  ],
  behaviorsPositive: [
    { id: 'on_task', label: 'On task' },
    { id: 'used_coping_skills', label: 'Used coping skills' },
    { id: 'followed_directions', label: 'Followed directions' },
    { id: 'self_advocated', label: 'Self-advocated' },
    { id: 'calm_recovery', label: 'Calm recovery' }
  ],
  behaviorsConcerning: [
    { id: 'off_task', label: 'Off task' },
    { id: 'escalated', label: 'Escalated' },
    { id: 'left_group', label: 'Left group' },
    { id: 'unsafe_choice', label: 'Unsafe choice' },
    { id: 'needed_redirection', label: 'Needed redirection' }
  ],
  strengths: [
    { id: 'cooperation', label: 'Cooperation' },
    { id: 'communication', label: 'Communication' },
    { id: 'emotional_regulation', label: 'Emotional regulation' },
    { id: 'problem_solving', label: 'Problem solving' },
    { id: 'leadership', label: 'Leadership' }
  ],
  struggles: [
    { id: 'transitions', label: 'Transitions' },
    { id: 'peer_conflict', label: 'Peer conflict' },
    { id: 'focus', label: 'Focus' },
    { id: 'expressing_needs', label: 'Expressing needs' },
    { id: 'managing_frustration', label: 'Managing frustration' }
  ],
  peerInteraction: [
    { id: 'cooperative', label: 'Cooperative' },
    { id: 'withdrawn', label: 'Withdrawn' },
    { id: 'needs_support', label: 'Needed support' },
    { id: 'conflict', label: 'Conflict' },
    { id: 'mixed', label: 'Mixed' }
  ]
};

/** Resolve preset id → label for a category. */
export function labelForPreset(category, id) {
  const list = SKILL_BUILDERS_OBSERVATION_PRESETS[category] || [];
  const hit = list.find((p) => p.id === id);
  return hit?.label || String(id || '').replace(/_/g, ' ');
}

export function labelsForPresetIds(category, ids) {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => labelForPreset(category, id)).filter(Boolean);
}
