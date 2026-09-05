<template>
  <div v-if="open" class="focus-music-backdrop" @click.self="$emit('close')">
    <div class="focus-music-modal" role="dialog" aria-labelledby="focus-music-title" aria-modal="true">
      <header class="focus-music-header">
        <div class="focus-music-header-icon" aria-hidden="true">🎵</div>
        <div>
          <h2 id="focus-music-title">Focus Music</h2>
          <p>Create your perfect focus environment</p>
        </div>
        <button type="button" class="focus-music-close" aria-label="Close" @click="$emit('close')">×</button>
      </header>

      <div v-if="loading" class="focus-music-loading">Loading tracks…</div>
      <div v-else-if="loadError" class="focus-music-error">{{ loadError }}</div>
      <div v-else class="focus-music-body">
        <aside class="focus-music-sidebar">
          <div class="focus-music-sidebar-head">
            <h3>Your playlists</h3>
            <button type="button" class="focus-music-new-btn" title="New playlist" @click="$emit('create-playlist')">+</button>
          </div>
          <ul class="focus-music-playlist-list">
            <li
              v-for="pl in sidebarPlaylists"
              :key="pl.id"
              class="focus-music-playlist-item"
              :class="{ active: pl.id === activePlaylistId, 'is-system': pl.isSystem }"
            >
              <button type="button" class="focus-music-playlist-btn" @click="$emit('select-playlist', pl.id)">
                <strong>{{ pl.name }}</strong>
                <span>{{ playlistSidebarMeta(pl) }}</span>
              </button>
              <button
                v-if="canDeletePlaylist(pl)"
                type="button"
                class="focus-music-playlist-delete"
                title="Delete playlist"
                @click.stop="$emit('delete-playlist', pl.id)"
              >
                ×
              </button>
            </li>
          </ul>
          <button type="button" class="focus-music-create-full" @click="$emit('create-playlist')">
            + Create playlist
          </button>

          <div class="focus-music-sidebar-divider" />

          <div class="focus-music-sidebar-head">
            <h3>Platform playlists</h3>
            <button
              v-if="canManagePlatformPlaylists"
              type="button"
              class="focus-music-new-btn"
              title="New platform playlist"
              @click="$emit('create-platform-playlist')"
            >
              +
            </button>
          </div>
          <p class="focus-music-sidebar-hint">Curated for everyone. Expand to browse and add to yours.</p>
          <ul v-if="platformPlaylists.length" class="focus-music-platform-list">
            <li v-for="ppl in platformPlaylists" :key="`platform-${ppl.id}`" class="focus-music-platform-item">
              <button
                type="button"
                class="focus-music-platform-trigger"
                @click="$emit('toggle-platform-expand', ppl.id)"
              >
                <span class="focus-music-platform-caret" :class="{ open: isPlatformExpanded(ppl.id) }">▸</span>
                <span class="focus-music-platform-label">
                  <strong>{{ ppl.name }}</strong>
                  <span>{{ (ppl.tracks || []).length }} tracks</span>
                  <span v-if="ppl.description" class="focus-music-platform-desc">{{ ppl.description }}</span>
                </span>
              </button>
              <div v-if="isPlatformExpanded(ppl.id)" class="focus-music-platform-body">
                <div class="focus-music-platform-actions">
                  <button type="button" class="focus-music-add-btn" @click="$emit('copy-platform-playlist', ppl)">
                    Copy to my playlists
                  </button>
                  <button type="button" class="focus-music-add-btn subtle" @click="$emit('import-platform-playlist', ppl)">
                    Add to current
                  </button>
                  <button
                    v-if="canManagePlatformPlaylists"
                    type="button"
                    class="focus-music-add-btn"
                    @click="$emit('start-managing-platform', ppl.id)"
                  >
                    Edit
                  </button>
                  <button
                    v-if="canManagePlatformPlaylists"
                    type="button"
                    class="focus-music-playlist-delete"
                    title="Delete platform playlist"
                    @click="$emit('delete-platform-playlist', ppl.id)"
                  >
                    ×
                  </button>
                </div>
                <ul class="focus-music-platform-tracks">
                  <li v-for="track in ppl.tracks || []" :key="`ppl-${ppl.id}-${track.id}`">
                    <FocusMusicTrackArt :track="track" small />
                    <div class="focus-music-platform-track-copy">
                      <span class="focus-music-platform-track-title">{{ track.title }}</span>
                      <span v-if="trackSubtitle(track)" class="focus-music-platform-track-sub">{{ trackSubtitle(track) }}</span>
                    </div>
                    <button type="button" class="focus-music-add-btn small" @click="$emit('add-track', track.id)">+</button>
                  </li>
                </ul>
              </div>
            </li>
          </ul>
          <p v-else class="focus-music-sidebar-empty">No platform playlists yet.</p>
        </aside>

        <section class="focus-music-main">
          <div class="focus-music-main-head">
            <div class="focus-music-main-title">
              <input
                v-if="renaming"
                ref="renameInput"
                v-model="renameDraft"
                class="focus-music-rename-input"
                maxlength="80"
                @keydown.enter="commitRename"
                @keydown.escape="cancelRename"
                @blur="commitRename"
              />
              <template v-else>
                <h3>{{ activePlaylist?.name || 'Playlist' }}</h3>
                <button
                  v-if="canRenameActivePlaylist"
                  type="button"
                  class="focus-music-rename-btn"
                  title="Rename playlist"
                  @click="startRename"
                >
                  ✎
                </button>
              </template>
              <p>{{ activePlaylistMeta }}</p>
            </div>
            <button
              v-if="showLibraryToggle"
              type="button"
              class="focus-music-library-toggle"
              @click="$emit('toggle-library')"
            >
              {{ libraryToggleLabel }}
            </button>
          </div>

          <div v-if="managingPlatformId && canManagePlatformPlaylists" class="focus-music-managing-banner">
            Editing platform playlist: <strong>{{ managingPlatformPlaylist?.name }}</strong>
            <button type="button" @click="$emit('stop-managing-platform')">Done</button>
          </div>

          <div v-if="showLibrary && libraryTracksForPanel.length" class="focus-music-library">
            <h4>{{ libraryPanelTitle }}</h4>
            <div class="focus-music-tracklist compact">
              <div v-for="track in libraryTracksForPanel" :key="`lib-${track.id}`" class="focus-music-track">
                <FocusMusicTrackArt :track="track" />
                <div class="focus-music-track-meta">
                  <strong>{{ track.title }}</strong>
                  <span v-if="trackSubtitle(track)">{{ trackSubtitle(track) }}</span>
                </div>
                <span class="focus-music-track-dur">{{ formatDuration(track.durationSec) }}</span>
                <button
                  type="button"
                  class="focus-music-add-btn"
                  @click="onLibraryAdd(track.id)"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div v-if="!playlistTracks.length" class="focus-music-empty">
            <template v-if="isFullLibraryActive">
              No tracks in the catalog yet.
            </template>
            <template v-else-if="isMyFocusActive">
              No hearted tracks yet. Open <strong>Full Library</strong> and heart the tracks you want in today&apos;s loop.
            </template>
            <template v-else>
              No tracks in this playlist yet. Use <strong>Add tracks</strong> to build it, then heart the ones you want in today&apos;s loop.
            </template>
          </div>

          <div v-else class="focus-music-tracklist">
            <div
              v-for="(track, index) in playlistTracks"
              :key="track.id"
              class="focus-music-track"
              :class="{ active: track.id === currentTrackId, looped: isLooped(track.id) }"
            >
              <span class="focus-music-track-num">{{ index + 1 }}</span>
              <button type="button" class="focus-music-track-play" :title="`Play ${track.title}`" @click="$emit('play', track.id)">
                ▶
              </button>
              <FocusMusicTrackArt :track="track" />
              <div class="focus-music-track-meta">
                <strong>{{ track.title }}</strong>
                <span v-if="trackSubtitle(track)">{{ trackSubtitle(track) }}</span>
              </div>
              <span class="focus-music-track-dur">{{ formatDuration(track.durationSec) }}</span>
              <button
                type="button"
                class="focus-music-heart"
                :class="{ on: isLooped(track.id) }"
                :title="heartTitle(track.id)"
                @click="$emit('toggle-loop', track.id)"
              >
                {{ isLooped(track.id) ? '♥' : '♡' }}
              </button>
              <button
                v-if="showRemoveTrack"
                type="button"
                class="focus-music-remove-btn"
                :title="removeTrackTitle"
                @click="$emit('remove-track', track.id)"
              >
                −
              </button>
            </div>
          </div>
        </section>

        <aside class="focus-music-features">
          <div class="focus-music-loop-icon" aria-hidden="true">∞</div>
          <h3>Loop mode</h3>
          <p v-if="isFullLibraryActive">
            Playing from <strong>Full Library</strong> advances through every track. Heart songs to save them in <strong>My focus</strong>.
          </p>
          <p v-else-if="isMyFocusActive">
            Heart tracks in <strong>Full Library</strong> to build <strong>My focus</strong>, then start looping.
          </p>
          <p v-else>Heart tracks in your playlist for today&apos;s loop, then start.</p>
          <label class="focus-music-loop-option">
            <input type="radio" name="loopMode" value="playlist" :checked="loopMode === 'playlist'" @change="$emit('set-loop-mode', 'playlist')" />
            <span>Loop playlist</span>
            <small>Cycle through hearted tracks in this playlist.</small>
          </label>
          <label class="focus-music-loop-option">
            <input type="radio" name="loopMode" value="single" :checked="loopMode === 'single'" @change="$emit('set-loop-mode', 'single')" />
            <span>Loop one track</span>
            <small>Repeat the current song continuously.</small>
          </label>
          <label class="focus-music-loop-option focus-music-shuffle-option">
            <input
              type="checkbox"
              :checked="shuffleEnabled"
              @change="$emit('set-shuffle-enabled', $event.target.checked)"
            />
            <span>Shuffle order</span>
            <small>Randomize playback order for today&apos;s loop.</small>
          </label>
          <button
            type="button"
            class="focus-music-start"
            :disabled="isFullLibraryActive ? !playlistTracks.length : !loopCount"
            @click="$emit('start-looping')"
          >
            ▶ {{ isFullLibraryActive ? 'Play library' : 'Start looping' }}
          </button>
        </aside>
      </div>

      <footer v-if="currentTrack" class="focus-music-footer">
        <div class="focus-music-footer-track">
          <FocusMusicTrackArt :track="currentTrack" small />
          <div>
            <strong>{{ currentTrack.title }}</strong>
            <span v-if="trackSubtitle(currentTrack)">{{ trackSubtitle(currentTrack) }}</span>
          </div>
        </div>
        <div class="focus-music-footer-controls">
          <button type="button" :title="shuffleEnabled ? 'Shuffle on' : 'Shuffle off'" @click="$emit('toggle-shuffle')">
            🔀
          </button>
          <button type="button" title="Previous" @click="$emit('prev')">⏮</button>
          <button type="button" title="End music" @click="$emit('end')">■ End</button>
          <button type="button" class="focus-music-play-btn" :title="playing ? 'Pause' : 'Play'" @click="$emit('toggle-play')">
            {{ playing ? '⏸' : '▶' }}
          </button>
          <button type="button" title="Next" @click="$emit('next')">⏭</button>
        </div>
        <div class="focus-music-footer-progress">
          <span>{{ formatTime(currentTime) }}</span>
          <div class="focus-music-progress-bar"><span :style="{ width: `${progressPct}%` }" /></div>
          <span>{{ formatTime(duration || currentTrack.durationSec) }}</span>
        </div>
        <div class="focus-music-footer-volume">
          <span aria-hidden="true">🔊</span>
          <input type="range" min="0" max="1" step="0.05" :value="volume" @input="$emit('set-volume', $event.target.value)" />
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import FocusMusicTrackArt from './FocusMusicTrackArt.vue';
import { trackSubtitle } from '../../utils/focusMusicTrackDisplay.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  sidebarPlaylists: { type: Array, default: () => [] },
  fullLibraryPlaylistId: { type: String, default: '__full_library__' },
  myFocusPlaylistId: { type: String, default: 'my-focus' },
  isFullLibraryActive: { type: Boolean, default: false },
  isMyFocusActive: { type: Boolean, default: false },
  platformPlaylists: { type: Array, default: () => [] },
  canManagePlatformPlaylists: { type: Boolean, default: false },
  managingPlatformId: { type: [Number, String], default: null },
  managingPlatformPlaylist: { type: Object, default: null },
  isPlatformExpanded: { type: Function, default: () => false },
  activePlaylist: { type: Object, default: null },
  activePlaylistId: { type: String, default: '' },
  playlistTracks: { type: Array, default: () => [] },
  libraryTracks: { type: Array, default: () => [] },
  allTracks: { type: Array, default: () => [] },
  loopTrackIds: { type: Array, default: () => [] },
  showLibrary: { type: Boolean, default: false },
  shuffleEnabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  loadError: { type: String, default: '' },
  currentTrack: { type: Object, default: null },
  currentTrackId: { type: String, default: '' },
  playing: { type: Boolean, default: false },
  loopMode: { type: String, default: 'playlist' },
  currentTime: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
  progressPct: { type: Number, default: 0 },
  volume: { type: Number, default: 0.85 },
  formatTime: { type: Function, required: true }
});

