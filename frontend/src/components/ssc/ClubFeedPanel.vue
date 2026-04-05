<template>
  <div class="feed-panel" :class="{ 'feed-panel--embedded': variant === 'public' }">
    <div v-if="variant !== 'public'" class="feed-panel-header">
      <div class="feed-header-left">
        <h3 class="feed-title">Club feed</h3>
        <p v-if="feedSeasonViewId && feedSeasonName" class="feed-scope-hint">
          {{ feedSeasonName }}
        </p>
      </div>
      <div class="feed-header-actions">
        <button
          v-if="!usePublicFeedEndpoint && clubId && !feedSeasonViewId"
          type="button"
          class="feed-toggle"
          :class="{ 'feed-toggle--on': includeSeasonFeed }"
          title="Show workouts and season chat in this list"
          @click="includeSeasonFeed = !includeSeasonFeed"
        >
          <span class="feed-toggle-track" aria-hidden="true"><span class="feed-toggle-knob" /></span>
          <span class="feed-toggle-label">Event feed</span>
        </button>
        <button
          v-if="!usePublicFeedEndpoint && clubId"
          type="button"
          class="feed-post-season"
          :disabled="!seasonOptions.length"
          :title="!seasonOptions.length ? 'No active season' : 'Open season feed'"
          @click="onPostToSeasonClick"
        >
          Post to season
        </button>
        <button v-if="feedSeasonViewId" type="button" class="feed-back-club" @click="leaveSeasonFeedView">
          Club feed
        </button>
        <button v-if="clubId" class="feed-refresh-btn" @click="load" :disabled="loading" title="Refresh">↻</button>
      </div>
    </div>
    <div v-else-if="clubId" class="feed-refresh-row">
      <button class="feed-refresh-btn" @click="load" :disabled="loading" title="Refresh feed">↻ Refresh</button>
    </div>

    <!-- Season picker (multiple seasons) -->
    <div v-if="seasonPickOpen" class="feed-modal-backdrop" @click.self="seasonPickOpen = false">
      <div class="feed-modal" role="dialog" aria-labelledby="season-pick-title">
        <h4 id="season-pick-title" class="feed-modal-title">Choose a season</h4>
        <ul class="feed-modal-list">
          <li v-for="s in seasonOptions" :key="s.id">
            <button type="button" class="feed-modal-row" @click="openSeasonFeed(s.id, s.name)">
              {{ s.name }}
            </button>
          </li>
        </ul>
        <button type="button" class="feed-modal-cancel" @click="seasonPickOpen = false">Cancel</button>
      </div>
    </div>

    <!-- Club → season reminder -->
    <div v-if="seasonWarnOpen" class="feed-modal-backdrop" @click.self="closeSeasonWarn(false)">
      <div class="feed-modal feed-modal--wide" role="dialog" aria-labelledby="season-warn-title">
        <h4 id="season-warn-title" class="feed-modal-title">Post to the whole club?</h4>
        <p class="feed-modal-body">
          Did you mean to post to your season? This message goes to everyone in the club, not only your season group.
        </p>
        <div class="feed-modal-actions feed-modal-actions--stack">
          <button type="button" class="feed-modal-primary" @click="confirmClubPostIgnoreWarn">
            Ignore — post to club
          </button>
          <button type="button" class="feed-modal-secondary" @click="setSeasonWarnRemind">
            Remind me each post
          </button>
          <button type="button" class="feed-modal-ghost" @click="setSeasonWarnDismiss">
            Don’t ask again
          </button>
        </div>
      </div>
    </div>

    <!-- Symbol picker -->
    <div v-if="symbolPickOpen" class="feed-modal-backdrop" @click.self="symbolPickOpen = false">
      <div class="feed-modal feed-modal--wide" role="dialog">
        <h4 class="feed-modal-title">Symbols</h4>
        <div class="feed-symbol-grid">
          <button
            v-for="(ch, i) in symbolChars"
            :key="i"
            type="button"
            class="feed-symbol-cell"
            @click="insertSymbol(ch)"
          >
            {{ ch }}
          </button>
        </div>
        <button type="button" class="feed-modal-cancel" @click="symbolPickOpen = false">Close</button>
      </div>
    </div>

    <!-- Club icon picker -->
    <div v-if="iconPickOpen" class="feed-modal-backdrop" @click.self="iconPickOpen = false">
      <div class="feed-modal feed-modal--wide feed-modal--tall" role="dialog">
        <h4 class="feed-modal-title">Club icons</h4>
        <div v-if="iconsLoading" class="feed-icons-loading">Loading…</div>
        <div v-else class="feed-icon-grid">
          <button
            v-for="ic in clubIconsList"
            :key="ic.id"
            type="button"
            class="feed-icon-cell"
            :title="ic.name"
            @click="insertClubIcon(ic)"
          >
            <img :src="ic.url" :alt="ic.name || ''" loading="lazy" />
          </button>
        </div>
        <p v-if="!iconsLoading && !clubIconsList.length" class="feed-icons-empty">No icons uploaded for this club yet.</p>
        <button type="button" class="feed-modal-cancel" @click="iconPickOpen = false">Close</button>
      </div>
    </div>

    <form
      v-if="showComposer && feedSeasonViewId"
      class="feed-compose"
      @submit.prevent="postSeasonMessage"
    >
      <div class="feed-compose-label">Season group chat</div>
      <div class="feed-toolbar-wrap">
        <textarea
          ref="seasonTextareaRef"
          v-model="draft"
          rows="3"
          maxlength="2000"
          placeholder="Share with your season…"
          class="feed-compose-input"
        />
        <div class="feed-toolbar">
          <button type="button" class="feed-tool-btn" title="Emoji" @click="toggleEmoji('season')">😀</button>
          <button type="button" class="feed-tool-btn" title="Symbols" @click="symbolPickOpen = true; symbolTarget = 'season'">Ω</button>
          <span class="feed-toolbar-note">Images: use club-wide post</span>
        </div>
        <div v-show="emojiTarget === 'season' && showEmojiPicker" class="feed-emoji-pop">
          <emoji-picker @emoji-click="onEmojiPick" />
        </div>
      </div>
      <button type="submit" class="feed-compose-submit" :disabled="posting || !draft.trim()">
        {{ posting ? 'Posting…' : 'Send to season' }}
      </button>
    </form>

    <form
      v-if="showComposer && allowClubWidePosts && !feedSeasonViewId"
      class="feed-compose feed-compose--club"
      @submit.prevent="onSubmitClubWide"
    >
      <div class="feed-compose-label">Club-wide message</div>
      <div class="feed-toolbar-wrap">
        <textarea
          ref="clubTextareaRef"
          v-model="clubDraft"
          rows="4"
          maxlength="4000"
          placeholder="Post to everyone in this club…"
          class="feed-compose-input"
        />
        <div class="feed-toolbar">
          <button type="button" class="feed-tool-btn" title="Emoji" @click="toggleEmoji('club')">😀</button>
          <button type="button" class="feed-tool-btn" title="Symbols" @click="symbolPickOpen = true; symbolTarget = 'club'">Ω</button>
          <button
            type="button"
            class="feed-tool-btn"
            title="Club icons"
            :disabled="usePublicFeedEndpoint"
            @click="openIconPicker"
          >
            🖼
          </button>
          <label class="feed-tool-btn feed-tool-btn--file" title="Photo or screenshot">
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
              :disabled="usePublicFeedEndpoint || clubAttachments.length >= 8"
              @change="onAttachmentFile"
            />
            📎
          </label>
        </div>
        <div v-show="emojiTarget === 'club' && showEmojiPicker" class="feed-emoji-pop">
          <emoji-picker @emoji-click="onEmojiPick" />
        </div>
      </div>
      <div v-if="clubAttachments.length" class="feed-attach-preview">
        <div v-for="(a, i) in clubAttachments" :key="a.path" class="feed-attach-chip">
          <img :src="a.url" alt="" />
          <button type="button" class="feed-attach-remove" @click="removeAttachment(i)" title="Remove">×</button>
        </div>
      </div>
      <label v-if="publicFeedEnabled" class="feed-pub-toggle">
        <input v-model="clubVisibilityPublic" type="checkbox" />
        <span>Show on public club page</span>
      </label>
      <div class="feed-compose-actions">
        <button type="submit" class="feed-compose-submit" :disabled="posting || (!clubDraft.trim() && !clubAttachments.length)">
          {{ posting ? 'Posting…' : 'Post to club' }}
        </button>
      </div>
    </form>
    <p v-else-if="showComposer && !feedSeasonViewId && !allowClubWidePosts" class="feed-compose-hint">
      Join an active season to post season chat, or ask your manager to enable club-wide posting.
    </p>

    <div v-if="loading && !items.length" class="feed-loading">
      <div class="feed-spinner"></div>
    </div>

    <div v-else-if="!clubId" class="feed-empty">Join a club to see the feed.</div>

    <div v-else-if="!items.length && !loading" class="feed-empty">
      No activity yet. Log a workout, post a message, or turn on <strong>Event feed</strong> to see season activity here.
    </div>

    <div v-else class="feed-list">
      <div
        v-for="item in items"
        :key="item.id"
        class="feed-item"
        :class="{
          'feed-item--announcement': item.type === 'announcement',
          'feed-item--member-msg': item.type === 'member_message',
          'feed-item--workout': item.type === 'workout',
          'feed-item--club': item.source === 'club'
        }"
      >
        <!-- Club-wide (manager) -->
        <template v-if="item.type === 'announcement' && item.source === 'club'">
          <div class="feed-ann-badge feed-ann-badge--club">
            📣 Club-wide
            <span v-if="item.visibility === 'public'" class="feed-public-pill">Public</span>
          </div>
          <div v-if="hasRichHtml(item.text)" class="feed-ann-text feed-ann-text--rich" v-html="richHtml(item.text)" />
          <p v-else class="feed-ann-text">{{ item.text }}</p>
          <div v-if="item.attachments?.length" class="feed-attach-row">
            <a v-for="(a, i) in item.attachments" :key="i" :href="a.url" target="_blank" rel="noopener noreferrer">
              <img :src="a.url" alt="" class="feed-attach-img" loading="lazy" />
            </a>
          </div>
          <div class="feed-meta">
            <span class="feed-who">{{ item.name }}</span>
            <span class="feed-dot">·</span>
            <span class="feed-when">{{ timeAgo(item.timestamp) }}</span>
          </div>
        </template>

        <!-- Club-wide member -->
        <template v-else-if="item.type === 'member_message' && item.source === 'club'">
          <div class="feed-ann-badge feed-ann-badge--club-member">
            💬 Club post
            <span v-if="item.visibility === 'public'" class="feed-public-pill">Public</span>
          </div>
          <div v-if="hasRichHtml(item.text)" class="feed-ann-text feed-ann-text--rich" v-html="richHtml(item.text)" />
          <p v-else class="feed-ann-text feed-ann-text--member">{{ item.text }}</p>
          <div v-if="item.attachments?.length" class="feed-attach-row">
            <a v-for="(a, i) in item.attachments" :key="i" :href="a.url" target="_blank" rel="noopener noreferrer">
              <img :src="a.url" alt="" class="feed-attach-img" loading="lazy" />
            </a>
          </div>
          <div class="feed-meta feed-meta--flush">
            <span class="feed-who">{{ item.name }}</span>
            <span class="feed-dot">·</span>
            <span class="feed-when">{{ timeAgo(item.timestamp) }}</span>
          </div>
        </template>

        <!-- Season / manager announcement (not club source) -->
        <template v-else-if="item.type === 'announcement'">
          <div class="feed-ann-badge">
            📣 Club Post
            <span v-if="item.visibility === 'public'" class="feed-public-pill">Public</span>
          </div>
          <p class="feed-ann-text">{{ item.text }}</p>
          <div class="feed-meta">
            <span class="feed-who">{{ item.name }}</span>
            <span class="feed-dot">·</span>
            <span class="feed-when">{{ timeAgo(item.timestamp) }}</span>
          </div>
        </template>

        <!-- Member season chat -->
        <template v-else-if="item.type === 'member_message'">
          <div class="feed-ann-badge feed-ann-badge--member">
            💬 Group message
            <span v-if="item.visibility === 'public'" class="feed-public-pill">Public</span>
          </div>
          <p class="feed-ann-text feed-ann-text--member">{{ item.text }}</p>
          <div class="feed-meta feed-meta--flush">
            <span class="feed-who">{{ item.name }}</span>
            <span v-if="item.seasonName" class="feed-season-tag">{{ item.seasonName }}</span>
            <span class="feed-dot">·</span>
            <span class="feed-when">{{ timeAgo(item.timestamp) }}</span>
          </div>
        </template>

        <!-- Workout Activity -->
        <template v-else-if="item.type === 'workout'">
          <div class="feed-workout-top">
            <span class="feed-avatar">{{ initials(item.name) }}</span>
            <div class="feed-workout-info">
              <span class="feed-who">{{ item.name }}</span>
              <span class="feed-activity-type">{{ formatActivity(item.activityType) }}</span>
            </div>
            <span v-if="item.isRace" class="feed-race-badge">🏅 Race</span>
          </div>
          <div class="feed-workout-stats">
            <span v-if="item.distanceMiles != null" class="feed-stat">
              {{ item.distanceMiles.toFixed(2) }} mi
            </span>
            <span v-if="item.durationMinutes" class="feed-stat">{{ item.durationMinutes }} min</span>
            <span v-if="item.points" class="feed-stat feed-pts">+{{ item.points }} pts</span>
          </div>
          <div v-if="item.notes" class="feed-notes">{{ item.notes }}</div>
          <div class="feed-meta">
            <span v-if="item.seasonName" class="feed-season-tag">{{ item.seasonName }}</span>
            <span class="feed-dot">·</span>
            <span class="feed-when">{{ timeAgo(item.timestamp) }}</span>
          </div>
        </template>
      </div>

      <button v-if="canLoadMore" class="feed-load-more" @click="loadMore" :disabled="loading">
        {{ loading ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue';
import DOMPurify from 'dompurify';
import 'emoji-picker-element';
import api from '../../services/api';

const props = defineProps({
  clubId: { type: [Number, String], default: null },
  variant: { type: String, default: 'default' },
  postSeasonId: { type: [Number, String], default: null },
  showComposer: { type: Boolean, default: false },
  allowClubWidePosts: { type: Boolean, default: false },
  publicFeedEnabled: { type: Boolean, default: false },
  usePublicFeedEndpoint: { type: Boolean, default: false }
});

const items = ref([]);
const loading = ref(false);
const limit = 40;
const canLoadMore = ref(false);
const draft = ref('');
const clubDraft = ref('');
const clubVisibilityPublic = ref(false);
const posting = ref(false);
let pollInterval = null;

const includeSeasonFeed = ref(false);
const feedSeasonViewId = ref(null);
const feedSeasonName = ref('');
const seasonOptions = ref([]);
const seasonPickOpen = ref(false);
const seasonWarnOpen = ref(false);
const clubAttachments = ref([]);
const showEmojiPicker = ref(false);
const emojiTarget = ref('club');
const symbolPickOpen = ref(false);
const symbolTarget = ref('club');
const iconPickOpen = ref(false);
const clubIconsList = ref([]);
const iconsLoading = ref(false);
const clubTextareaRef = ref(null);
const seasonTextareaRef = ref(null);

const SYMBOL_BLOCKS = [
  '←↑→↓↔↕⇐⇑⇒⇓⇔⇕⤴⤵⤶⤷',
  '★☆✡✦✧✩✪✫✬✭✮✯✰',
  '♩♪♫♬𝄞𝄢',
  '☀☁☂☃☄⚡❄🔥💧',
  '☎✉✎✂✄⌛⏳⌚⏰',
  '☐☑☒✓✔✕✖✗✘',
  '♠♣♥♦♤♧♡♢',
  '⚽🏀🏈⚾🎾🏐🏉🎱',
  '∀∂∃∅∇∈∉∋∏∑√∝∞∠∡∫∬',
  '¼½¾⅓⅔⅛⅜⅝⅞',
  '‰‱‴′″‶‷',
  '«»‹›„“”‚‘’',
  '§¶†‡•‣⁃⁋⁌⁍⁎⁏',
  '⚠⛔✅❌❓❗💬🔔🔕'
];

const symbolChars = computed(() => SYMBOL_BLOCKS.join('').split(''));

const activeSeasonPostId = computed(() =>
  (feedSeasonViewId.value ? Number(feedSeasonViewId.value) : null)
);

const feedRequestOpts = () => (props.usePublicFeedEndpoint ? { skipAuthRedirect: true } : {});

const feedPath = () => (props.usePublicFeedEndpoint
  ? `/summit-stats/clubs/${props.clubId}/feed/public`
  : `/summit-stats/clubs/${props.clubId}/feed`);

const seasonWarnStorageKey = () => (props.clubId ? `sscClubFeedSeasonWarn:${props.clubId}` : null);

const getSeasonWarnPref = () => {
  const k = seasonWarnStorageKey();
  if (!k) return null;
  return localStorage.getItem(k);
};

const setSeasonWarnRemind = () => {
  const k = seasonWarnStorageKey();
  if (k) localStorage.setItem(k, 'remind');
  closeSeasonWarn(true);
};

const setSeasonWarnDismiss = () => {
  const k = seasonWarnStorageKey();
  if (k) localStorage.setItem(k, 'dismiss');
  closeSeasonWarn(true);
};

const closeSeasonWarn = (shouldPost) => {
  seasonWarnOpen.value = false;
  if (shouldPost) submitClubPost();
};

const confirmClubPostIgnoreWarn = () => {
  closeSeasonWarn(true);
};

const submitClubPost = async () => {
  const text = String(clubDraft.value || '').trim();
  if (!text && !clubAttachments.value.length) return;
  if (posting.value) return;
  posting.value = true;
  try {
    await api.post(`/summit-stats/clubs/${props.clubId}/feed/posts`, {
      messageText: text,
      visibility: props.publicFeedEnabled && clubVisibilityPublic.value ? 'public' : 'club',
      attachmentPaths: clubAttachments.value.map((a) => a.path)
    });
    clubDraft.value = '';
    clubVisibilityPublic.value = false;
    clubAttachments.value = [];
    await load();
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || 'Could not post';
    window.alert(msg);
  } finally {
    posting.value = false;
  }
};

const onSubmitClubWide = () => {
  const text = String(clubDraft.value || '').trim();
  if (!text && !clubAttachments.value.length) return;
  if (props.usePublicFeedEndpoint) return;
  const pref = getSeasonWarnPref();
  if (seasonOptions.value.length && pref !== 'dismiss') {
    seasonWarnOpen.value = true;
    return;
  }
  submitClubPost();
};

const insertAtCursor = (textarea, text) => {
  if (!textarea) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const v = textarea === clubTextareaRef.value ? clubDraft.value : draft.value;
  const next = v.slice(0, start) + text + v.slice(end);
  if (textarea === clubTextareaRef.value) clubDraft.value = next;
  else draft.value = next;
  nextTick(() => {
    textarea.focus();
    const pos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
  });
};

const toggleEmoji = (target) => {
  if (emojiTarget.value !== target) {
    emojiTarget.value = target;
    showEmojiPicker.value = true;
  } else {
    showEmojiPicker.value = !showEmojiPicker.value;
    emojiTarget.value = target;
  }
};

const onEmojiPick = (e) => {
  const unicode = e?.detail?.unicode || '';
  const ta = emojiTarget.value === 'club' ? clubTextareaRef.value : seasonTextareaRef.value;
  if (unicode) insertAtCursor(ta, unicode);
  showEmojiPicker.value = false;
};

const insertSymbol = (ch) => {
  const ta = symbolTarget.value === 'club' ? clubTextareaRef.value : seasonTextareaRef.value;
  insertAtCursor(ta, ch);
  symbolPickOpen.value = false;
};

const openIconPicker = async () => {
  if (props.usePublicFeedEndpoint || !props.clubId) return;
  iconPickOpen.value = true;
  iconsLoading.value = true;
  clubIconsList.value = [];
  try {
    const r = await api.get(`/summit-stats/clubs/${props.clubId}/icons`, { skipGlobalLoading: true });
    clubIconsList.value = Array.isArray(r.data?.icons) ? r.data.icons : [];
  } catch {
    clubIconsList.value = [];
  } finally {
    iconsLoading.value = false;
  }
};

const insertClubIcon = (ic) => {
  if (!ic?.url) return;
  const html = `<img class="inline-feed-icon" src="${ic.url.replace(/"/g, '')}" alt="" loading="lazy" />`;
  insertAtCursor(clubTextareaRef.value, html);
  iconPickOpen.value = false;
};

const onAttachmentFile = async (e) => {
  const input = e.target;
  const file = input?.files?.[0];
  if (!file || props.usePublicFeedEndpoint || !props.clubId) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await api.post(`/summit-stats/clubs/${props.clubId}/feed/attachments`, fd, {
      skipGlobalLoading: true
    });
    const path = r.data?.path;
    const url = r.data?.url;
    if (path && url) clubAttachments.value = [...clubAttachments.value, { path, url }];
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err?.message || 'Upload failed';
    window.alert(msg);
  } finally {
    input.value = '';
  }
};

const removeAttachment = (i) => {
  clubAttachments.value = clubAttachments.value.filter((_, j) => j !== i);
};

const loadSeasonOptions = async () => {
  if (!props.clubId || props.usePublicFeedEndpoint) {
    seasonOptions.value = [];
    return;
  }
  try {
    const r = await api.get(`/summit-stats/clubs/${props.clubId}/feed/season-options`, {
      skipGlobalLoading: true
    });
    seasonOptions.value = Array.isArray(r.data?.seasons) ? r.data.seasons : [];
  } catch {
    seasonOptions.value = [];
  }
};

const onPostToSeasonClick = () => {
  if (!seasonOptions.value.length) return;
  if (seasonOptions.value.length === 1) {
    openSeasonFeed(seasonOptions.value[0].id, seasonOptions.value[0].name);
  } else {
    seasonPickOpen.value = true;
  }
};

const openSeasonFeed = (id, name) => {
  feedSeasonViewId.value = Number(id);
  feedSeasonName.value = String(name || '').trim() || 'Season';
  seasonPickOpen.value = false;
};

const leaveSeasonFeedView = () => {
  feedSeasonViewId.value = null;
  feedSeasonName.value = '';
};

const feedQueryParams = () => {
  const params = { limit };
  if (props.usePublicFeedEndpoint) return params;
  if (feedSeasonViewId.value) {
    params.seasonId = feedSeasonViewId.value;
    return params;
  }
  params.includeSeasonFeed = includeSeasonFeed.value ? 1 : 0;
  return params;
};

const postSeasonMessage = async () => {
  const text = String(draft.value || '').trim();
  const sid = activeSeasonPostId.value;
  if (!text || !sid) return;
  posting.value = true;
  try {
    await api.post(`/learning-program-classes/${sid}/messages`, {
      messageText: text,
      scope: 'season'
    });
    draft.value = '';
    await load();
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || 'Could not post';
    window.alert(msg);
  } finally {
    posting.value = false;
  }
};

const load = async () => {
  if (!props.clubId) return;
  loading.value = true;
  try {
    const r = await api.get(feedPath(), {
      params: feedQueryParams(),
      skipGlobalLoading: true,
      ...feedRequestOpts()
    });
    items.value = Array.isArray(r.data?.items) ? r.data.items : [];
    if (r.data?.feedScope === 'season' && r.data?.seasonName) {
      feedSeasonName.value = r.data.seasonName;
    }
    canLoadMore.value = items.value.length >= limit;
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const loadMore = async () => {
  if (!props.clubId || loading.value) return;
  loading.value = true;
  try {
    const r = await api.get(feedPath(), {
      params: { ...feedQueryParams(), limit: limit * 2 },
      skipGlobalLoading: true,
      ...feedRequestOpts()
    });
    items.value = Array.isArray(r.data?.items) ? r.data.items : [];
    canLoadMore.value = false;
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
};

const timeAgo = (ts) => {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const initials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
};

const formatActivity = (t) => {
  if (!t) return 'Workout';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const hasRichHtml = (t) => typeof t === 'string' && /<[a-z][\s\S]*>/i.test(t);

const richHtml = (raw) =>
  DOMPurify.sanitize(String(raw || ''), {
    ALLOWED_TAGS: ['img', 'br', 'a', 'p', 'span', 'b', 'i', 'em', 'strong'],
    ALLOWED_ATTR: ['src', 'alt', 'class', 'href', 'target', 'rel', 'loading']
  });

watch(
  [() => props.clubId, () => props.usePublicFeedEndpoint, feedSeasonViewId, includeSeasonFeed],
  () => {
    items.value = [];
    load();
  }
);

watch(
  () => props.clubId,
  () => {
    leaveSeasonFeedView();
    loadSeasonOptions();
  }
);

onMounted(() => {
  load();
  loadSeasonOptions();
  pollInterval = setInterval(load, 60_000);
});

onUnmounted(() => clearInterval(pollInterval));
</script>

<style scoped>
.feed-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-bg, #f8fafc);
  border-left: 1px solid var(--border, #e2e8f0);
}

.feed-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 2;
  flex-wrap: wrap;
}

.feed-header-left {
  min-width: 0;
}

.feed-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text, #0f172a);
  letter-spacing: 0.01em;
}

.feed-scope-hint {
  margin: 2px 0 0;
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}

.feed-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.feed-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px 0;
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}

.feed-toggle-track {
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: #e2e8f0;
  position: relative;
  transition: background 0.2s;
}
.feed-toggle--on .feed-toggle-track {
  background: #93c5fd;
}
.feed-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s;
}
.feed-toggle--on .feed-toggle-knob {
  transform: translateX(16px);
}

.feed-post-season {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  font-size: 0.78rem;
  font-weight: 700;
  color: #334155;
  cursor: pointer;
}
.feed-post-season:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.feed-back-club {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #93c5fd;
  background: #eff6ff;
  font-size: 0.78rem;
  font-weight: 700;
  color: #1d4ed8;
  cursor: pointer;
}

.feed-refresh-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  color: #94a3b8;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.15s;
}
.feed-refresh-btn:hover {
  color: var(--primary, #1d4ed8);
}

.feed-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.feed-modal {
  background: #fff;
  border-radius: 12px;
  padding: 18px 20px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
}
.feed-modal--wide {
  max-width: 420px;
}
.feed-modal--tall {
  max-height: min(80vh, 560px);
  display: flex;
  flex-direction: column;
}

.feed-modal-title {
  margin: 0 0 10px;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.feed-modal-body {
  margin: 0 0 16px;
  font-size: 0.88rem;
  color: #475569;
  line-height: 1.45;
}

.feed-modal-actions--stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feed-modal-primary {
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: #fff;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
}

.feed-modal-secondary {
  padding: 10px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  color: #334155;
}

.feed-modal-ghost {
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: underline;
}

.feed-modal-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
}

.feed-modal-row {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  margin-bottom: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 0.88rem;
}
.feed-modal-row:hover {
  background: #f8fafc;
}

.feed-modal-cancel {
  width: 100%;
  padding: 8px;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 0.85rem;
}

.feed-symbol-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.feed-symbol-cell {
  width: 36px;
  height: 36px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  font-size: 1.1rem;
  cursor: pointer;
  line-height: 1;
}
.feed-symbol-cell:hover {
  background: #eff6ff;
}

.feed-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 120px;
}

