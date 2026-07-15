/** Emotion options for Charades — authoritative deals are server-side. */

export const EMOTION_OPTIONS = [
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

export const EXPRESSION_MODES = [
  { id: 'face', label: 'Facial expression only' },
  { id: 'gesture', label: 'Gesture' },
  { id: 'situation', label: 'Describe a situation (no emotion name)' },
  { id: 'tone', label: 'Tone of voice' },
  { id: 'body', label: 'Body-language clues' }
];

export function emotionLabel(id) {
  return EMOTION_OPTIONS.find((e) => e.id === id)?.label || id;
}
