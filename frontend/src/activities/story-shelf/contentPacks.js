/** Guided short stories for StoryShelf — pragmatic pilot set. */

export const TOPICS = [
  { id: 'feelings', label: 'Feelings', blurb: 'Stories about noticing and naming emotions.' },
  { id: 'anxiety', label: 'Anxiety', blurb: 'Stories about worry, waiting, and finding steadiness.' },
  { id: 'friendship', label: 'Friendship', blurb: 'Stories about belonging and connection.' },
  { id: 'change', label: 'Change', blurb: 'Stories about transitions and new chapters.' },
  { id: 'hope', label: 'Hope', blurb: 'Stories about small lights in hard seasons.' },
  { id: 'grief', label: 'Grief', blurb: 'Stories about remembering and carrying love forward.' },
  { id: 'courage', label: 'Courage', blurb: 'Stories about trying even when it feels hard.' },
  { id: 'belonging', label: 'Belonging', blurb: 'Stories about finding place and people.' }
];

export const READING_MODES = [
  { id: 'client_aloud', label: 'Client reads aloud' },
  { id: 'provider_aloud', label: 'Provider reads aloud' },
  { id: 'alternate', label: 'Alternate paragraphs' },
  { id: 'together', label: 'Read together' },
  { id: 'silent', label: 'Silent shared reading' }
];