.feed-icon-cell {
  aspect-ratio: 1;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 4px;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.feed-icon-cell img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.feed-icons-loading,
.feed-icons-empty {
  font-size: 0.85rem;
  color: #94a3b8;
  margin-bottom: 8px;
}

.feed-toolbar-wrap {
  position: relative;
}

.feed-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.feed-tool-btn {
  width: 36px;
  height: 36px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.feed-tool-btn:hover:not(:disabled) {
  background: #f1f5f9;
}
.feed-tool-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.feed-tool-btn--file {
  position: relative;
  overflow: hidden;
}
.feed-tool-btn--file input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.feed-toolbar-note {
  font-size: 0.72rem;
  color: #94a3b8;
  margin-left: auto;
}

.feed-emoji-pop {
  position: absolute;
  z-index: 5;
  left: 0;
  top: 100%;
  margin-top: 4px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  border-radius: 12px;
  overflow: hidden;
}

.feed-emoji-pop emoji-picker {
  --emoji-size: 1.35rem;
  height: 320px;
  width: min(100%, 360px);
}

.feed-attach-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.feed-attach-chip {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}
.feed-attach-chip img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.feed-attach-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.65);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.feed-attach-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 4px;
}
.feed-attach-img {
  max-width: 100%;
  max-height: 220px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid #e2e8f0;
}