const emit = defineEmits([
  'close',
  'play',
  'toggle-loop',
  'add-track',
  'add-platform-track',
  'remove-track',
  'select-playlist',
  'create-playlist',
  'rename-playlist',
  'delete-playlist',
  'toggle-library',
  'toggle-platform-expand',
  'import-platform-playlist',
  'copy-platform-playlist',
  'create-platform-playlist',
  'delete-platform-playlist',
  'start-managing-platform',
  'stop-managing-platform',
  'set-loop-mode',
  'set-shuffle-enabled',
  'toggle-shuffle',
  'start-looping',
  'toggle-play',
  'prev',
  'next',
  'set-volume',
  'end'
]);

const loopCount = computed(() => props.loopTrackIds.length);

const canRenameActivePlaylist = computed(() =>
  !props.isFullLibraryActive
  && props.activePlaylistId !== props.myFocusPlaylistId
  && String(props.activePlaylist?.name || '').toLowerCase() !== 'my focus'
);

const showLibraryToggle = computed(() =>
  Boolean(props.managingPlatformId && props.canManagePlatformPlaylists)
  || (!props.isFullLibraryActive && !props.isMyFocusActive)
);

const showRemoveTrack = computed(() =>
  !props.isFullLibraryActive
);

const removeTrackTitle = computed(() =>
  props.isMyFocusActive ? 'Remove from My focus' : 'Remove from playlist'
);

