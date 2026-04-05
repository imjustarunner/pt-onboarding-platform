<template>
  <section class="challenge-activity-feed">
    <div class="activity-feed-header">
      <h2>Recent Activity</h2>
      <div v-if="myTeamId" class="feed-scope-tabs" role="tablist" aria-label="Activity feed scope">
        <button
          type="button"
          role="tab"
          class="feed-scope-tab"
          :class="{ active: feedScope === 'team' }"
          :aria-selected="feedScope === 'team'"
          @click="feedScope = 'team'"
        >
          My team
        </button>
        <button
          type="button"
          role="tab"
          class="feed-scope-tab"
          :class="{ active: feedScope === 'all' }"
          :aria-selected="feedScope === 'all'"
          @click="feedScope = 'all'"
        >
          Whole season
        </button>
      </div>
    </div>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="activity-list">
      <div
        v-for="w in displayedWorkouts"
        :key="w.id"
        class="activity-card"
        :style="{ borderLeftColor: activityColor(w.activity_type), boxShadow: `inset 3px 0 0 ${activityColor(w.activity_type)}` }"
      >
        <div class="activity-header">
          <UserAvatar :photo-path="w.profile_photo_path" :first-name="w.first_name" :last-name="w.last_name" size="sm" extra-class="activity-avatar" />
          <div class="activity-user-info">
            <span class="activity-user">{{ w.first_name }} {{ w.last_name }}</span>
            <span class="activity-timestamp">{{ formatTimestamp(w.completed_at || w.created_at) }}</span>
          </div>
          <div class="activity-badges">
            <span class="activity-type">{{ formatActivityType(w.activity_type) }}</span>
            <span v-if="w.terrain" class="terrain-badge" :class="`terrain-${String(w.terrain).toLowerCase()}`">
              {{ w.terrain }}
            </span>
            <span v-if="Number(w.is_race) === 1" class="race-badge">🏅 Race</span>
          </div>
        </div>
        <div class="activity-meta">
          <span v-if="w.distance_value">{{ Number(w.distance_value).toFixed(2) }} mi</span>
          <span v-if="w.duration_minutes">{{ w.duration_minutes }} min</span>
          <span v-if="avgPace(w)" class="activity-pace">{{ avgPace(w) }} /mi</span>
          <span class="activity-points">{{ w.points }} pts</span>
        </div>
        <div v-if="w.weekly_task_name" class="hint" style="margin-top: 4px;">
          Tagged challenge: <strong>{{ w.weekly_task_name }}</strong>
        </div>
        <!-- Screenshot proof thumbnail (before media gallery) -->
        <div v-if="w.screenshot_file_path && !w.media?.length" class="screenshot-proof">
          <img
            :src="toUploadsUrl(w.screenshot_file_path)"
            alt="Workout screenshot"
            class="screenshot-thumb"
            @click="openScreenshot(w.screenshot_file_path)"
          />
          <span class="screenshot-label">Screenshot attached</span>
        </div>
        <div v-if="w.workout_notes" class="activity-notes">{{ w.workout_notes }}</div>
        <div v-if="Number(w.is_disqualified) === 1" class="disqualified-banner">
          Disqualified workout{{ w.disqualification_reason ? `: ${w.disqualification_reason}` : '' }}
        </div>
        <div v-if="w.strava_activity_id" class="hint" style="margin-top: 4px;">
          Source: Strava import (ID {{ w.strava_activity_id }})
        </div>
        <div v-if="Number(w.is_treadmill) === 1" class="hint" style="margin-top: 4px;">
          Treadmill entry
        </div>
        <div v-if="canEditOwnImportedTreadmill(w)" class="proof-review-card" style="margin-top: 6px;">
          <div class="proof-review-header">
            <strong>Edit treadmill import</strong>
            <button class="btn btn-secondary btn-small" @click="toggleEditImportedWorkout(w)">
              {{ editOpenByWorkout[w.id] ? 'Hide' : 'Edit' }}
            </button>
          </div>
          <div v-if="editOpenByWorkout[w.id]" class="proof-review-body">
            <label class="proof-field">
              <span>Corrected miles</span>
              <input v-model.number="editDraftByWorkout[w.id].distanceValue" type="number" step="0.01" min="0" />
            </label>
            <label class="proof-field">
              <span>Treadmill proof URL/path (optional now, can add later)</span>
              <input v-model="editDraftByWorkout[w.id].screenshotFilePath" type="text" maxlength="255" />
            </label>
            <label class="proof-field">
              <span>Notes</span>
              <input v-model="editDraftByWorkout[w.id].workoutNotes" type="text" maxlength="500" />
            </label>
            <div class="proof-actions">
              <button class="btn btn-primary btn-small" :disabled="!!editSubmitting[w.id]" @click="saveEditImportedWorkout(w.id)">
                Save Edit
              </button>
            </div>
          </div>
        </div>
        <div v-if="props.isManager && (w.proof_status || Number(w.is_treadmill) === 1)" class="proof-review-card">
          <div class="proof-review-header">
            <strong>Manager proof review</strong>
            <span class="proof-status" :class="`proof-${String(w.proof_status || '').toLowerCase()}`">
              {{ String(w.proof_status || 'not_required').replace(/_/g, ' ') }}
            </span>
          </div>
          <div class="proof-review-body">
            <label class="proof-field">
              <span>Verified miles (optional)</span>
              <input
                v-model.number="proofReviewDraftByWorkout[w.id].verifiedDistanceValue"
                type="number"
                step="0.01"
                min="0"
                placeholder="Use treadmill photo value if corrected"
              />
            </label>
            <label class="proof-field">
              <span>Review note (optional)</span>
              <input
                v-model="proofReviewDraftByWorkout[w.id].proofReviewNote"
                type="text"
                maxlength="255"
                placeholder="Reason/notes for approval or rejection"
              />
            </label>
            <div class="proof-actions">
              <button class="btn btn-primary btn-small" :disabled="!!proofSubmitting[w.id]" @click="reviewProof(w.id, 'approved')">
                Approve
              </button>
              <button class="btn btn-secondary btn-small" :disabled="!!proofSubmitting[w.id]" @click="reviewProof(w.id, 'pending')">
                Mark Pending
              </button>
              <button class="btn btn-secondary btn-small" :disabled="!!proofSubmitting[w.id]" @click="reviewProof(w.id, 'rejected')">
                Reject
              </button>
            </div>
          </div>
        </div>
        <div v-if="props.isManager" class="proof-review-card">
          <div class="proof-review-header">
            <strong>Workout validity</strong>
          </div>
          <div class="proof-review-body">
            <label class="proof-field">
              <span>Reason (optional)</span>
              <input
                v-model="disqualifyDraftByWorkout[w.id]"
                type="text"
                maxlength="255"
                placeholder="e.g., 4.9 miles did not meet 5-mile challenge"
              />
            </label>
            <div class="proof-actions">
              <button
                v-if="Number(w.is_disqualified) !== 1"
                class="btn btn-secondary btn-small"
                :disabled="!!disqualifySubmitting[w.id]"
                @click="setWorkoutDisqualification(w.id, true)"
              >
                Mark Incomplete / Disqualify
              </button>
              <button
                v-else
                class="btn btn-primary btn-small"
                :disabled="!!disqualifySubmitting[w.id]"
                @click="setWorkoutDisqualification(w.id, false)"
              >
                Reinstate Workout
              </button>
            </div>
          </div>
        </div>
        <div v-if="w.media?.length" class="activity-media">
          <img
            v-for="m in w.media"
            :key="`media-${w.id}-${m.id}`"
            :src="toUploadsUrl(m.file_path)"
            :alt="`Workout media ${m.id}`"
            class="media-item"
          />
        </div>
        <!-- ── Kudos + Emoji Reactions row ──────────────────────────────── -->
        <div class="workout-engagement-row">
          <!-- Kudos button -->
          <button
            class="kudos-btn"
            :class="{
              'kudos-given':     hasGivenKudos(w.id),
              'kudos-disabled':  !canGiveKudos(w)
            }"
            :disabled="kudosSubmitting[w.id]"
            :title="kudosBtnTitle(w)"
            @click="toggleKudos(w)"
          >
            <span class="kudos-icon">👊</span>
            <span class="kudos-count">{{ kudosCountFor(w) }}</span>
            <span class="kudos-label">{{ hasGivenKudos(w.id) ? 'Kudos given' : 'Give kudos' }}</span>
          </button>

          <!-- Emoji reactions display (overlapping pills) -->
          <div class="reactions-display" v-if="(reactionsFor(w.id) || []).length" @click="toggleReactionDetail(w.id)">
            <span
              v-for="(r, ri) in (reactionsFor(w.id) || []).slice(0, 5)"
              :key="`rpill-${w.id}-${ri}`"
              class="reaction-pill"
              :style="{ zIndex: 10 - ri }"
            >{{ r.emoji }}</span>
            <span class="reaction-total-count">{{ totalReactionCount(w.id) }}</span>
          </div>

          <!-- Emoji picker toggle -->
          <button
            class="emoji-btn"
            :class="{ 'emoji-picker-open': emojiPickerOpen[w.id] }"
            @click.stop="toggleEmojiPicker(w.id)"
            title="Add emoji reaction"
          >
            <span>😄 +</span>
          </button>
        </div>

        <!-- Emoji picker panel -->
        <div v-if="emojiPickerOpen[w.id]" class="emoji-picker-panel" @click.stop>
          <div class="emoji-grid">
            <button
              v-for="emoji in emojiOptions"
              :key="`ep-${w.id}-${emoji}`"
              class="emoji-option"
              :class="{ 'emoji-mine': isMyReaction(w.id, emoji) }"
              @click="onReact(w.id, emoji)"
            >{{ emoji }}</button>
          </div>
        </div>

        <!-- Reaction detail popover (who reacted with what) -->
        <div v-if="reactionDetailOpen[w.id]" class="reaction-detail-panel" @click.stop>
          <div class="reaction-detail-header">
            <span>Reactions</span>
            <button class="btn-link" @click="reactionDetailOpen[w.id] = false">✕</button>
          </div>
          <div v-for="group in (reactionsFor(w.id) || [])" :key="`rg-${w.id}-${group.emoji}`" class="reaction-group">
            <span class="reaction-group-emoji">{{ group.emoji }}</span>
            <span class="reaction-group-count">{{ group.count }}</span>
            <span class="reaction-group-names">{{ group.users.map((u) => `${u.firstName} ${u.lastName}`).join(', ') }}</span>
          </div>
        </div>

        <div class="activity-comment-actions">
          <button class="btn btn-secondary btn-small" @click="toggleComments(w.id)">
            {{ commentsOpen[w.id] ? 'Hide' : 'Show' }} Comments ({{ w.comment_count || 0 }})
          </button>
          <label class="upload-btn">
            Upload GIF/Image
            <input type="file" accept=".gif,.png,.jpg,.jpeg,.webp,image/*" @change="onUploadMedia($event, w.id)" />
          </label>
        </div>
        <div v-if="commentsOpen[w.id]" class="comments-box">
          <div v-if="commentsLoading[w.id]" class="hint">Loading comments…</div>
          <div v-else class="comments-list">
            <div v-for="c in commentsByWorkout[w.id] || []" :key="`comment-${c.id}`" class="comment-item">
              <strong>{{ c.first_name }} {{ c.last_name }}</strong>
              <span>{{ c.comment_text }}</span>
              <button
                v-if="Number(c.user_id) === Number(myUserId)"
                class="btn-link"
                @click="deleteComment(w.id, c.id)"
              >
                Delete
              </button>
            </div>
            <div v-if="!(commentsByWorkout[w.id] || []).length" class="hint">No comments yet.</div>
          </div>
          <form class="comment-form" @submit.prevent="submitComment(w.id)">
            <input v-model="commentDraftByWorkout[w.id]" type="text" maxlength="300" placeholder="Add a comment…" />
            <button class="btn btn-primary btn-small" type="submit">Post</button>
          </form>
        </div>
        <div class="activity-time hint">Logged {{ formatTime(w.completed_at || w.created_at) }}</div>
      </div>
      <div v-if="!displayedWorkouts.length" class="empty-hint">
        <template v-if="feedScope === 'team' && myTeamId">No workouts from your team in this feed yet.</template>
        <template v-else>No activity yet. Be the first to log a workout!</template>
      </div>
    </div>
  </section>

  <!-- Screenshot lightbox -->
  <div v-if="lightboxUrl" class="lightbox-overlay" @click.self="closeLightbox">
    <div class="lightbox-box">
      <button class="lightbox-close" @click="closeLightbox">✕</button>
      <img :src="lightboxUrl" alt="Workout screenshot" class="lightbox-img" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import api from '../../services/api';
