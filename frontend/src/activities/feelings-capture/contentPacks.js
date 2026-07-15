/**
 * Feelings Capture content — situations and emotion characters.
 * Multiple answers are always valid; nothing is scored as correct/incorrect.
 */

export const MODES = {
  shared_capture: {
    id: 'shared_capture',
    label: 'Shared Capture',
    description: 'Both of you add emotions into one shared container.'
  },
  compare_perspectives: {
    id: 'compare_perspectives',
    label: 'Compare Perspectives',
    description: 'Select separately, then notice similarities and differences.'
  },
  client_led: {
    id: 'client_led',
    label: 'Client-Led',
    description: 'Client selects first; provider asks follow-up questions.'
  },
  untimed_calm: {
    id: 'untimed_calm',
    label: 'Untimed Calm',
    description: 'Emotions stay still. Tap choices without pressure.'
  }
};

export const DEFAULT_MODE = 'untimed_calm';

/** Core emotion characters (text labels required for accessibility). */
export const EMOTIONS = [
  { id: 'calm', label: 'Calm', shape: '○', hue: 195 },
  { id: 'proud', label: 'Proud', shape: '◇', hue: 45 },
  { id: 'worried', label: 'Worried', shape: '△', hue: 28 },
  { id: 'angry', label: 'Angry', shape: '◆', hue: 0 },
  { id: 'grateful', label: 'Grateful', shape: '☆', hue: 140 },
  { id: 'sad', label: 'Sad', shape: '▽', hue: 220 },
  { id: 'excited', label: 'Excited', shape: '✦', hue: 320 },
  { id: 'confused', label: 'Confused', shape: '◌', hue: 270 },
  { id: 'disappointed', label: 'Disappointed', shape: '▣', hue: 15 },
  { id: 'relieved', label: 'Relieved', shape: '◎', hue: 170 },
  { id: 'overwhelmed', label: 'Overwhelmed', shape: '◈', hue: 300 },
  { id: 'lonely', label: 'Lonely', shape: '◯', hue: 250 }
];

export const SITUATIONS = [
  {
    id: 'project-and-cancel',
    text: 'You have a big project due tomorrow and a friend cancels plans you were looking forward to.',
    suggestedEmotionIds: [
      'disappointed',
      'worried',
      'angry',
      'relieved',
      'overwhelmed',
      'lonely'
    ]
  },
  {
    id: 'team-credit',
    text: 'Your team finishes something hard together, but someone else gets most of the credit.',
    suggestedEmotionIds: ['proud', 'angry', 'disappointed', 'confused', 'grateful', 'sad']
  },
  {
    id: 'good-news-stress',
    text: 'You get good news about something you wanted — and it also means a big change.',
    suggestedEmotionIds: ['excited', 'worried', 'grateful', 'overwhelmed', 'calm', 'confused']
  },
  {
    id: 'quiet-group',
    text: 'You walk into a group where everyone already seems close, and you are not sure how to join.',
    suggestedEmotionIds: ['lonely', 'worried', 'confused', 'excited', 'calm', 'disappointed']
  },
  {
    id: 'apology',
    text: 'Someone apologizes for something that hurt, and you are not sure how you feel yet.',
    suggestedEmotionIds: ['relieved', 'angry', 'sad', 'confused', 'grateful', 'worried']
  },
  {
    id: 'almost-ready',
    text: 'You practiced something for a long time and feel almost ready — but not quite.',
    suggestedEmotionIds: ['proud', 'worried', 'excited', 'overwhelmed', 'calm', 'confused']
  }
];

export const DISCUSSION_PROMPTS = [
  'Why might that emotion show up here?',
  'Could more than one of these fit at the same time?',
  'Which feeling feels strongest right now — if any?',
  'Is there a feeling that surprised you?',
  'What would help someone in this situation?'
];

export const REFLECTION_PROMPTS = [
  'What stood out about having more than one feeling?',
  'Was there an emotion that was hard to name?',
  'How might noticing mixed feelings help in real life?',
  'Would you want to use this again?'
];

export function emotionById(id) {
  return EMOTIONS.find((e) => e.id === id) || null;
}

export function emotionLabel(id) {
  return emotionById(id)?.label || id;
}

export function situationById(id) {
  return SITUATIONS.find((s) => s.id === id) || SITUATIONS[0];
}

export function emotionsForSituation(situation) {
  const ids = situation?.suggestedEmotionIds || [];
  const fromSuggested = ids.map((id) => emotionById(id)).filter(Boolean);
  if (fromSuggested.length >= 4) return fromSuggested;
  return EMOTIONS.slice(0, 8);
}

export function createInitialSharedState(overrides = {}) {
  const situation = SITUATIONS[0];
  return {
    phase: 'intro',
    mode: DEFAULT_MODE,
    situationIndex: 0,
    situationId: situation.id,
    maximumRounds: 3,
    round: 1,
    selectedShared: [],
    selectedClient: [],
    selectedProvider: [],
    compareRevealed: false,
    discussionEmotionId: null,
    hapticsEnabled: false,
    staticMode: true,
    timerEnabled: false,
    timerSeconds: null,
    skipped: false,
    ...overrides
  };
}
