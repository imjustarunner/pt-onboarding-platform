/** Calming tools library for Calm Down Builder — no scoring. */

export const CALM_TOOLS = [
  {
    id: 'deep-breathing',
    label: 'Deep Breathing',
    guide: ['Breathe in slowly.', 'Pause if comfortable.', 'Breathe out slowly.', 'Repeat a few times.']
  },
  {
    id: 'safe-place',
    label: 'Imagine a Safe Place',
    guide: ['Picture a place that feels steady.', 'Notice one detail.', 'Stay with it for a moment.']
  },
  {
    id: 'calming-music',
    label: 'Calming Music',
    guide: ['Choose a short calming song or sound.', 'Listen without multitasking if you can.']
  },
  {
    id: 'self-talk',
    label: 'Positive Self-Talk',
    guide: ['Name one kind thing you could say to yourself.', 'Say it quietly or out loud.']
  },
  {
    id: 'five-things',
    label: 'Five Things I See',
    guide: ['Name five things you can see nearby.', 'No need to rush — the provider may join in.']
  },
  {
    id: 'gratitude',
    label: 'Gratitude Moment',
    guide: ['Name one small thing you appreciate right now.']
  },
  {
    id: 'stretching',
    label: 'Stretching',
    guide: ['Gently stretch shoulders or hands.', 'Notice what feels a little looser.']
  },
  {
    id: 'drink-water',
    label: 'Drink Water',
    guide: ['Take a few slow sips of water if you have some.']
  },
  {
    id: 'ask-support',
    label: 'Ask for Support',
    guide: ['Name one person you could reach out to later if needed.']
  },
  {
    id: 'short-break',
    label: 'Take a Short Break',
    guide: ['Pause the task for a short, timed break.', 'Decide when you will return.']
  }
];

export const PATH_SIZE_OPTIONS = [3, 4, 5];

export function toolById(id) {
  return CALM_TOOLS.find((t) => t.id === id) || null;
}