const activePlaylistMeta = computed(() => {
  if (props.isFullLibraryActive) {
    return `${props.playlistTracks.length} tracks · heart to add to My focus · ${loopCount.value} hearted`;
  }
  if (props.isMyFocusActive) {
    return `${props.playlistTracks.length} hearted for today · ${props.loopMode === 'single' ? 'loop one' : 'loop playlist'}`;
  }
  return `${loopCount.value} in today's loop · ${props.playlistTracks.length} in playlist · ${props.loopMode === 'single' ? 'loop one' : 'loop playlist'}`;
});

function playlistSidebarMeta(pl) {
  if (pl.id === props.fullLibraryPlaylistId) {
    return `${pl.memberTrackIds.length} tracks`;
  }
  if (pl.id === props.myFocusPlaylistId || String(pl.name || '').toLowerCase() === 'my focus') {
    return `${pl.loopTrackIds.length} hearted`;
  }
  return `${pl.memberTrackIds.length} tracks · ${pl.loopTrackIds.length} in loop`;
}

function canDeletePlaylist(pl) {
  if (pl.isSystem || pl.id === props.fullLibraryPlaylistId) return false;
  if (pl.id === props.myFocusPlaylistId || String(pl.name || '').toLowerCase() === 'my focus') return false;
  return true;
}