.feed-ann-text--rich :deep(.inline-feed-icon) {
  height: 1.25em;
  width: auto;
  vertical-align: -0.2em;
  display: inline-block;
}

.feed-loading {
  display: flex;
  justify-content: center;
  padding: 32px;
}
.feed-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #e2e8f0;
  border-top-color: var(--primary, #1d4ed8);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.feed-empty {
  padding: 32px 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 0.87rem;
}

.feed-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.feed-item {
  padding: 10px 14px;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.1s;
}
.feed-item:hover {
  background: #f8fafc;
}

.feed-item--club.feed-item--announcement {
  background: linear-gradient(135deg, #eff6ff, #f0f9ff);
  border-left: 3px solid #3b82f6;
  margin: 4px 8px;
  border-radius: 8px;
  border-bottom: none;
}
.feed-item--club.feed-item--member-msg {
  background: linear-gradient(135deg, #f0fdf4, #f8fafc);
  border-left: 3px solid #16a34a;
  margin: 4px 8px;
  border-radius: 8px;
  border-bottom: none;
}

.feed-item--announcement:not(.feed-item--club) {
  background: linear-gradient(135deg, #eff6ff, #f0f9ff);
  border-left: 3px solid #3b82f6;
  margin: 4px 8px;
  border-radius: 8px;
  border-bottom: none;
}
.feed-item--announcement:not(.feed-item--club):hover {
  background: #dbeafe;
}

.feed-item--member-msg:not(.feed-item--club) {
  background: linear-gradient(135deg, #f5f3ff, #faf5ff);
  border-left: 3px solid #8b5cf6;
  margin: 4px 8px;
  border-radius: 8px;
  border-bottom: none;
}
.feed-item--member-msg:not(.feed-item--club):hover {
  background: #ede9fe;
}

.feed-ann-badge--club {
  color: #1d4ed8;
}
.feed-ann-badge--club-member {
  color: #15803d;
}

.feed-ann-badge--member {
  color: #6d28d9;
}

.feed-ann-text--member {
  color: #4c1d95;
}

.feed-meta--flush {
  padding-left: 0;
  flex-wrap: wrap;
}

.feed-panel--embedded {
  border-left: none;
  height: auto;
  background: transparent;
}

.feed-panel--embedded .feed-panel-header {
  background: transparent;
  border-bottom: none;
  padding: 0 0 8px;
}

.feed-refresh-row {
  display: flex;
  justify-content: flex-end;
  padding: 0 0 6px;
}
.feed-refresh-row .feed-refresh-btn {
  font-size: 0.8rem;
}

.feed-panel--embedded .feed-list {
  max-height: min(52vh, 520px);
  overflow-y: auto;
}

.feed-compose {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.feed-compose-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.feed-compose--club {
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
}
.feed-pub-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  color: #475569;
  cursor: pointer;
  user-select: none;
}
.feed-pub-toggle input {
  cursor: pointer;
}
.feed-public-pill {
  margin-left: 6px;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: #e0f2fe;
  color: #0369a1;
  border-radius: 6px;
  padding: 2px 6px;
  vertical-align: middle;
}

.feed-panel--embedded .feed-compose {
  padding: 0 0 14px;
}

.feed-compose-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.88rem;
  font-family: inherit;
  resize: vertical;
  min-height: 56px;
}

.feed-compose-input:focus {
  outline: none;
  border-color: #93c5fd;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.feed-compose-actions {
  display: flex;
  justify-content: flex-end;
}

.feed-compose-submit {
  align-self: flex-end;
  padding: 8px 18px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.feed-compose-submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.feed-compose-hint {
  margin: 0 16px 12px;
  font-size: 0.82rem;
  color: #94a3b8;
}

.feed-panel--embedded .feed-compose-hint {
  margin: 0 0 12px;
}

.feed-ann-badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: #2563eb;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.feed-ann-text {
  margin: 0 0 6px;
  font-size: 0.88rem;
  color: #1e3a8a;
  line-height: 1.4;
}

.feed-workout-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 5px;
}

.feed-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--primary, #1d4ed8);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.feed-workout-info {
  flex: 1;
  min-width: 0;
}

.feed-who {
  font-weight: 600;
  font-size: 0.85rem;
  color: #0f172a;
  display: block;
  line-height: 1.2;
}

.feed-activity-type {
  font-size: 0.78rem;
  color: #64748b;
}

.feed-race-badge {
  font-size: 0.72rem;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 1px 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.feed-workout-stats {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
  padding-left: 38px;
}

.feed-stat {
  font-size: 0.8rem;
  background: #f1f5f9;
  border-radius: 10px;
  padding: 1px 8px;
  color: #334155;
}

.feed-pts {
  background: #dcfce7;
  color: #166534;
  font-weight: 600;
}

.feed-notes {
  padding-left: 38px;
  font-size: 0.78rem;
  color: #64748b;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.feed-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-left: 38px;
}

.feed-item--club .feed-meta,
.feed-item--club .feed-ann-text {
  padding-left: 0;
}

.feed-season-tag {
  font-size: 0.72rem;
  color: #94a3b8;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 1px 6px;
}

.feed-dot {
  color: #cbd5e1;
  font-size: 0.75rem;
}

.feed-when {
  font-size: 0.75rem;
  color: #94a3b8;
}

.feed-load-more {
  width: 100%;
  padding: 10px;
  background: transparent;
  border: none;
  color: var(--primary, #1d4ed8);
  font-size: 0.85rem;
  cursor: pointer;
  border-top: 1px solid #f1f5f9;
}
.feed-load-more:hover {
  background: #f8fafc;
}
</style>
