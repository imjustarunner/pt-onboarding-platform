/** Situation packs for Feelings Adventure (card draws are server-authoritative). */

export const PACKS = {
  school: {
    id: 'school',
    label: 'School & stress',
    situations: [
      {
        id: 'school-1',
        text: 'You have a big test tomorrow and you are feeling overwhelmed. What could you do?',
        prompts: [
          'What feelings are present?',
          'What thoughts might show up?',
          'What is one small next step?'
        ]
      },
      {
        id: 'school-2',
        text: 'A classmate said something that stung. You are not sure whether to speak up.',
        prompts: ['What might you be feeling?', 'Who could help?', 'What would feel manageable?']
      },
      {
        id: 'school-3',
        text: 'You forgot an assignment and worry what your teacher will think.',
        prompts: ['Where do you notice this in your body?', 'What could make this more manageable?']
      },
      {
        id: 'school-4',
        text: 'Group project work feels uneven. You are frustrated but quiet.',
        prompts: ['What feeling fits best?', 'What is one helpful next step?']
      }
    ]
  },
  friends: {
    id: 'friends',
    label: 'Friends & belonging',
    situations: [
      {
        id: 'friends-1',
        text: 'Friends made plans without you. You feel left out.',
        prompts: ['What feelings are present?', 'What would you want a friend to understand?']
      },
      {
        id: 'friends-2',
        text: 'Someone asked you to keep a secret that makes you uncomfortable.',
        prompts: ['What feels hard about this?', 'Who could help?', 'What is one small next step?']
      },
      {
        id: 'friends-3',
        text: 'You want to join an activity but worry about looking awkward.',
        prompts: ['What body clues show up?', 'What could make it more manageable?']
      }
    ]
  },
  home: {
    id: 'home',
    label: 'Home & change',
    situations: [
      {
        id: 'home-1',
        text: 'Plans changed suddenly and your day feels thrown off.',
        prompts: ['What feelings are present?', 'What thoughts might show up?']
      },
      {
        id: 'home-2',
        text: 'You had a disagreement at home and do not know how to repair it.',
        prompts: ['What might both sides be feeling?', 'What is one helpful next step?']
      },
      {
        id: 'home-3',
        text: 'Something important is coming up and your stomach feels tight.',
        prompts: ['Where do you notice it in your body?', 'What could help a little?']
      }
    ]
  }
};

export const FEELING_OPTIONS = [
  'Happy',
  'Sad',
  'Anxious',
  'Angry',
  'Overwhelmed',
  'Proud',
  'Lonely',
  'Hopeful',
  'Frustrated',
  'Calm'
];

export const BOARD_SPACES = 12;

export function spaceType(index) {
  if (index <= 0) return 'start';
  if (index >= BOARD_SPACES - 1) return 'finish';
  const types = ['situation', 'reflection', 'coping', 'encouragement', 'situation'];
  return types[index % types.length];
}

export function spacePrompt(type) {
  switch (type) {
    case 'coping':
      return 'What is one coping idea that might help here?';
    case 'reflection':
      return 'Take a breath. What stood out from the last card?';
    case 'encouragement':
      return 'Name one strength you used today.';
    default:
      return null;
  }
}