function heartTitle(trackId) {
  if (props.isFullLibraryActive || props.isMyFocusActive) {
    return isLooped(trackId) ? 'Remove from My focus' : 'Add to My focus';
  }
  return isLooped(trackId) ? "Remove from today's loop" : "Add to today's loop";
}

const libraryTracksForPanel = computed(() => {
  if (props.managingPlatformId && props.managingPlatformPlaylist) {
    const inPlatform = new Set(props.managingPlatformPlaylist.trackIds || []);
    return (props.allTracks || []).filter((t) => !inPlatform.has(t.id));
  }
  return props.libraryTracks;
});

const libraryPanelTitle = computed(() => {
  if (props.managingPlatformId && props.managingPlatformPlaylist) {
    return `Library — add to platform “${props.managingPlatformPlaylist.name}”`;
  }
  return `Library — add to “${props.activePlaylist?.name || 'playlist'}”`;
});

const libraryToggleLabel = computed(() => {
  if (!props.showLibrary) {
    if (props.managingPlatformId) return 'Add platform tracks';
    return 'Add tracks';
  }
  return 'Hide library';
});

function onLibraryAdd(trackId) {
  if (props.managingPlatformId) {
    emit('add-platform-track', { platformId: props.managingPlatformId, trackId });
  } else {
    emit('add-track', trackId);
  }
}