import UserAvatar from '@/components/common/UserAvatar.vue';

const props = defineProps({
  workouts: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  challengeId: { type: [String, Number], required: true },
  myUserId: { type: [String, Number], default: null },
  isManager: { type: Boolean, default: false },
  myTeamId: { type: [String, Number], default: null }
});
const emit = defineEmits(['media-uploaded']);

/** Whole season vs workouts from the viewer's team only (same idea as Season / Team chat). */
const feedScope = ref('all');

const displayedWorkouts = computed(() => {
  const list = props.workouts || [];
  if (feedScope.value === 'team' && props.myTeamId) {
    return list.filter((w) => w.team_id != null && Number(w.team_id) === Number(props.myTeamId));
  }
  return list;
});

const commentsOpen = ref({});
const commentsLoading = ref({});
const commentsByWorkout = ref({});
const commentDraftByWorkout = ref({});
const proofReviewDraftByWorkout = ref({});
const proofSubmitting = ref({});
const editOpenByWorkout = ref({});
const editDraftByWorkout = ref({});
const editSubmitting = ref({});
const disqualifyDraftByWorkout = ref({});
const disqualifySubmitting = ref({});

// ── Kudos state ────────────────────────────────────────────────────────────
const kudosBudget = ref({ total: 2, used: 0, remaining: 2, intraUsed: 0, intraRemaining: 1, kudoedWorkoutIds: [] });
const kudosCountByWorkout = ref({}); // workoutId -> count
const kudosSubmitting = ref({});

