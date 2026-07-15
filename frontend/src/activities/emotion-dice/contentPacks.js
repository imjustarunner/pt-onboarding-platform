/** Emotion packs mirrored for UI labels (authoritative rolls are server-side). */

export const PACKS = {
  'core-6': {
    id: 'core-6',
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
  'alt-6': {
    id: 'alt-6',
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

export function emotionLabel(packId, emotionId) {
  const pack = PACKS[packId] || PACKS['core-6'];
  return pack.emotions.find((e) => e.id === emotionId)?.label || emotionId;
}