/** Short original pilot stories (not clinical scripts). */
export const STORIES = {
  grief: [
    {
      id: 'star-i-still-see',
      title: 'The Star I Still See',
      summary: 'A story about remembering someone with love.',
      readingTimeMinutes: 3,
      readingLevel: 'gentle',
      contentNote: 'Mentions missing someone who mattered. No graphic details.',
      pages: [
        'At night, Mira looked for the same bright star. It did not fix the missing, but it felt familiar — like a quiet hello.',
        'She told the star one memory. Not a perfect one. Just a real one. The sky did not answer, and somehow that was okay.',
        'In the morning she carried the memory with her, the way you carry a photo in a pocket: close, not heavy every second.'
      ]
    },
    {
      id: 'empty-chair',
      title: 'The Empty Chair',
      summary: 'A story about missing someone who mattered.',
      readingTimeMinutes: 3,
      readingLevel: 'gentle',
      contentNote: 'Mentions absence and missing someone. Client may decline.',
      pages: [
        'The chair by the window stayed empty. Some days Jordan walked past it. Some days they paused.',
        'Pausing did not mean they were stuck. It meant the love still had a place to land.',
        'One afternoon they set a small plant on the sill. Not to fill the chair — just to keep care nearby.'
      ]
    },
    {
      id: 'keeper-of-memories',
      title: 'The Keeper of Memories',
      summary: 'A story about holding on to what stays.',
      readingTimeMinutes: 3,
      readingLevel: 'gentle',
      contentNote: 'Themes of memory after loss.',
      pages: [
        'Sam kept a box of ticket stubs and notes. Not because the past was perfect — because it was theirs.',
        'Opening the box hurt a little and helped a little. Both could be true.',
        'They chose one note to read aloud, then closed the lid gently, ready for tomorrow.'
      ]
    },
    {
      id: 'seeds-in-the-dark',
      title: 'Seeds in the Dark',
      summary: 'A story about hope after loss.',
      readingTimeMinutes: 3,
      readingLevel: 'gentle',
      contentNote: 'Mentions loss and growing hope; not a fixed grief sequence.',
      pages: [
        'In winter soil, seeds wait. They do not rush. Waiting is part of growing.',
        'Lee planted a few seeds and watered them even on gray days.',
        'Nothing bloomed overnight. Still, Lee checked each morning — hope as a small habit.'
      ]
    },
    {
      id: 'hearts-that-stay',
      title: 'Hearts That Stay',
      summary: 'A story about love that remains meaningful.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: 'Themes of continuing bonds.',
      pages: [
        'Love did not leave when the goodbye came. It changed shape.',
        'It showed up in recipes, songs, and the way someone laughed the same way.',
        'That love did not need to be fixed. It needed room.'
      ]
    },
    {
      id: 'new-way-forward',
      title: 'A New Way Forward',
      summary: 'A story about carrying memory while continuing life.',
      readingTimeMinutes: 3,
      readingLevel: 'gentle',
      contentNote: 'Moving forward without erasing memory.',
      pages: [
        'Forward did not mean forgetting. It meant taking the next step with a full heart.',
        'Ava packed a bag for a trip and tucked a small keepsake inside.',
        'On the road she felt both ready and tender. Both belonged.'
      ]
    }
  ],
  feelings: [
    {
      id: 'weather-inside',
      title: 'The Weather Inside',
      summary: 'A story about noticing changing feelings.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: null,
      pages: [
        'Some days felt sunny. Some felt stormy. Riley learned to name the weather without blaming the sky.',
        'Naming helped. It did not erase the storm, but it made the next step clearer.',
        'Riley told a trusted person, “Today is cloudy,” and that was enough for a start.'
      ]
    },
    {
      id: 'two-feelings',
      title: 'Two Feelings at Once',
      summary: 'A story about mixed emotions.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: null,
      pages: [
        'Kai felt excited and nervous in the same moment. That used to seem like a mistake.',
        'Then Kai learned feelings can share a room.',
        'Both got a seat. Neither had to win.'
      ]
    },
    {
      id: 'quiet-signal',
      title: 'The Quiet Signal',
      summary: 'A story about body clues and feelings.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: null,
      pages: [
        'Before big feelings arrived in words, they arrived in shoulders and stomachs.',
        'Noa practiced listening early: tight jaw, warm face, restless feet.',
        'Early listening made choices gentler.'
      ]
    },
    {
      id: 'borrowed-calm',
      title: 'Borrowed Calm',
      summary: 'A story about borrowing steadiness from others.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: null,
      pages: [
        'When calm felt far away, Jordan sat near someone steady.',
        'Calm was not stolen. It was shared.',
        'Later, Jordan could offer the same quiet presence.'
      ]
    },
    {
      id: 'name-it',
      title: 'Name It Softly',
      summary: 'A story about using feeling words without pressure.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: null,
      pages: [
        'Words were tools, not tests. “Upset” was allowed. So was “not sure yet.”',
        'Soft naming left room to revise.',
        'Revision was part of honesty.'
      ]
    },
    {
      id: 'after-the-wave',
      title: 'After the Wave',
      summary: 'A story about feelings that rise and settle.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: null,
      pages: [
        'The wave felt huge. It still passed.',
        'Passing did not mean it never mattered.',
        'It meant there was shore again.'
      ]
    }
  ],
  anxiety: [
    {
      id: 'waiting-room',
      title: 'The Waiting Room',
      summary: 'A story about waiting and worry.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: 'Themes of anticipatory worry.',
      pages: [
        'Waiting stretched time. Sam counted tiles, then breaths.',
        'Breaths were shorter than tiles and kinder.',
        'The news would come. Until then, Sam practiced being here.'
      ]
    },
    {
      id: 'what-if-cloud',
      title: 'The What-If Cloud',
      summary: 'A story about racing what-ifs.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: null,
      pages: [
        'What-ifs gathered like clouds. Some were useful. Many were noise.',
        'Taylor wrote one what-if down and circled one next step.',
        'The cloud did not vanish. It moved a little.'
      ]
    },
    {
      id: 'small-anchor',
      title: 'A Small Anchor',
      summary: 'A story about grounding when thoughts race.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: null,
      pages: [
        'Feet on floor. Hands on chair. One sound in the room.',
        'Anchors did not solve everything. They made the boat steadier.',
        'Steady was enough for the next minute.'
      ]
    },
    {
      id: 'practice-run',
      title: 'The Practice Run',
      summary: 'A story about preparing without spiraling.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: null,
      pages: [
        'Preparing helped. Over-preparing tangled.',
        'Jamie chose three useful steps and stopped there.',
        'Stopping was a skill too.'
      ]
    },
    {
      id: 'borrowed-brave',
      title: 'Borrowed Brave',
      summary: 'A story about courage with support.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: null,
      pages: [
        'Brave did not always feel loud. Sometimes it was a text: “Can you stay on the phone?”',
        'Someone stayed. Brave borrowed a little light.',
        'Later, light was easier to find alone.'
      ]
    },
    {
      id: 'after-worry',
      title: 'After Worry',
      summary: 'A story about returning to the day.',
      readingTimeMinutes: 2,
      readingLevel: 'gentle',
      contentNote: null,
      pages: [
        'Worry took a seat. It did not get the whole room.',
        'Alex made tea, sent one message, and opened one notebook.',
        'Life continued beside the worry.'
      ]
    }
  ],
  friendship: makeGenericSet('friendship', 'Friendship'),
  change: makeGenericSet('change', 'Change'),
  hope: makeGenericSet('hope', 'Hope'),
  courage: makeGenericSet('courage', 'Courage'),
  belonging: makeGenericSet('belonging', 'Belonging')
};

function makeGenericSet(topicId, topicLabel) {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `${topicId}-${i + 1}`,
    title: `${topicLabel} Story ${i + 1}`,
    summary: `A short pilot story about ${topicLabel.toLowerCase()}.`,
    readingTimeMinutes: 2,
    readingLevel: 'gentle',
    contentNote: null,
    pages: [
      `Once there was a character learning about ${topicLabel.toLowerCase()}.`,
      'They noticed what felt hard and what felt possible.',
      'They took one small step, and that was enough for today.'
    ]
  }));
}

export function storiesForTopic(topicId) {
  return STORIES[topicId] || STORIES.feelings;
}

export function findStory(topicId, storyId) {
  return storiesForTopic(topicId).find((s) => s.id === storyId) || null;
}