// ── Emoji reactions state ──────────────────────────────────────────────────
const reactionsByWorkout = ref({});  // workoutId -> grouped array
const emojiPickerOpen    = ref({});
const reactionDetailOpen = ref({});

const emojiOptions = [
  '👏','🔥','💪','🏆','⚡','🙌','😤','🎯','🥊','💥',
  '🚀','👟','🏃','❤️','🤙','🫡','💯','🤩','😍','👍',
  '😂','🥇','🎉','💎','⭐','🌟','💫','🏅','🥳','😎'
];

const formatActivityType = (t) => {
  if (!t) return '';
  return String(t).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatTime = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const formatTimestamp = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
};

const avgPace = (w) => {
  const dist = Number(w.distance_value);
  const dur  = Number(w.duration_minutes);
  if (!dist || !dur || dist < 0.1) return null;
  const totalSec = dur * 60;
  const secPerMile = Math.round(totalSec / dist);
  const mins = Math.floor(secPerMile / 60);
  const secs = String(secPerMile % 60).padStart(2, '0');
  return `${mins}:${secs}`;
};

// Screenshot lightbox
const lightboxUrl = ref(null);
const openScreenshot = (filePath) => {
  lightboxUrl.value = toUploadsUrl(filePath);
};
const closeLightbox = () => { lightboxUrl.value = null; };

