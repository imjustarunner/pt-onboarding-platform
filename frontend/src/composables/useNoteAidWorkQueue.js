import { computed, toValue } from 'vue';
import { loadWorkQueue, saveWorkQueue } from '../utils/noteAidWorkQueue.js';

/** One in-memory view of the encrypted, user-owned server queue across Tasks and Note Workspace. */
export function useNoteAidWorkQueue(userId) {
  return computed({
    get: () => loadWorkQueue(toValue(userId)),
    set: (items) => saveWorkQueue(toValue(userId), items)
  });
}
