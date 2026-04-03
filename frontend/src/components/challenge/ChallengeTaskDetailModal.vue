<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content detail-modal">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title-row">
          <h2>{{ task.name }}</h2>
          <span :class="['mode-badge', modeBadgeClass(task.mode)]">{{ modeLabel(task.mode) }}</span>
        </div>
        <button class="btn-close" @click="$emit('close')" aria-label="Close">×</button>
      </div>

      <div class="modal-body">
        <!-- Task description -->
        <p v-if="task.description" class="task-description">{{ task.description }}</p>

        <!-- Proof policy note -->
        <div v-if="task.proof_policy && task.proof_policy !== 'none'" class="proof-note">
          <span class="proof-icon">📎</span>
          <span>{{ proofPolicyLabel(task.proof_policy) }}</span>
        </div>

        <!-- Loading state -->
        <div v-if="loading" class="loading-row">Loading completion data…</div>

        <!-- Full-team mode: all members grid -->
        <template v-else-if="task.mode === 'full_team'">
          <h3 class="section-title">Team Completion Status</h3>
          <div v-if="detail?.fullTeamMembers?.length" class="full-team-table-wrap">
            <table class="completion-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Team</th>
                  <th>Status</th>
                  <th>Workout</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in detail.fullTeamMembers" :key="m.user_id">
                  <td>{{ m.first_name }} {{ m.last_name }}</td>
                  <td>{{ m.team_name }}</td>
                  <td>
                    <span :class="m.has_tagged ? 'status-done' : 'status-pending'">
                      {{ m.has_tagged ? 'Tagged ✓' : 'Pending' }}
                    </span>
                  </td>
                  <td>
                    <span v-if="m.has_tagged" class="workout-tagged-note">Workout tagged</span>
                    <span v-else class="no-data">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty-state">No team members found.</p>
        </template>

        <!-- Volunteer / Captain mode: assignments table -->
        <template v-else>
          <h3 class="section-title">Assignments &amp; Completions</h3>
          <div v-if="detail?.assignments?.length" class="completion-table-wrap">
            <table class="completion-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Assignee</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Distance</th>
                  <th>Duration</th>
                  <th>Pace / Speed</th>
                  <th>Calories</th>
                  <th>Activity</th>
                  <th>Proof</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in detail.assignments" :key="a.assignmentId">
                  <td>{{ a.teamName }}</td>
                  <td>{{ a.assigneeFirstName }} {{ a.assigneeLastName }}</td>
                  <td>
                    <span v-if="a.volunteered" class="badge-volunteered">Volunteered</span>
                    <span v-else class="badge-assigned">Assigned</span>
                  </td>
                  <td>
                    <span :class="a.isCompleted ? 'status-done' : 'status-pending'">
                      {{ a.isCompleted ? 'Done ✓' : 'Pending' }}
                    </span>
                  </td>
                  <!-- Workout stats -->
                  <template v-if="a.workout">
                    <td>{{ formatDistance(a.workout.distance_value) }}</td>
                    <td>{{ formatDuration(a.workout.duration_minutes) }}</td>
                    <td>{{ formatPace(a.workout) }}</td>
                    <td>{{ a.workout.calories_burned ? `${a.workout.calories_burned} kcal` : '—' }}</td>
                    <td>{{ a.workout.activity_type || '—' }}</td>
                    <td>
                      <a v-if="a.workout.strava_activity_id" :href="`https://www.strava.com/activities/${a.workout.strava_activity_id}`" target="_blank" class="strava-link">
                        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/strava.svg" alt="Strava" class="strava-icon" />
                        Strava
                      </a>
                      <img
                        v-else-if="a.workout.screenshot_file_path"
                        :src="screenshotUrl(a.workout.screenshot_file_path)"
                        alt="Proof screenshot"
                        class="proof-thumb"
                        @click="openScreenshot(a.workout.screenshot_file_path)"
                      />
                      <span v-else class="no-data">—</span>
                    </td>
                  </template>
                  <template v-else>
                    <td colspan="6" class="no-workout-cell">
                      <span v-if="a.isCompleted" class="no-data">Completed — no workout linked</span>
                      <span v-else class="no-data">—</span>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty-state">No completions recorded yet.</p>
        </template>

        <div v-if="loadError" class="error-note">{{ loadError }}</div>
      </div>

      <!-- Screenshot lightbox -->
      <div v-if="lightboxSrc" class="lightbox-overlay" @click="lightboxSrc = null">
        <img :src="lightboxSrc" alt="Proof screenshot" class="lightbox-img" />
        <button class="lightbox-close" @click="lightboxSrc = null">×</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  task: { type: Object, required: true }
});

const emit = defineEmits(['close']);

const loading = ref(true);
const loadError = ref('');
const detail = ref(null);
const lightboxSrc = ref(null);

function modeLabel(mode) {
  if (mode === 'full_team') return 'Full Team';
  if (mode === 'captain_assigns') return 'Captain Assigns';
  return 'Volunteer';
}

function modeBadgeClass(mode) {
  if (mode === 'full_team') return 'badge-full-team';
  if (mode === 'captain_assigns') return 'badge-captain';
  return 'badge-volunteer';
}