// ── Kudos helpers ──────────────────────────────────────────────────────────

const hasGivenKudos = (workoutId) =>
  (kudosBudget.value.kudoedWorkoutIds || []).includes(Number(workoutId));

const kudosCountFor = (workout) =>
  kudosCountByWorkout.value[Number(workout.id)] ?? Number(workout.kudos_count || 0);

const canGiveKudos = (workout) => {
  const wId = Number(workout.id);
  if (Number(workout.user_id) === Number(props.myUserId)) return false; // can't self-kudo
  if (hasGivenKudos(wId)) return true; // can take it back
  if (kudosBudget.value.remaining <= 0) return false;
  // Check intra-team cap
  const sameTeam = props.myTeamId && workout.team_id && Number(workout.team_id) === Number(props.myTeamId);
  if (sameTeam && kudosBudget.value.intraRemaining <= 0) return false;
  return true;
};

const kudosBtnTitle = (workout) => {
  if (Number(workout.user_id) === Number(props.myUserId)) return 'Cannot give kudos to your own workout';
  if (hasGivenKudos(workout.id)) return 'Remove your kudos';
  if (kudosBudget.value.remaining <= 0) return 'No kudos remaining this week (resets Sunday)';
  const sameTeam = props.myTeamId && workout.team_id && Number(workout.team_id) === Number(props.myTeamId);
  if (sameTeam && kudosBudget.value.intraRemaining <= 0) return 'Already gave 1 kudos to your team this week';
  return `Give kudos (${kudosBudget.value.remaining} remaining this week)`;
};

const loadKudosBudget = async () => {
  const id = props.challengeId;
  if (!id) return;
  try {
    const r = await api.get(`/learning-program-classes/${id}/kudos-budget`);
    kudosBudget.value = { ...kudosBudget.value, ...r.data };
  } catch { /* silent */ }
};