const renaming = ref(false);
const renameDraft = ref('');
const renameInput = ref(null);

watch(() => props.activePlaylistId, () => {
  renaming.value = false;
});

function isLooped(id) {
  return props.loopTrackIds.includes(id);
}

function formatDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function startRename() {
  renameDraft.value = props.activePlaylist?.name || '';
  renaming.value = true;
  nextTick(() => renameInput.value?.focus());
}

function commitRename() {
  if (!renaming.value) return;
  const name = renameDraft.value.trim();
  if (name && props.activePlaylistId) {
    emit('rename-playlist', { id: props.activePlaylistId, name });
  }
  renaming.value = false;
}

function cancelRename() {
  renaming.value = false;
}
</script>

<style scoped>
.focus-music-backdrop {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.focus-music-modal {
  width: min(1100px, 100%);
  max-height: min(90vh, 820px);
  background: #121417;
  color: #f3f4f6;
  border-radius: 16px;
  border: 1px solid #2a2f36;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.focus-music-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid #2a2f36;
}

.focus-music-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.focus-music-header p {
  margin: 2px 0 0;
  color: #9ca3af;
  font-size: 0.9rem;
}

.focus-music-header-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #166534;
  display: grid;
  place-items: center;
  font-size: 1.1rem;
}

.focus-music-close {
  margin-left: auto;
  background: transparent;
  border: none;
  color: #9ca3af;
  font-size: 1.6rem;
  cursor: pointer;
}

.focus-music-body {
  display: grid;
  grid-template-columns: 220px 1fr 220px;
  gap: 0;
  min-height: 360px;
  flex: 1;
  overflow: hidden;
}

.focus-music-sidebar,
.focus-music-features {
  padding: 16px;
  background: #0f1114;
  border-right: 1px solid #2a2f36;
  overflow-y: auto;
}

.focus-music-features {
  border-right: none;
  border-left: 1px solid #2a2f36;
}

.focus-music-sidebar-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.focus-music-sidebar-head h3,
.focus-music-main-head h3,
.focus-music-features h3 {
  margin: 0;
  color: #f9fafb;
  font-size: 1rem;
}

.focus-music-new-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid #374151;
  background: #1f2937;
  color: #e5e7eb;
  cursor: pointer;
}

