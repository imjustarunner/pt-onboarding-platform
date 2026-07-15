/** Scenario and coping cards for Coping Quest — no universal good/bad scoring. */

export const SCENARIO_PACKS = {
  stress: {
    id: 'stress',
    label: 'Everyday stress',
    scenarios: [
      {
        id: 'stress-1',
        text: 'You have a lot due soon and your mind keeps jumping between tasks.'
      },
      {
        id: 'stress-2',
        text: 'You feel tense after a hard conversation and still have more of the day left.'
      },
      {
        id: 'stress-3',
        text: 'You are waiting for news and find it hard to focus on anything else.'
      }
    ]
  },
  school: {
    id: 'school',
    label: 'School pressure',
    scenarios: [
      {
        id: 'school-1',
        text: 'A quiz is tomorrow and you have not started reviewing yet.'
      },
      {
        id: 'school-2',
        text: 'You feel behind compared with classmates and do not know where to begin.'
      }
    ]
  }
};

export const COPING_CARDS = [
  {
    id: 'deep-breathing',
    label: 'Deep Breathing',
    shortTerm: 'May settle the body for a moment so thinking feels a little clearer.'
  },
  {
    id: 'plan-it-out',
    label: 'Plan It Out',
    shortTerm: 'May turn a fuzzy worry into one or two concrete next steps.'
  },
  {
    id: 'listen-music',
    label: 'Listen to Music',
    shortTerm: 'May offer a short break — helpful if you return to the task afterward.'
  },
  {
    id: 'scroll-hours',
    label: 'Scroll for Hours',
    shortTerm: 'May distract briefly, but can leave less time and more stress later.'
  },
  {
    id: 'stress-eat',
    label: 'Stress Eat',
    shortTerm: 'May soothe for a moment; sometimes it does not address the original stressor.'
  },
  {
    id: 'ask-help',
    label: 'Ask for Help',
    shortTerm: 'May bring support, ideas, or company — timing and who you ask matter.'
  },
  {
    id: 'short-walk',
    label: 'Take a Short Walk',
    shortTerm: 'May release tension and create a reset before returning to the task.'
  },
  {
    id: 'break-steps',
    label: 'Break the Task Into Steps',
    shortTerm: 'May make a big task feel smaller and more doable.'
  }
];

export const CONTEXT_MARKS = ['helpful', 'unhelpful', 'context_dependent', 'worth_discussing'];

export function cardById(id) {
  return COPING_CARDS.find((c) => c.id === id) || null;
}