const loadWorkoutKudosCount = async (workoutId) => {
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/kudos`);
    kudosCountByWorkout.value = { ...kudosCountByWorkout.value, [Number(workoutId)]: Number(r.data?.count || 0) };
  } catch { /* silent */ }
};

const toggleKudos = async (workout) => {
  const workoutId = Number(workout.id);
  if (kudosSubmitting.value[workoutId]) return;
  kudosSubmitting.value = { ...kudosSubmitting.value, [workoutId]: true };
  try {
    if (hasGivenKudos(workoutId)) {
      await api.delete(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/kudos`);
      kudosBudget.value = {
        ...kudosBudget.value,
        used: Math.max(0, kudosBudget.value.used - 1),
        remaining: Math.min(2, kudosBudget.value.remaining + 1),
        kudoedWorkoutIds: (kudosBudget.value.kudoedWorkoutIds || []).filter((id) => id !== workoutId)
      };
      kudosCountByWorkout.value = { ...kudosCountByWorkout.value, [workoutId]: Math.max(0, (kudosCountByWorkout.value[workoutId] || 1) - 1) };
    } else {
      await api.post(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/kudos`);
      kudosBudget.value = {
        ...kudosBudget.value,
        used: kudosBudget.value.used + 1,
        remaining: Math.max(0, kudosBudget.value.remaining - 1),
        kudoedWorkoutIds: [...(kudosBudget.value.kudoedWorkoutIds || []), workoutId]
      };
      // Adjust intra count optimistically
      const sameTeam = props.myTeamId && workout.team_id && Number(workout.team_id) === Number(props.myTeamId);
      if (sameTeam) kudosBudget.value = { ...kudosBudget.value, intraUsed: kudosBudget.value.intraUsed + 1, intraRemaining: Math.max(0, kudosBudget.value.intraRemaining - 1) };
      kudosCountByWorkout.value = { ...kudosCountByWorkout.value, [workoutId]: (kudosCountByWorkout.value[workoutId] || 0) + 1 };
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update kudos');
    await loadKudosBudget();
  } finally {
    kudosSubmitting.value = { ...kudosSubmitting.value, [workoutId]: false };
  }
};

// ── Emoji reaction helpers ────────────────────────────────────────────────

const reactionsFor = (workoutId) => reactionsByWorkout.value[Number(workoutId)] || [];

const totalReactionCount = (workoutId) =>
  reactionsFor(workoutId).reduce((sum, g) => sum + g.count, 0);

const isMyReaction = (workoutId, emoji) => {
  const groups = reactionsFor(workoutId);
  return groups.some((g) => g.emoji === emoji && g.iMine);
};

const toggleEmojiPicker = (workoutId) => {
  const id = Number(workoutId);
  // Close all others
  const newState = {};
  Object.keys(emojiPickerOpen.value).forEach((k) => { newState[k] = false; });
  newState[id] = !emojiPickerOpen.value[id];
  emojiPickerOpen.value = newState;
  // Close detail if open
  reactionDetailOpen.value = { ...reactionDetailOpen.value, [id]: false };
};

const toggleReactionDetail = (workoutId) => {
  const id = Number(workoutId);
  reactionDetailOpen.value = { ...reactionDetailOpen.value, [id]: !reactionDetailOpen.value[id] };
  emojiPickerOpen.value = { ...emojiPickerOpen.value, [id]: false };
};

const loadReactions = async (workoutId) => {
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/reactions`, { skipGlobalLoading: true });
    reactionsByWorkout.value = { ...reactionsByWorkout.value, [Number(workoutId)]: Array.isArray(r.data?.reactions) ? r.data.reactions : [] };
  } catch { /* silent */ }
};

const onReact = async (workoutId, emoji) => {
  const wId = Number(workoutId);
  try {
    await api.post(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/reactions`, { emoji });
    await loadReactions(workoutId);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to toggle reaction');
  }
  // Keep picker open after reaction
};

// Close emoji pickers on click outside
const onDocumentClick = () => {
  emojiPickerOpen.value = {};
};

const activityColor = (type) => {
  const t = String(type || '').toLowerCase();
  if (t.includes('run')) return '#ff7043';
  if (t.includes('cycl')) return '#42a5f5';
  if (t.includes('walk') || t.includes('step')) return '#66bb6a';
  if (t.includes('swim')) return '#26c6da';
  if (t.includes('lift') || t.includes('workout')) return '#ab47bc';
  return '#90a4ae';
};

const toUploadsUrl = (filePath) => {
  const path = String(filePath || '').replace(/^\/+/, '');
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `/uploads/${path}`;
};

const loadComments = async (workoutId) => {
  commentsLoading.value = { ...commentsLoading.value, [workoutId]: true };
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/comments`, { skipGlobalLoading: true });
    commentsByWorkout.value = { ...commentsByWorkout.value, [workoutId]: Array.isArray(r.data?.comments) ? r.data.comments : [] };
  } catch {
    commentsByWorkout.value = { ...commentsByWorkout.value, [workoutId]: [] };
  } finally {
    commentsLoading.value = { ...commentsLoading.value, [workoutId]: false };
  }
};

