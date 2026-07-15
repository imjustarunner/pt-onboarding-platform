/**
 * Emotion Dice — server-authoritative packs and roll helpers.
 * Clients animate locally; the face always comes from the server.
 */

export const DEFAULT_PACK_ID = 'core-6';
export const ALT_PACK_ID = 'alt-6';

export const EMOTION_PACKS = {
  [DEFAULT_PACK_ID]: {
    id: DEFAULT_PACK_ID,
    label: 'Core emotions',
    emotions: [
      { id: 'happy', label: 'Happy' },
      { id: 'sad', label: 'Sad' },
      { id: 'anxious', label: 'Anxious' },
      { id: 'angry', label: 'Angry' },
      { id: 'surprised', label: 'Surprised' },
      { id: 'calm', label: 'Calm' }
    ]
  },
  [ALT_PACK_ID]: {
    id: ALT_PACK_ID,
    label: 'Alternate emotions',
    emotions: [
      { id: 'proud', label: 'Proud' },
      { id: 'frustrated', label: 'Frustrated' },
      { id: 'lonely', label: 'Lonely' },
      { id: 'excited', label: 'Excited' },
      { id: 'embarrassed', label: 'Embarrassed' },
      { id: 'hopeful', label: 'Hopeful' }
    ]
  }
};

/** Prompt depth ladder: Light → Notice → Share → Perspective */
export const PROMPT_DEPTHS = ['light', 'notice', 'share', 'perspective'];

const PROMPTS_BY_DEPTH = {
  light: [
    { id: 'light-1', text: 'When do you notice this feeling showing up?' },
    { id: 'light-2', text: 'What is one word that goes with this emotion?' },
    { id: 'light-3', text: 'Where might you feel this in your body?' }
  ],
  notice: [
    { id: 'notice-1', text: 'What usually comes just before this feeling?' },
    { id: 'notice-2', text: 'How strong does it feel right now, on a 1–5 scale?' },
    { id: 'notice-3', text: 'Has this feeling changed since the session started?' }
  ],
  share: [
    { id: 'share-1', text: 'What would you want someone else to understand about this feeling?' },
    { id: 'share-2', text: 'Is there a recent moment when this came up for you?' },
    { id: 'share-3', text: 'What tends to help a little when this shows up?' }
  ],
  perspective: [
    { id: 'perspective-1', text: 'If a friend felt this, what might you gently say to them?' },
    { id: 'perspective-2', text: 'What else might be true alongside this feeling?' },
    { id: 'perspective-3', text: 'Looking ahead, what would “making space” for this look like?' }
  ]
};

export function getPack(packId) {
  return EMOTION_PACKS[packId] || EMOTION_PACKS[DEFAULT_PACK_ID];
}

export function normalizePromptDepth(depth) {
  const d = String(depth || 'light').toLowerCase();
  return PROMPT_DEPTHS.includes(d) ? d : 'light';
}

export function lighterPromptDepth(depth) {
  const d = normalizePromptDepth(depth);
  const idx = PROMPT_DEPTHS.indexOf(d);
  return PROMPT_DEPTHS[Math.max(0, idx - 1)];
}

/**
 * Deterministic-friendly roll for tests: pass a custom random() in [0, 1).
 * @param {string} packId
 * @param {{ random?: () => number }} [opts]
 */
export function pickEmotion(packId, opts = {}) {
  const pack = getPack(packId);
  const emotions = pack.emotions;
  const random = typeof opts.random === 'function' ? opts.random : Math.random;
  const idx = Math.floor(random() * emotions.length) % emotions.length;
  return emotions[idx];
}

/**
 * @param {string} depth
 * @param {{ random?: () => number, excludeId?: string }} [opts]
 */
export function pickPrompt(depth, opts = {}) {
  const d = normalizePromptDepth(depth);
  const list = PROMPTS_BY_DEPTH[d] || PROMPTS_BY_DEPTH.light;
  const candidates = opts.excludeId ? list.filter((p) => p.id !== opts.excludeId) : list;
  const pool = candidates.length ? candidates : list;
  const random = typeof opts.random === 'function' ? opts.random : Math.random;
  const idx = Math.floor(random() * pool.length) % pool.length;
  return { ...pool[idx], depth: d };
}

export function oppositeTurn(turn) {
  return turn === 'provider' ? 'client' : 'provider';
}

/**
 * Apply a server roll onto shared state. Does not mutate input.
 * `round` becomes the count of completed rolls (1-based after first roll).
 */
export function applyRollToSharedState(sharedState, { rollerRole, emotion, prompt }) {
  const state = { ...(sharedState || {}) };
  const maximumRounds = Math.max(1, Number(state.maximumRounds) || 3);
  const history = Array.isArray(state.rollHistory) ? [...state.rollHistory] : [];
  const round = history.length + 1;
  history.push({
    round,
    rollerRole,
    emotionId: emotion.id,
    emotionLabel: emotion.label,
    promptId: prompt.id,
    promptText: prompt.text,
    promptDepth: prompt.depth,
    at: new Date().toISOString()
  });

  const finished = history.length >= maximumRounds;

  return {
    ...state,
    round,
    maximumRounds,
    currentTurn: oppositeTurn(rollerRole),
    currentEmotionId: emotion.id,
    currentEmotionLabel: emotion.label,
    currentPromptId: prompt.id,
    currentPromptText: prompt.text,
    promptDepth: prompt.depth,
    packId: state.packId || DEFAULT_PACK_ID,
    rollHistory: history,
    paused: false,
    phase: finished ? 'rounds_complete' : 'discuss',
    lastRollAt: new Date().toISOString(),
    lastRollerRole: rollerRole
  };
}

export function buildInitialEmotionDiceState(overrides = {}) {
  const whoRollsFirst = overrides.whoRollsFirst === 'provider' ? 'provider' : 'client';
  return {
    activityDisplayName: 'Emotion Dice',
    packId: overrides.packId || DEFAULT_PACK_ID,
    maximumRounds: Number(overrides.maximumRounds) || 3,
    round: 0,
    whoRollsFirst,
    currentTurn: whoRollsFirst,
    promptDepth: normalizePromptDepth(overrides.promptDepth || 'light'),
    currentEmotionId: null,
    currentEmotionLabel: null,
    currentPromptId: null,
    currentPromptText: null,
    rollHistory: [],
    paused: false,
    phase: 'ready',
    ...overrides,
    // Ensure critical fields win over spread overrides when empty
    whoRollsFirst,
    currentTurn: overrides.currentTurn || whoRollsFirst
  };
}