.focus-music-playlist-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.focus-music-playlist-item {
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.focus-music-playlist-item.active .focus-music-playlist-btn {
  border-color: #22c55e;
  background: rgba(22, 101, 52, 0.2);
}

.focus-music-playlist-item.is-system .focus-music-playlist-btn strong {
  color: #d1fae5;
}

.focus-music-playlist-btn {
  flex: 1;
  text-align: left;
  border: 1px solid #2a2f36;
  border-radius: 10px;
  background: #171a1f;
  color: inherit;
  padding: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.focus-music-playlist-btn strong {
  font-size: 0.9rem;
}

.focus-music-playlist-btn span {
  color: #9ca3af;
  font-size: 0.75rem;
}

.focus-music-playlist-delete {
  width: 28px;
  border: 1px solid #2a2f36;
  border-radius: 8px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
}

.focus-music-create-full {
  margin-top: 12px;
  width: 100%;
  border: 1px dashed #374151;
  border-radius: 10px;
  background: transparent;
  color: #9ca3af;
  padding: 10px;
  cursor: pointer;
}

.focus-music-sidebar-divider {
  height: 1px;
  background: #2a2f36;
  margin: 14px 0;
}

.focus-music-sidebar-hint,
.focus-music-sidebar-empty {
  margin: 8px 0 0;
  color: #6b7280;
  font-size: 0.78rem;
  line-height: 1.4;
}

.focus-music-platform-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.focus-music-platform-trigger {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  border: 1px solid #2a2f36;
  border-radius: 10px;
  background: #171a1f;
  color: inherit;
  padding: 8px;
  cursor: pointer;
  text-align: left;
}

.focus-music-platform-caret {
  color: #9ca3af;
  transition: transform 0.15s ease;
  flex-shrink: 0;
}

.focus-music-platform-caret.open {
  transform: rotate(90deg);
}

.focus-music-platform-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.focus-music-platform-label strong {
  font-size: 0.88rem;
}

.focus-music-platform-label span {
  color: #9ca3af;
  font-size: 0.72rem;
}

.focus-music-platform-desc {
  line-height: 1.35;
  margin-top: 2px;
}

.focus-music-platform-body {
  margin-top: 6px;
  padding: 0 4px 8px 18px;
}

.focus-music-platform-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.focus-music-platform-tracks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}

.focus-music-platform-tracks li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.8rem;
  color: #d1d5db;
}