const toggleComments = async (workoutId) => {
  const open = !!commentsOpen.value[workoutId];
  commentsOpen.value = { ...commentsOpen.value, [workoutId]: !open };
  if (!open) await loadComments(workoutId);
};

const submitComment = async (workoutId) => {
  const text = String(commentDraftByWorkout.value[workoutId] || '').trim();
  if (!text) return;
  await api.post(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/comments`, { commentText: text });
  commentDraftByWorkout.value = { ...commentDraftByWorkout.value, [workoutId]: '' };
  await loadComments(workoutId);
};

const deleteComment = async (workoutId, commentId) => {
  await api.delete(`/learning-program-classes/${props.challengeId}/workout-comments/${commentId}`);
  await loadComments(workoutId);
};

const onUploadMedia = async (event, workoutId) => {
  const file = event?.target?.files?.[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  await api.post(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/media`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  event.target.value = '';
  emit('media-uploaded');
};

const ensureProofDraft = (workoutId, workout) => {
  if (proofReviewDraftByWorkout.value[workoutId]) return;
  proofReviewDraftByWorkout.value = {
    ...proofReviewDraftByWorkout.value,
    [workoutId]: {
      verifiedDistanceValue: workout?.verified_distance_value != null
        ? Number(workout.verified_distance_value)
        : (workout?.distance_value != null ? Number(workout.distance_value) : null),
      proofReviewNote: workout?.proof_review_note || ''
    }
  };
};

const canEditOwnImportedTreadmill = (workout) => {
  return Number(workout?.user_id) === Number(props.myUserId)
    && Number(workout?.is_treadmill) === 1
    && !!workout?.strava_activity_id;
};

const ensureEditDraft = (workoutId, workout) => {
  if (editDraftByWorkout.value[workoutId]) return;
  editDraftByWorkout.value = {
    ...editDraftByWorkout.value,
    [workoutId]: {
      distanceValue: workout?.distance_value != null ? Number(workout.distance_value) : null,
      screenshotFilePath: workout?.screenshot_file_path || '',
      workoutNotes: workout?.workout_notes || ''
    }
  };
};

const toggleEditImportedWorkout = (workout) => {
  const workoutId = Number(workout?.id);
  if (!workoutId) return;
  ensureEditDraft(workoutId, workout);
  editOpenByWorkout.value = { ...editOpenByWorkout.value, [workoutId]: !editOpenByWorkout.value[workoutId] };
};

const saveEditImportedWorkout = async (workoutId) => {
  const draft = editDraftByWorkout.value[workoutId];
  if (!draft) return;
  const distanceValue = Number(draft.distanceValue);
  if (!Number.isFinite(distanceValue) || distanceValue < 0) {
    alert('Please enter a valid corrected distance.');
    return;
  }
  editSubmitting.value = { ...editSubmitting.value, [workoutId]: true };
  try {
    await api.put(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/import-edit`, {
      distanceValue,
      screenshotFilePath: draft.screenshotFilePath || null,
      workoutNotes: draft.workoutNotes || null
    });
    editOpenByWorkout.value = { ...editOpenByWorkout.value, [workoutId]: false };
    emit('media-uploaded');
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to save workout edit');
  } finally {
    editSubmitting.value = { ...editSubmitting.value, [workoutId]: false };
  }
};

const setWorkoutDisqualification = async (workoutId, isDisqualified) => {
  disqualifySubmitting.value = { ...disqualifySubmitting.value, [workoutId]: true };
  try {
    await api.put(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/disqualify`, {
      isDisqualified,
      reason: isDisqualified ? (disqualifyDraftByWorkout.value[workoutId] || null) : null
    });
    emit('media-uploaded');
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update workout status');
  } finally {
    disqualifySubmitting.value = { ...disqualifySubmitting.value, [workoutId]: false };
  }
};

watch(
  () => props.workouts,
  (list) => {
    for (const w of list || []) {
      ensureProofDraft(w.id, w);
      ensureEditDraft(w.id, w);
      if (!Object.prototype.hasOwnProperty.call(disqualifyDraftByWorkout.value, w.id)) {
        disqualifyDraftByWorkout.value = {
          ...disqualifyDraftByWorkout.value,
          [w.id]: w.disqualification_reason || ''
        };
      }
      // Initialize kudos count from feed data
      if (kudosCountByWorkout.value[Number(w.id)] === undefined) {
        kudosCountByWorkout.value[Number(w.id)] = Number(w.kudos_count || 0);
      }
      // Lazy-load reactions for visible workouts
      if (reactionsByWorkout.value[Number(w.id)] === undefined) {
        reactionsByWorkout.value[Number(w.id)] = w.reactions || [];
        loadReactions(w.id);
      }
    }
  },
  { immediate: true, deep: true }
);

onMounted(async () => {
  await loadKudosBudget();
  document.addEventListener('click', onDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
});

const reviewProof = async (workoutId, status) => {
  const workout = (props.workouts || []).find((w) => Number(w.id) === Number(workoutId));
  ensureProofDraft(workoutId, workout);
  const draft = proofReviewDraftByWorkout.value[workoutId] || {};
  proofSubmitting.value = { ...proofSubmitting.value, [workoutId]: true };
  try {
    await api.put(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/proof-review`, {
      proofStatus: status,
      verifiedDistanceValue: draft.verifiedDistanceValue != null ? Number(draft.verifiedDistanceValue) : null,
      proofReviewNote: draft.proofReviewNote ? String(draft.proofReviewNote).trim() : null
    });
    emit('media-uploaded');
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update proof review');
  } finally {
    proofSubmitting.value = { ...proofSubmitting.value, [workoutId]: false };
  }
};
</script>

<style scoped>
.activity-feed-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px 16px;
  margin-bottom: 12px;
}

.challenge-activity-feed h2 {
  margin: 0;
  font-size: 1.1em;
}

.feed-scope-tabs {
  display: inline-flex;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #f8fafc;
}

.feed-scope-tab {
  border: none;
  background: transparent;
  padding: 8px 12px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
}

.feed-scope-tab:hover {
  background: #f1f5f9;
}

.feed-scope-tab.active {
  background: #fff;
  color: #0f172a;
  box-shadow: inset 0 -2px 0 #2563eb;
}
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.activity-card {
  padding: 12px;
  border: 1px solid #eee;
  border-left: 4px solid #90a4ae;
  border-radius: 6px;
  background: #fafafa;
}
.activity-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.activity-user-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.activity-user {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.activity-timestamp {
  font-size: 0.78em;
  color: var(--text-muted, #888);
  margin-top: 1px;
}
.activity-badges {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.activity-type {
  text-transform: capitalize;
  font-size: 0.85em;
  color: var(--text-muted, #666);
  background: #f1f5f9;
  border-radius: 12px;
  padding: 2px 8px;
}
.terrain-badge {
  font-size: 0.78em;
  border-radius: 12px;
  padding: 2px 7px;
  background: #e0f2fe;
  color: #0369a1;
}
.terrain-trail   { background: #dcfce7; color: #15803d; }
.terrain-track   { background: #fef9c3; color: #854d0e; }
.terrain-treadmill { background: #f3e8ff; color: #7e22ce; }
.terrain-race    { background: #fee2e2; color: #b91c1c; }
.terrain-other   { background: #f1f5f9; color: #64748b; }
.race-badge {
  font-size: 0.78em;
  background: #fef3c7;
  color: #92400e;
  border-radius: 12px;
  padding: 2px 7px;
}
.activity-meta {
  margin-top: 6px;
  font-size: 0.88em;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.activity-pace {
  color: #0369a1;
  font-weight: 500;
}
.activity-points {
  margin-left: auto;
  font-weight: 600;
  color: #1d4ed8;
}
/* Screenshot proof */
.screenshot-proof {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.screenshot-thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: opacity 0.2s;
}
.screenshot-thumb:hover { opacity: 0.8; }
.screenshot-label {
  font-size: 0.78em;
  color: #64748b;
}
/* Lightbox */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.75);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lightbox-box {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}
.lightbox-img {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
}
.lightbox-close {
  position: absolute;
  top: -36px;
  right: 0;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.5em;
  cursor: pointer;
}
.activity-notes {
  margin-top: 6px;
  font-size: 0.9em;
}
.activity-time {
  margin-top: 4px;
  font-size: 0.85em;
}
.activity-media {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.media-item {
  width: 88px;
  height: 88px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #ddd;
}
.activity-comment-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.upload-btn {
  border: 1px dashed #bbb;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.78rem;
  cursor: pointer;
}
.upload-btn input {
  display: none;
}
.comments-box {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid #eee;
  border-radius: 6px;
  background: #fff;
}
.proof-review-card {
  margin-top: 8px;
  border: 1px solid #e6e2ff;
  border-radius: 8px;
  background: #faf9ff;
  padding: 8px;
}
.proof-review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.proof-status {
  font-size: 0.75rem;
  border-radius: 999px;
  padding: 2px 8px;
  text-transform: capitalize;
}
.proof-approved { background: #e8f5e9; color: #2e7d32; }
.proof-pending { background: #fff8e1; color: #8d6e63; }
.proof-rejected { background: #ffebee; color: #c62828; }
.proof-not_required { background: #eceff1; color: #546e7a; }
.proof-review-body {
  margin-top: 8px;
  display: grid;
  gap: 6px;
}
.proof-field {
  display: grid;
  gap: 4px;
  font-size: 0.82rem;
}
.proof-field input {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 6px;
}
.proof-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.disqualified-banner {
  margin-top: 8px;
  border-radius: 6px;
  background: #ffebee;
  color: #b71c1c;
  border: 1px solid #ffcdd2;
  padding: 6px 8px;
  font-size: 0.85rem;
}
.comments-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.comment-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 6px;
  align-items: center;
}
.comment-form {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
.comment-form input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 6px;
}
.btn-link {
  background: none;
  border: none;
  color: #c62828;
  cursor: pointer;
  font-size: 0.8rem;
}
.empty-hint,
.loading-inline {
  padding: 12px;
  color: var(--text-muted, #666);
}

/* ── Kudos + Emoji Reactions ─────────────────────────────────────────────── */
.workout-engagement-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
}

/* Kudos button */
.kudos-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  cursor: pointer;
  font-size: 0.82em;
  color: #475569;
  transition: all 0.15s;
  line-height: 1;
}
.kudos-btn:hover:not(:disabled) {
  border-color: #f97316;
  background: #fff7ed;
  color: #ea580c;
}
.kudos-btn.kudos-given {
  border-color: #f97316;
  background: #fff7ed;
  color: #ea580c;
  font-weight: 600;
}
.kudos-btn.kudos-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.kudos-icon { font-size: 1em; }
.kudos-count { font-weight: 700; min-width: 12px; }
.kudos-label { color: inherit; }

/* Emoji reaction overlapping pills */
.reactions-display {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 3px 8px 3px 4px;
  border-radius: 20px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  transition: background 0.15s;
}
.reactions-display:hover { background: #e2e8f0; }
.reaction-pill {
  font-size: 1.1em;
  margin-left: -4px;
  position: relative;
  display: inline-block;
  width: 22px;
  text-align: center;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,0.12));
}
.reaction-pill:first-child { margin-left: 0; }
.reaction-total-count {
  font-size: 0.78em;
  font-weight: 700;
  color: #475569;
  margin-left: 4px;
}

/* Emoji add button */
.emoji-btn {
  padding: 5px 9px;
  border-radius: 20px;
  border: 1.5px dashed #cbd5e1;
  background: transparent;
  cursor: pointer;
  font-size: 0.85em;
  color: #64748b;
  transition: all 0.15s;
}
.emoji-btn:hover,
.emoji-btn.emoji-picker-open {
  border-color: #94a3b8;
  background: #f1f5f9;
}

/* Emoji picker panel */
.emoji-picker-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  margin-top: 4px;
  position: relative;
  z-index: 100;
}
.emoji-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 4px;
}
@media (max-width: 480px) {
  .emoji-grid { grid-template-columns: repeat(6, 1fr); }
}
.emoji-option {
  font-size: 1.3em;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.1s;
  text-align: center;
  line-height: 1;
}
.emoji-option:hover { background: #f1f5f9; }
.emoji-option.emoji-mine {
  background: #dbeafe;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1.5px #93c5fd;
}

/* Reaction detail popover */
.reaction-detail-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.1);
  margin-top: 4px;
  max-width: 340px;
  z-index: 100;
}
.reaction-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85em;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 8px;
}
.reaction-group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.82em;
  border-bottom: 1px solid #f1f5f9;
}
.reaction-group:last-child { border-bottom: none; }
.reaction-group-emoji { font-size: 1.2em; min-width: 22px; }
.reaction-group-count {
  font-weight: 700;
  color: #1d4ed8;
  min-width: 18px;
}
.reaction-group-names {
  color: #475569;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
