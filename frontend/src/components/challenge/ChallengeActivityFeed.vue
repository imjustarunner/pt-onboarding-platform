<template>
  <section class="challenge-activity-feed">
    <h2>Recent Activity</h2>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="activity-list">
      <div
        v-for="w in workouts"
        :key="w.id"
        class="activity-card"
        :style="{ borderLeftColor: activityColor(w.activity_type), boxShadow: `inset 3px 0 0 ${activityColor(w.activity_type)}` }"
      >
        <div class="activity-header">
          <span class="activity-user">{{ w.first_name }} {{ w.last_name }}</span>
          <span class="activity-type">{{ formatActivityType(w.activity_type) }}</span>
        </div>
        <div class="activity-meta">
          <span v-if="w.distance_value">{{ w.distance_value }} mi</span>
          <span v-if="w.duration_minutes">{{ w.duration_minutes }} min</span>
          <span class="activity-points">{{ w.points }} pts</span>
        </div>
        <div v-if="w.weekly_task_name" class="hint" style="margin-top: 4px;">
          Tagged weekly challenge: <strong>{{ w.weekly_task_name }}</strong>
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
        <div class="activity-time hint">{{ formatTime(w.completed_at || w.created_at) }}</div>
      </div>
      <div v-if="!workouts.length" class="empty-hint">No activity yet. Be the first to log a workout!</div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  workouts: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  challengeId: { type: [String, Number], required: true },
  myUserId: { type: [String, Number], default: null },
  isManager: { type: Boolean, default: false }
});
const emit = defineEmits(['media-uploaded']);

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

const formatActivityType = (t) => {
  if (!t) return '';
  return String(t).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatTime = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
    }
  },
  { immediate: true, deep: true }
);

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
.challenge-activity-feed h2 {
  margin: 0 0 12px 0;
  font-size: 1.1em;
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
  align-items: center;
}
.activity-user {
  font-weight: 600;
}
.activity-type {
  text-transform: capitalize;
  font-size: 0.9em;
  color: var(--text-muted, #666);
}
.activity-meta {
  margin-top: 4px;
  font-size: 0.9em;
}
.activity-meta span + span::before {
  content: ' · ';
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
</style>