function proofPolicyLabel(policy) {
  if (policy === 'photo_required') return 'Photo/screenshot proof required';
  if (policy === 'gps_required_no_treadmill') return 'GPS activity required — no treadmill';
  return policy;
}

function formatDistance(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? `${n.toFixed(2)} mi` : '—';
}

function formatDuration(mins) {
  if (mins == null || mins === '') return '—';
  const m = Number(mins);
  if (!Number.isFinite(m) || m <= 0) return '—';
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
}

function formatPace(workout) {
  const dist = Number(workout?.distance_value || 0);
  const dur = Number(workout?.duration_minutes || 0);
  if (!dist || !dur) return '—';
  const minPerMile = dur / dist;
  const whole = Math.floor(minPerMile);
  const sec = Math.round((minPerMile - whole) * 60);
  return `${whole}:${String(sec).padStart(2, '0')} /mi`;
}

function screenshotUrl(filePath) {
  if (!filePath) return '';
  if (filePath.startsWith('http')) return filePath;
  return `/uploads/challenge_workouts/${filePath.replace(/^.*\//, '')}`;
}

function openScreenshot(filePath) {
  lightboxSrc.value = screenshotUrl(filePath);
}

const loadDetail = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const { data } = await api.get(
      `/learning-program-classes/${props.challengeId}/weekly-tasks/${props.task.id}/detail`,
      { skipGlobalLoading: true }
    );
    detail.value = data;
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Failed to load task details.';
  } finally {
    loading.value = false;
  }
};

onMounted(loadDetail);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 16px;
}

.modal-content.detail-modal {
  background: var(--surface, #fff);
  border-radius: 12px;
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border, #e0e0e0);
  gap: 12px;
}

.modal-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  flex-wrap: wrap;
}

.modal-title-row h2 { margin: 0; font-size: 1.1em; }

.btn-close {
  background: none;
  border: none;
  font-size: 1.5em;
  line-height: 1;
  cursor: pointer;
  color: var(--text-muted, #777);
  padding: 0 4px;
}
.btn-close:hover { color: var(--text, #333); }

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.task-description {
  margin: 0 0 14px;
  font-size: 0.93em;
  color: var(--text-secondary, #555);
  line-height: 1.5;
}

.proof-note {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 0.85em;
  color: #6d4c00;
  margin-bottom: 16px;
}
.proof-icon { font-size: 1.1em; }

.section-title {
  margin: 0 0 12px;
  font-size: 0.95em;
  font-weight: 700;
  color: var(--text, #333);
}

.loading-row { color: var(--text-muted, #888); font-size: 0.9em; padding: 12px 0; }
.empty-state { color: var(--text-muted, #888); font-size: 0.9em; padding: 12px 0; }
.error-note { color: #c62828; font-size: 0.88em; margin-top: 12px; }

/* Mode badges */
.mode-badge {
  font-size: 0.72em;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 10px;
  white-space: nowrap;
}
.badge-full-team { background: #fff3e0; color: #e65100; }
.badge-captain { background: #e3f2fd; color: #1565c0; }
.badge-volunteer { background: #e8f5e9; color: #2e7d32; }
.badge-volunteered { background: #e3f2fd; color: #1565c0; padding: 2px 8px; border-radius: 4px; font-size: 0.82em; }
.badge-assigned { background: #f3e5f5; color: #6a1b9a; padding: 2px 8px; border-radius: 4px; font-size: 0.82em; }

/* Table */
.completion-table-wrap, .full-team-table-wrap { overflow-x: auto; }

.completion-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85em;
}
.completion-table th {
  text-align: left;
  padding: 7px 10px;
  background: var(--surface-alt, #f8f8f8);
  border-bottom: 2px solid var(--border, #e0e0e0);
  font-weight: 600;
  white-space: nowrap;
}
.completion-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-light, #f0f0f0);
  vertical-align: middle;
}
.completion-table tbody tr:last-child td { border-bottom: none; }
.completion-table tbody tr:hover { background: var(--surface-hover, #fafafa); }

.status-done { color: #2e7d32; font-weight: 600; }
.status-pending { color: var(--text-muted, #888); }
.no-data { color: #bbb; }
.no-workout-cell { color: var(--text-muted, #aaa); font-size: 0.88em; }

.workout-tagged-note { font-size: 0.85em; color: #2e7d32; }

/* Strava */
.strava-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85em;
  color: #fc4c02;
  text-decoration: none;
}
.strava-link:hover { text-decoration: underline; }
.strava-icon { width: 14px; height: 14px; filter: invert(35%) sepia(70%) saturate(2000%) hue-rotate(10deg); }

/* Screenshot thumbnail */
.proof-thumb {
  width: 52px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--border, #ddd);
  transition: opacity 0.15s;
}
.proof-thumb:hover { opacity: 0.8; }

/* Lightbox */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1400;
  cursor: pointer;
}
.lightbox-img {
  max-width: 90vw;
  max-height: 88vh;
  border-radius: 6px;
  object-fit: contain;
}
.lightbox-close {
  position: absolute;
  top: 16px;
  right: 20px;
  background: none;
  border: none;
  color: #fff;
  font-size: 2em;
  cursor: pointer;
  line-height: 1;
}
</style>
