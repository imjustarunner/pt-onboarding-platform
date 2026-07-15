/**
 * Curated Space Cabin missions and branching dialogue (spec §26.6–26.8).
 * No generative dialogue; provider can override branch / pause / skip.
 * Content avoids diagnostic framing and does not require personal disclosure.
 */

export const MISSIONS = [
  {
    id: 'first-contact',
    title: 'First Contact',
    summary: 'Practice introducing yourself and asking respectful questions.',
    topics: ['conversation', 'uncertainty'],
    defaultMood: 'curious'
  },
  {
    id: 'alien-misunderstanding',
    title: 'Alien Misunderstanding',
    summary: 'Clarify a mix-up and notice different perspectives.',
    topics: ['perspective_taking', 'clarification'],
    defaultMood: 'tense'
  },
  {
    id: 'mission-stress',
    title: 'Mission Stress',
    summary: 'Respond to pressure with calming or planning tools.',
    topics: ['emotional_regulation', 'asking_for_help'],
    defaultMood: 'tense'
  },
  {
    id: 'homesick-traveler',
    title: 'Homesick Traveler',
    summary: 'Practice empathy around missing people or places.',
    topics: ['empathy', 'connection'],
    defaultMood: 'warm'
  },
  {
    id: 'crew-conflict',
    title: 'Crew Conflict',
    summary: 'Navigate disagreement, name needs, and practice repair.',
    topics: ['social_problem_solving', 'repair'],
    defaultMood: 'tense'
  },
  {
    id: 'unknown-emotion',
    title: 'Unknown Emotion',
    summary: 'Help the alien name and understand a feeling.',
    topics: ['emotional_awareness', 'flexible_thinking'],
    defaultMood: 'curious'
  }
];

