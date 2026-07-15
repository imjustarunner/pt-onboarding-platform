/**
 * Phase 3 counseling activities — server-authoritative draws/deals.
 * Clients may animate locally; outcomes always come from the server.
 */

export const FEELINGS_ADVENTURE_PACKS = {
  school: {
    id: 'school',
    situations: [
      {
        id: 'school-1',
        text: 'You have a big test tomorrow and you are feeling overwhelmed. What could you do?'
      },
      {
        id: 'school-2',
        text: 'A classmate said something that stung. You are not sure whether to speak up.'
      },
      {
        id: 'school-3',
        text: 'You forgot an assignment and worry what your teacher will think.'
      },
      {
        id: 'school-4',
        text: 'Group project work feels uneven. You are frustrated but quiet.'
      }
    ]
  },
  friends: {
    id: 'friends',
    situations: [
      {
        id: 'friends-1',
        text: 'Friends made plans without you. You feel left out.'
      },
      {
        id: 'friends-2',
        text: 'Someone asked you to keep a secret that makes you uncomfortable.'
      },
      {
        id: 'friends-3',
        text: 'You want to join an activity but worry about looking awkward.'
      }
    ]
  },
  home: {
    id: 'home',
    situations: [
      {
        id: 'home-1',
        text: 'Plans changed suddenly and your day feels thrown off.'
      },
      {
        id: 'home-2',
        text: 'You had a disagreement at home and do not know how to repair it.'
      },
      {
        id: 'home-3',
        text: 'Something important is coming up and your stomach feels tight.'
      }
    ]
  }
};

export const CHARADES_EMOTIONS = [
  { id: 'happy', label: 'Happy' },
  { id: 'sad', label: 'Sad' },
  { id: 'anxious', label: 'Anxious' },
  { id: 'angry', label: 'Angry' },
  { id: 'surprised', label: 'Surprised' },
  { id: 'calm', label: 'Calm' },
  { id: 'proud', label: 'Proud' },
  { id: 'frustrated', label: 'Frustrated' },
  { id: 'lonely', label: 'Lonely' },
  { id: 'excited', label: 'Excited' },
  { id: 'embarrassed', label: 'Embarrassed' },
  { id: 'hopeful', label: 'Hopeful' }
];

/**
 * @param {string} packId
 * @param {{ random?: () => number, excludeId?: string }} [opts]
 */
export function pickSituationCard(packId, opts = {}) {
  const pack = FEELINGS_ADVENTURE_PACKS[packId] || FEELINGS_ADVENTURE_PACKS.school;
  const list = pack.situations;
  const candidates = opts.excludeId ? list.filter((s) => s.id !== opts.excludeId) : list;
  const pool = candidates.length ? candidates : list;
  const random = typeof opts.random === 'function' ? opts.random : Math.random;
  const idx = Math.floor(random() * pool.length) % pool.length;
  return pool[idx];
}

/**
 * @param {{ random?: () => number, excludeId?: string }} [opts]
 */
export function pickCharadesEmotion(opts = {}) {
  const candidates = opts.excludeId
    ? CHARADES_EMOTIONS.filter((e) => e.id !== opts.excludeId)
    : CHARADES_EMOTIONS;
  const pool = candidates.length ? candidates : CHARADES_EMOTIONS;
  const random = typeof opts.random === 'function' ? opts.random : Math.random;
  const idx = Math.floor(random() * pool.length) % pool.length;
  return pool[idx];
}

export function buildInitialFeelingsAdventureState(setup = {}) {
  return {
    phase: 'setup',
    packId: setup.packId || null,
    clientToken: null,
    clientPosition: 0,
    providerPosition: 0,
    currentTurn: 'client',
    currentSituationId: null,
    currentSituationText: null,
    history: [],
    selectedFeelings: [],
    bodyClue: '',
    nextStep: ''
  };
}

export function buildInitialCopingQuestState(setup = {}) {
  return {
    phase: 'setup',
    packId: setup.packId || null,
    progress: 0,
    currentScenarioId: null,
    currentScenarioText: null,
    selectedCardId: null,
    consequenceText: null,
    contextMark: null,
    choiceHistory: [],
    plan: null
  };
}

export function buildInitialEmotionCharadesState(setup = {}) {
  return {
    phase: 'setup',
    firstActor: setup.firstActor || 'client',
    actorRole: null,
    maximumRounds: Number(setup.maximumRounds) || 3,
    round: 1,
    currentEmotionId: null,
    currentEmotionLabel: null,
    revealed: false,
    expressionMode: setup.expressionMode || 'face',
    guessHistory: []
  };
}

export function buildInitialCalmDownBuilderState() {
  return {
    phase: 'before',
    pathSize: 3,
    path: [null, null, null],
    practiceIndex: 0,
    beforeCalm: null,
    afterCalm: null,
    calmPlan: null
  };
}

export function buildInitialStoryShelfState() {
  return {
    phase: 'shelf',
    topicId: null,
    storyId: null,
    pageIndex: 0,
    bookmark: 0,
    readingMode: 'together',
    discussionMarkers: [],
    reflection: null
  };
}
