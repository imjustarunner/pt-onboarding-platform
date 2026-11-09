import { computed, shallowRef } from 'vue';
import { HOW_TO_VIDEOS } from '../config/howToVideos';

const audienceVideos = shallowRef([]);
let expiryTimer;

// AppWorkspace owns loading. Inline buttons and the player share the same audience
// result, so a hidden/expired video cannot be opened through another button.
export function setAudienceHowToVideos(videos = []) {
  clearTimeout(expiryTimer);
  audienceVideos.value = videos.filter(video => Date.parse(video.expiresAt) > Date.now());
  const nextExpiry = Math.min(...audienceVideos.value.map(video => Date.parse(video.expiresAt)));
  if (Number.isFinite(nextExpiry)) {
    expiryTimer = setTimeout(() => setAudienceHowToVideos(audienceVideos.value), Math.min(2_147_483_647, Math.max(1, nextExpiry - Date.now())));
  }
}

export function useHowToVideoCatalog() {
  return computed(() => [...HOW_TO_VIDEOS, ...audienceVideos.value]);
}