/** @type {Record<string, { start: string, nodes: Record<string, object> }>} */
export const MISSION_SCRIPTS = {
  'first-contact': {
    start: 'greet',
    nodes: {
      greet: {
        speaker: 'alien',
        line: 'Hello, travelers. I am Zev. Your ship docked beside mine — may I practice greeting with you?',
        captions: 'Hello, travelers. I am Zev. Your ship docked beside mine — may I practice greeting with you?',
        options: [
          { id: 'hello', label: 'Hello, Zev. Nice to meet you.', next: 'ask_name' },
          { id: 'curious', label: 'Sure — what would you like to know?', next: 'ask_open' },
          { id: 'unsure', label: 'I feel a little unsure, but I can try.', next: 'reassure' },
          { id: 'clarify', label: 'Ask for clarification', next: 'clarify_greet', clientEscape: true }
        ]
      },
      clarify_greet: {
        speaker: 'alien',
        line: 'Of course. I only want a friendly hello — nothing private. Would you like to start, or shall I?',
        options: [
          { id: 'you_start', label: 'You can start.', next: 'ask_open' },
          { id: 'i_start', label: 'I will say hello first.', next: 'ask_name' }
        ]
      },
      reassure: {
        speaker: 'alien',
        line: 'Uncertainty is welcome here. We can go slowly. What is one thing you notice about this cabin?',
        options: [
          { id: 'stars', label: 'The stars outside look calm.', next: 'notice_share' },
          { id: 'table', label: 'The glowing table is interesting.', next: 'notice_share' },
          { id: 'skip', label: 'Skip this question', next: 'ask_open', clientEscape: true }
        ]
      },
      ask_name: {
        speaker: 'alien',
        line: 'Thank you. On my planet, we share a short greeting and one curiosity. What is one curiosity you have — about space, or about meeting someone new?',
        options: [
          { id: 'space', label: 'I wonder what your home looks like.', next: 'wrap_curiosity' },
          { id: 'meeting', label: 'I wonder how to be respectful when I feel shy.', next: 'wrap_curiosity' },
          { id: 'provider', label: 'Ask provider first', next: 'discuss_prompt', clientEscape: true }
        ]
      },
      ask_open: {
        speaker: 'alien',
        line: 'I am curious how humans start conversations when they feel unsure. What helps you begin?',
        options: [
          { id: 'smile', label: 'A simple hello and a pause.', next: 'wrap_curiosity' },
          { id: 'question', label: 'Asking a gentle question.', next: 'wrap_curiosity' },
          { id: 'help', label: 'Having someone nearby who supports me.', next: 'wrap_curiosity' }
        ]
      },
      notice_share: {
        speaker: 'alien',
        line: 'Noticing is a kind of greeting too. Shall we practice one more exchange?',
        options: [
          { id: 'yes', label: 'Yes — one more.', next: 'ask_open' },
          { id: 'enough', label: 'That feels like enough for now.', next: 'closing' }
        ]
      },
      wrap_curiosity: {
        speaker: 'alien',
        line: 'That was a respectful start. Curiosity without pressure is a good skill. Ready to land the conversation?',
        options: [
          { id: 'land', label: 'Yes — wrap up.', next: 'closing' },
          { id: 'discuss', label: 'Pause for discussion', next: 'discuss_prompt', clientEscape: true }
        ]
      },
      discuss_prompt: {
        speaker: 'system',
        line: 'Discussion pause — talk together before continuing.',
        discussionPrompt: 'What felt easy or hard about starting this conversation?',
        options: [
          { id: 'continue', label: 'Continue with Zev', next: 'closing' },
          { id: 'end', label: 'Go to debrief', next: 'closing' }
        ]
      },
      closing: {
        speaker: 'alien',
        line: 'Thank you for practicing with me. Safe travels — and thank you for the kindness.',
        end: true,
        options: [{ id: 'debrief', label: 'Continue to debrief', next: 'debrief' }]
      },
      debrief: {
        speaker: 'system',
        end: true,
        debrief: true,
        line: 'Mission complete. Optional debrief prompts are ready.',
        options: []
      }
    }
  },

  'alien-misunderstanding': {
    start: 'setup',
    nodes: {
      setup: {
        speaker: 'alien',
        line: 'I thought “see you later” meant you were leaving forever. My translator mixed the meaning. Can you help me understand?',
        options: [
          { id: 'explain', label: 'It usually means “until next time.”', next: 'relief' },
          { id: 'ask', label: 'What did it feel like when you heard that?', next: 'feel' },
          { id: 'clarify', label: 'Ask for clarification', next: 'clarify', clientEscape: true }
        ]
      },
      clarify: {
        speaker: 'alien',
        line: 'I heard goodbye and felt a drop in my chest. I want to know if I misunderstood.',
        options: [
          { id: 'yes_mis', label: 'Yes — it was a misunderstanding.', next: 'relief' },
          { id: 'check', label: 'We can check meanings together.', next: 'tools' }
        ]
      },
      feel: {
        speaker: 'alien',
        line: 'I felt alarmed, then embarrassed. Two feelings at once. Does that happen for humans too?',
        options: [
          { id: 'yes', label: 'Yes — feelings can overlap.', next: 'tools' },
          { id: 'name', label: 'Naming both can help.', next: 'tools' },
          { id: 'skip', label: 'Skip this question', next: 'tools', clientEscape: true }
        ]
      },
      relief: {
        speaker: 'alien',
        line: 'Ah — temporary goodbye. My body can soften now. What helps you when words get mixed up?',
        options: [
          { id: 'ask_again', label: 'Ask again, calmly.', next: 'tools' },
          { id: 'restate', label: 'Restate what I heard.', next: 'tools' },
          { id: 'provider', label: 'Ask provider first', next: 'discuss_prompt', clientEscape: true }
        ]
      },
      tools: {
        speaker: 'alien',
        line: 'Checking meaning is a repair tool. Would you like to practice one repair phrase?',
        options: [
          {
            id: 'phrase',
            label: '“I think I misunderstood — can we try again?”',
            next: 'closing'
          },
          { id: 'discuss', label: 'Pause for discussion', next: 'discuss_prompt', clientEscape: true },
          { id: 'enough', label: 'That is enough for now.', next: 'closing' }
        ]
      },
      discuss_prompt: {
        speaker: 'system',
        line: 'Discussion pause.',
        discussionPrompt: 'What helped clarify the misunderstanding?',
        options: [
          { id: 'continue', label: 'Continue', next: 'closing' },
          { id: 'end', label: 'Go to debrief', next: 'closing' }
        ]
      },
      closing: {
        speaker: 'alien',
        line: 'Thank you for helping me see another perspective. The cabin feels clearer now.',
        end: true,
        options: [{ id: 'debrief', label: 'Continue to debrief', next: 'debrief' }]
      },
      debrief: {
        speaker: 'system',
        end: true,
        debrief: true,
        line: 'Mission complete.',
        options: []
      }
    }
  },

  'mission-stress': {
    start: 'alert',
    nodes: {
      alert: {
        speaker: 'alien',
        line: 'The docking timer is blinking. My circuits feel loud. I need to choose: rush, plan, or pause. What would you try first?',
        options: [
          { id: 'pause', label: 'Pause and breathe once.', next: 'breathe' },
          { id: 'plan', label: 'Make a tiny plan.', next: 'plan' },
          { id: 'help', label: 'Ask for help.', next: 'help' },
          { id: 'skip', label: 'Skip this question', next: 'breathe', clientEscape: true }
        ]
      },
      breathe: {
        speaker: 'alien',
        line: 'One slow breath… the blink feels less sharp. What is one next small step?',
        options: [
          { id: 'check', label: 'Check the checklist together.', next: 'closing' },
          { id: 'plan', label: 'Write two steps.', next: 'plan' },
          { id: 'discuss', label: 'Pause for discussion', next: 'discuss_prompt', clientEscape: true }
        ]
      },
      plan: {
        speaker: 'alien',
        line: 'Step one: name the problem. Step two: pick one action. Which action feels doable?',
        options: [
          { id: 'timer', label: 'Reset the timer calmly.', next: 'closing' },
          { id: 'crew', label: 'Tell the crew I need a minute.', next: 'help' },
          { id: 'provider', label: 'Ask provider first', next: 'discuss_prompt', clientEscape: true }
        ]
      },
      help: {
        speaker: 'alien',
        line: 'Asking for help is a strength tool here. Who would you want beside you when pressure rises?',
        options: [
          { id: 'someone', label: 'Someone I trust.', next: 'closing' },
          { id: 'self', label: 'Myself, with a short break.', next: 'closing' },
          { id: 'enough', label: 'Enough for now.', next: 'closing' }
        ]
      },
      discuss_prompt: {
        speaker: 'system',
        line: 'Discussion pause.',
        discussionPrompt: 'What helps when pressure shows up in your body or thoughts?',
        options: [
          { id: 'continue', label: 'Continue', next: 'closing' },
          { id: 'end', label: 'Go to debrief', next: 'closing' }
        ]
      },
      closing: {
        speaker: 'alien',
        line: 'The timer can wait one calm moment. Thank you for practicing under soft pressure — not a test.',
        end: true,
        options: [{ id: 'debrief', label: 'Continue to debrief', next: 'debrief' }]
      },
      debrief: {
        speaker: 'system',
        end: true,
        debrief: true,
        line: 'Mission complete.',
        options: []
      }
    }
  },

  'homesick-traveler': {
    start: 'window',
    nodes: {
      window: {
        speaker: 'alien',
        line: 'Looking at that blue planet, I miss the soft rain on my home moon. Missing can feel heavy and warm at once. Would you sit with that feeling with me?',
        options: [
          { id: 'sit', label: 'Yes — we can sit with it.', next: 'share' },
          { id: 'ask', label: 'What do you miss most?', next: 'share' },
          { id: 'clarify', label: 'Ask for clarification', next: 'clarify', clientEscape: true }
        ]
      },
      clarify: {
        speaker: 'alien',
        line: 'I am not asking you to share private stories. We can talk about comfort in general.',
        options: [
          { id: 'ok', label: 'Okay — comfort in general.', next: 'comfort' },
          { id: 'sit', label: 'We can still sit quietly.', next: 'share' }
        ]
      },
      share: {
        speaker: 'alien',
        line: 'Sometimes I hum a home tune. What is one gentle comfort that helps when someone misses a place or person?',
        options: [
          { id: 'memory', label: 'A kind memory.', next: 'comfort' },
          { id: 'message', label: 'Sending a message later.', next: 'comfort' },
          { id: 'skip', label: 'Skip this question', next: 'comfort', clientEscape: true }
        ]
      },
      comfort: {
        speaker: 'alien',
        line: 'Comfort does not erase missing — it makes room beside it. Shall we end with gratitude for connection?',
        options: [
          { id: 'yes', label: 'Yes.', next: 'closing' },
          { id: 'discuss', label: 'Pause for discussion', next: 'discuss_prompt', clientEscape: true },
          { id: 'provider', label: 'Ask provider first', next: 'discuss_prompt', clientEscape: true }
        ]
      },
      discuss_prompt: {
        speaker: 'system',
        line: 'Discussion pause.',
        discussionPrompt: 'What did the traveler seem to need — and what helped?',
        options: [
          { id: 'continue', label: 'Continue', next: 'closing' },
          { id: 'end', label: 'Go to debrief', next: 'closing' }
        ]
      },
      closing: {
        speaker: 'alien',
        line: 'Thank you for the kindness. The cabin feels a little less alone.',
        end: true,
        options: [{ id: 'debrief', label: 'Continue to debrief', next: 'debrief' }]
      },
      debrief: {
        speaker: 'system',
        end: true,
        debrief: true,
        line: 'Mission complete.',
        options: []
      }
    }
  },

  'crew-conflict': {
    start: 'argue',
    nodes: {
      argue: {
        speaker: 'alien',
        line: 'My crewmate wants to leave now. I want to wait for clearer stars. Voices got sharp. How might we begin repair?',
        options: [
          { id: 'pause', label: 'Pause the argument first.', next: 'needs' },
          { id: 'need', label: 'Name each person’s need.', next: 'needs' },
          { id: 'skip', label: 'Skip this question', next: 'needs', clientEscape: true }
        ]
      },
      needs: {
        speaker: 'alien',
        line: 'I need safety. They need progress. Both can be true. What is one respectful next sentence?',
        options: [
          {
            id: 'both',
            label: '“I hear you want to move — I also need a safer window.”',
            next: 'repair'
          },
          {
            id: 'ask',
            label: '“Can we find a plan that covers both needs?”',
            next: 'repair'
          },
          { id: 'provider', label: 'Ask provider first', next: 'discuss_prompt', clientEscape: true }
        ]
      },
      repair: {
        speaker: 'alien',
        line: 'That sentence softens the cabin air. Repair is not winning — it is reconnecting. Ready to land?',
        options: [
          { id: 'land', label: 'Yes — wrap up.', next: 'closing' },
          { id: 'discuss', label: 'Pause for discussion', next: 'discuss_prompt', clientEscape: true }
        ]
      },
      discuss_prompt: {
        speaker: 'system',
        line: 'Discussion pause.',
        discussionPrompt: 'What needs showed up, and what repair step felt usable?',
        options: [
          { id: 'continue', label: 'Continue', next: 'closing' },
          { id: 'end', label: 'Go to debrief', next: 'closing' }
        ]
      },
      closing: {
        speaker: 'alien',
        line: 'Disagreement can end without shame. Thank you for practicing repair.',
        end: true,
        options: [{ id: 'debrief', label: 'Continue to debrief', next: 'debrief' }]
      },
      debrief: {
        speaker: 'system',
        end: true,
        debrief: true,
        line: 'Mission complete.',
        options: []
      }
    }
  },

  'unknown-emotion': {
    start: 'describe',
    nodes: {
      describe: {
        speaker: 'alien',
        line: 'My chest buzzes like a hive, and my thoughts bounce. I do not know the Earth name for this. Can you help me explore it — without needing a perfect label?',
        options: [
          { id: 'curious', label: 'It might be excitement or nerves.', next: 'explore' },
          { id: 'body', label: 'Let’s notice the body clues first.', next: 'body' },
          { id: 'clarify', label: 'Ask for clarification', next: 'clarify', clientEscape: true }
        ]
      },
      clarify: {
        speaker: 'alien',
        line: 'I am not asking you to diagnose me. I want words that feel close enough to talk about.',
        options: [
          { id: 'ok', label: 'Okay — close enough is fine.', next: 'explore' },
          { id: 'body', label: 'Start with body clues.', next: 'body' }
        ]
      },
      body: {
        speaker: 'alien',
        line: 'Buzzing chest, quick thoughts, restless hands. What Earth feeling often travels with those?',
        options: [
          { id: 'anxious', label: 'Anxiety or anticipation.', next: 'explore' },
          { id: 'excited', label: 'Excitement.', next: 'explore' },
          { id: 'skip', label: 'Skip this question', next: 'explore', clientEscape: true }
        ]
      },
      explore: {
        speaker: 'alien',
        line: 'Close-enough words help me choose a next step. What might help a traveler with buzzing energy?',
        options: [
          { id: 'move', label: 'Move a little, then settle.', next: 'closing' },
          { id: 'name', label: 'Name it and tell a friend.', next: 'closing' },
          { id: 'discuss', label: 'Pause for discussion', next: 'discuss_prompt', clientEscape: true },
          { id: 'provider', label: 'Ask provider first', next: 'discuss_prompt', clientEscape: true }
        ]
      },
      discuss_prompt: {
        speaker: 'system',
        line: 'Discussion pause.',
        discussionPrompt: 'How did you decide what to say when the feeling had no clear name?',
        options: [
          { id: 'continue', label: 'Continue', next: 'closing' },
          { id: 'end', label: 'Go to debrief', next: 'closing' }
        ]
      },
      closing: {
        speaker: 'alien',
        line: 'Thank you. A feeling does not need a perfect name to deserve care.',
        end: true,
        options: [{ id: 'debrief', label: 'Continue to debrief', next: 'debrief' }]
      },
      debrief: {
        speaker: 'system',
        end: true,
        debrief: true,
        line: 'Mission complete.',
        options: []
      }
    }
  }
};

export const DEBRIEF_PROMPTS = [
  'How did you decide what to say?',
  'What did the alien seem to need?',
  'Was there a moment that felt uncertain?',
  'What helped the conversation?',
  'How might this connect to a real conversation?',
  'Would you make the same choice again?'
];

export function getMission(missionId) {
  return MISSIONS.find((m) => m.id === missionId) || MISSIONS[0];
}

export function getScript(missionId) {
  return MISSION_SCRIPTS[missionId] || MISSION_SCRIPTS['first-contact'];
}

export function getNode(missionId, nodeId) {
  const script = getScript(missionId);
  const id = nodeId || script.start;
  return script.nodes[id] || script.nodes[script.start];
}