.focus-music-platform-track-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.focus-music-platform-track-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.focus-music-platform-track-sub {
  color: #9ca3af;
  font-size: 0.72rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.focus-music-footer-track {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.focus-music-add-btn.small {
  padding: 2px 8px;
  font-size: 0.75rem;
}

.focus-music-managing-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(22, 101, 52, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.35);
  font-size: 0.85rem;
}

.focus-music-managing-banner button {
  border: none;
  border-radius: 999px;
  background: #1f2937;
  color: #e5e7eb;
  padding: 6px 12px;
  cursor: pointer;
}

.focus-music-shuffle-option {
  margin-top: 4px;
}

.focus-music-main {
  padding: 16px;
  overflow: auto;
}

.focus-music-main-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.focus-music-main-title p {
  margin: 4px 0 0;
  color: #9ca3af;
  font-size: 0.85rem;
}

.focus-music-rename-btn {
  margin-left: 6px;
  background: transparent;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 0.85rem;
}

.focus-music-rename-input {
  width: min(240px, 100%);
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 8px;
  color: #f9fafb;
  padding: 6px 10px;
  font-size: 1rem;
}

.focus-music-library-toggle {
  flex-shrink: 0;
  border: 1px solid #374151;
  border-radius: 999px;
  background: #1f2937;
  color: #e5e7eb;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 0.85rem;
}

.focus-music-library {
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid #2a2f36;
  border-radius: 12px;
  background: #0f1114;
}

.focus-music-library h4 {
  margin: 0 0 8px;
  font-size: 0.85rem;
  color: #9ca3af;
}

.focus-music-empty {
  padding: 24px 12px;
  color: #9ca3af;
  font-size: 0.9rem;
  line-height: 1.5;
  text-align: center;
}

.focus-music-tracklist {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.focus-music-tracklist.compact .focus-music-track {
  grid-template-columns: 40px 1fr auto auto;
}

.focus-music-track {
  display: grid;
  grid-template-columns: 28px 32px 40px 1fr auto 32px 28px;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 10px;
}

.focus-music-track:hover,
.focus-music-track.active {
  background: rgba(22, 101, 52, 0.18);
}

.focus-music-track.looped {
  border: 1px solid rgba(34, 197, 94, 0.25);
}

.focus-music-track-num {
  color: #6b7280;
  font-size: 0.85rem;
}

.focus-music-track-play {
  background: transparent;
  border: none;
  color: #d1d5db;
  cursor: pointer;
  opacity: 0;
}

.focus-music-track:hover .focus-music-track-play {
  opacity: 1;
}

.focus-music-track-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.focus-music-track-meta strong {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.focus-music-track-meta span {
  color: #9ca3af;
  font-size: 0.82rem;
}

.focus-music-track-dur {
  color: #9ca3af;
  font-size: 0.82rem;
}

.focus-music-heart {
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  font-size: 1rem;
}

.focus-music-heart.on {
  color: #22c55e;
}

.focus-music-remove-btn,
.focus-music-add-btn {
  border: 1px solid #374151;
  border-radius: 8px;
  background: #1f2937;
  color: #e5e7eb;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 4px 8px;
}

.focus-music-add-btn.subtle {
  background: transparent;
  color: #9ca3af;
  border-color: #4b5563;
}

.focus-music-loop-icon {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  border: 2px solid #374151;
  display: grid;
  place-items: center;
  font-size: 1.4rem;
  margin-bottom: 10px;
}

.focus-music-features p {
  color: #9ca3af;
  font-size: 0.85rem;
  margin: 0 0 12px;
}

.focus-music-loop-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid #2a2f36;
  cursor: pointer;
}

.focus-music-loop-option small {
  color: #6b7280;
}

.focus-music-start {
  margin-top: 12px;
  width: 100%;
  border: none;
  border-radius: 999px;
  background: #16a34a;
  color: white;
  font-weight: 600;
  padding: 12px 14px;
  cursor: pointer;
}

.focus-music-start:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.focus-music-footer {
  display: grid;
  grid-template-columns: 1.2fr auto 1.5fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid #2a2f36;
  background: #0b0d10;
}

.focus-music-footer-track {
  min-width: 0;
}

.focus-music-footer-track strong,
.focus-music-footer-track span {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.focus-music-footer-track span {
  color: #9ca3af;
  font-size: 0.82rem;
}

.focus-music-footer-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.focus-music-footer-controls button {
  background: transparent;
  border: none;
  color: #e5e7eb;
  cursor: pointer;
}

.focus-music-play-btn {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: #16a34a !important;
}

.focus-music-footer-progress {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: 0.78rem;
  color: #9ca3af;
}

.focus-music-progress-bar {
  height: 4px;
  background: #374151;
  border-radius: 999px;
  overflow: hidden;
}

.focus-music-progress-bar span {
  display: block;
  height: 100%;
  background: #22c55e;
}

.focus-music-footer-volume {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 120px;
}

.focus-music-footer-volume input {
  width: 100%;
}

.focus-music-loading,
.focus-music-error {
  padding: 40px 20px;
  text-align: center;
  color: #9ca3af;
}

.focus-music-error {
  color: #fca5a5;
}

@media (max-width: 900px) {
  .focus-music-body {
    grid-template-columns: 1fr;
  }
  .focus-music-sidebar,
  .focus-music-features {
    border: none;
    border-bottom: 1px solid #2a2f36;
  }
  .focus-music-footer {
    grid-template-columns: 1fr;
  }
}
</style>
