<template>
  <div class="challenge-management">
    <div class="page-header">
      <h1>Challenge Management</h1>
      <p class="page-description">
        Create and manage fitness challenges. Configure activity types, scoring, teams, and participants. Use "Challenge" for competitive fitness programs.
      </p>
    </div>

    <div v-if="!organizationId" class="empty-state">
      <p>Select a Learning or Affiliation organization above to manage its challenges.</p>
    </div>

    <div v-else class="panel">
      <div class="controls">
        <button class="btn btn-primary" @click="openCreateModal">Create Challenge</button>
        <button class="btn btn-secondary" @click="loadChallenges" :disabled="loading">Refresh</button>
      </div>

      <div v-if="loading" class="loading">Loading challenges…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="!challenges.length" class="empty-state">
        <p>No challenges yet. Create one to get started.</p>
      </div>
      <div v-else class="challenge-list">
        <div v-for="c in challenges" :key="c.id" class="challenge-card">
          <div class="challenge-card-header">
            <div>
              <h3>{{ c.class_name || c.className }}</h3>
              <span class="challenge-status" :class="statusClass(c)">{{ formatStatus(c) }}</span>
            </div>
            <div class="challenge-actions">
              <button v-if="(c.status || '').toLowerCase() === 'draft'" class="btn btn-primary btn-sm" @click="launchChallenge(c)" :disabled="launching">Launch</button>
              <router-link :to="challengeDashboardLink(c)" class="btn btn-secondary btn-sm">View</router-link>
              <button class="btn btn-secondary btn-sm" @click="openEditModal(c)">Edit</button>
              <button class="btn btn-secondary btn-sm" @click="openManageModal(c)">Manage</button>
              <button class="btn btn-secondary btn-sm" @click="duplicateChallenge(c)">Duplicate</button>
            </div>
          </div>
          <p v-if="c.description" class="challenge-description">{{ c.description }}</p>
          <div class="challenge-meta">
            <span v-if="c.starts_at || c.ends_at">{{ formatDates(c) }}</span>
            <span v-if="c.activity_types_json?.length"> · {{ formatActivityTypes(c.activity_types_json) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Challenge Modal -->
    <div v-if="showChallengeModal" class="modal-overlay" @click.self="closeChallengeModal">
      <div class="modal-content modal-wide">
        <h2>{{ editingChallenge ? 'Edit Challenge' : 'Create Challenge' }}</h2>
        <form @submit.prevent="saveChallenge">
          <div class="form-group">
            <label>Challenge name *</label>
            <input v-model="challengeForm.className" type="text" required placeholder="e.g., Spring 2025 Fitness Challenge" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="challengeForm.description" rows="3" placeholder="Optional challenge description" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Status</label>
              <select v-model="challengeForm.status">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div class="form-group">
              <label>Start date</label>
              <input v-model="challengeForm.startsAt" type="datetime-local" />
            </div>
            <div class="form-group">
              <label>End date</label>
              <input v-model="challengeForm.endsAt" type="datetime-local" />
            </div>
          </div>
          <div class="form-group">
            <label>Activity types (comma-separated)</label>
            <input v-model="challengeForm.activityTypesText" type="text" placeholder="e.g., running, cycling, workout_session, steps" />
            <small>Leave blank for default options.</small>
          </div>
          <div class="form-group">
            <label>Weekly goal minimum (activities per week)</label>
            <input v-model.number="challengeForm.weeklyGoalMinimum" type="number" min="0" placeholder="Optional" />
          </div>
          <div class="form-row" style="display: flex; gap: 16px; flex-wrap: wrap;">
            <div class="form-group">
              <label>Team min points/week</label>
              <input v-model.number="challengeForm.teamMinPointsPerWeek" type="number" min="0" placeholder="Optional" />
              <small>Team must achieve this many points collectively per week</small>
            </div>
            <div class="form-group">
              <label>Individual min points/week</label>
              <input v-model.number="challengeForm.individualMinPointsPerWeek" type="number" min="0" placeholder="Optional" />
              <small>Each person must achieve this many points per week</small>
            </div>
          </div>
          <div class="form-row" style="display: flex; gap: 16px; flex-wrap: wrap;">
            <div class="form-group">
              <label>Master's age threshold (53+)</label>
              <input v-model.number="challengeForm.mastersAgeThreshold" type="number" min="40" max="99" placeholder="53" />
              <small>Age to qualify for Master's Division recognition</small>
            </div>
            <div class="form-group">
              <label>Recognition categories</label>
              <div class="checkbox-group">
                <label><input v-model="challengeForm.recognitionCategories" type="checkbox" value="fastest_male" /> Fastest Male</label>
                <label><input v-model="challengeForm.recognitionCategories" type="checkbox" value="fastest_female" /> Fastest Female</label>
                <label><input v-model="challengeForm.recognitionCategories" type="checkbox" value="fastest_masters_male" /> Fastest Master's Male</label>
                <label><input v-model="challengeForm.recognitionCategories" type="checkbox" value="fastest_masters_female" /> Fastest Master's Female</label>
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeChallengeModal">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Manage Challenge Modal (teams + provider members) -->
    <div v-if="showManageModal" class="modal-overlay" @click.self="closeManageModal">
      <div class="modal-content modal-wide">
        <h2>Manage: {{ managingChallenge?.class_name || managingChallenge?.className }}</h2>
        <div class="manage-tabs">
          <button type="button" :class="['tab-btn', { active: manageTab === 'teams' }]" @click="manageTab = 'teams'">Teams</button>
          <button type="button" :class="['tab-btn', { active: manageTab === 'members' }]" @click="manageTab = 'members'">Participants</button>
          <button type="button" :class="['tab-btn', { active: manageTab === 'profiles' }]" @click="manageTab = 'profiles'; loadParticipantProfiles()">Profiles (Gender/DOB)</button>
          <button type="button" :class="['tab-btn', { active: manageTab === 'weekly' }]" @click="manageTab = 'weekly'; loadWeeklyTasks()">Weekly Tasks</button>
        </div>

        <div v-show="manageTab === 'teams'" class="manage-panel">
          <div class="panel-actions">
            <button class="btn btn-primary btn-sm" @click="openAddTeamModal" :disabled="!managingChallenge">Add Team</button>
          </div>
          <div v-if="teams.length === 0" class="empty-hint">No teams yet. Add teams for team-based competition.</div>
          <ul v-else class="team-list">
            <li v-for="t in teams" :key="t.id" class="team-item">
              <span>{{ t.team_name }}</span>
              <span v-if="teamLeadName(t)" class="team-lead">Lead: {{ teamLeadName(t) }}</span>
              <button class="btn btn-secondary btn-sm" @click="openEditTeamModal(t)">Edit</button>
              <button class="btn btn-secondary btn-sm" @click="removeTeam(t)">Remove</button>
            </li>
          </ul>
        </div>

        <div v-show="manageTab === 'members'" class="manage-panel">
          <div class="panel-actions">
            <button class="btn btn-primary btn-sm" @click="openAddMemberModal" :disabled="!managingChallenge">Add Participant</button>
          </div>
          <div v-if="providerMembers.length === 0" class="empty-hint">No participants yet. Add participants to allow them to log workouts.</div>
          <ul v-else class="member-list">
            <li v-for="m in providerMembers" :key="m.provider_user_id" class="member-item">
              <span>{{ memberDisplayName(m) }}</span>
              <span class="member-status">{{ m.membership_status }}</span>
              <button class="btn btn-secondary btn-sm" @click="removeMember(m)">Remove</button>
            </li>
          </ul>
        </div>

        <div v-show="manageTab === 'profiles'" class="manage-panel">
          <p class="hint">Set gender and date of birth for participants to appear in Recognition of the Week (Fastest Male/Female, Master's Division).</p>
          <div v-if="participantProfilesLoading" class="loading-inline">Loading…</div>
          <div v-else class="profiles-list">
            <div v-for="m in providerMembers" :key="m.provider_user_id" class="profile-row">
              <span>{{ memberDisplayName(m) }}</span>
              <select v-model="profileEdits[m.provider_user_id].gender" @change="saveProfile(m)">
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non_binary">Non-binary</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
              <input v-model="profileEdits[m.provider_user_id].dateOfBirth" type="date" @change="saveProfile(m)" placeholder="DOB" />
            </div>
            <div v-if="!providerMembers.length" class="empty-hint">No participants yet. Add participants first, then set their profiles.</div>
          </div>
        </div>

        <div v-show="manageTab === 'weekly'" class="manage-panel">
          <div class="panel-actions">
            <label>Week of</label>
            <input v-model="weeklyTasksWeek" type="date" />
            <button class="btn btn-primary btn-sm" @click="saveWeeklyTasks" :disabled="!managingChallenge || weeklyTasksSaving">
              {{ weeklyTasksSaving ? 'Saving…' : 'Save 3 Weekly Tasks' }}
            </button>
            <button class="btn btn-secondary btn-sm" @click="closeWeek" :disabled="!managingChallenge || closeWeekSaving">
              {{ closeWeekSaving ? 'Closing…' : 'Close Week & Post Scoreboard' }}
            </button>
          </div>
          <div class="weekly-tasks-form">
            <div v-for="(t, i) in weeklyTasksForm" :key="i" class="form-group">
              <label>Challenge {{ i + 1 }}</label>
              <input v-model="t.name" type="text" placeholder="e.g., Run 5 miles" />
              <textarea v-model="t.description" rows="2" placeholder="Optional description" />
            </div>
          </div>
          <div v-if="weeklyTasksWithIds.length && teams.length" class="weekly-assignments">
            <h4>Assignments</h4>
            <p class="hint">Assign one person per task per team. Captains can also assign from the challenge dashboard.</p>
            <div v-for="t in weeklyTasksWithIds" :key="t.id" class="assignment-group">
              <strong>{{ t.name }}</strong>
              <div v-for="team in teams" :key="team.id" class="assignment-row">
                <span>{{ team.team_name }}</span>
                <select :value="getAssignmentFor(t.id, team.id)?.provider_user_id" @change="(e) => updateAssignment(t.id, team.id, e.target.value)">
                  <option value="">—</option>
                  <option v-for="m in getTeamMembers(team.id)" :key="m.provider_user_id" :value="m.provider_user_id">{{ userDisplayName(m) }}</option>
                </select>
                <span v-if="getAssignmentFor(t.id, team.id)?.is_completed" class="badge-done">Done</span>
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions" style="margin-top: 16px;">
          <button type="button" class="btn btn-secondary" @click="closeManageModal">Done</button>
        </div>
      </div>
    </div>

    <!-- Add Team Modal -->
    <div v-if="showTeamModal" class="modal-overlay" @click.self="closeTeamModal">
      <div class="modal-content">
        <h2>{{ editingTeam ? 'Edit Team' : 'Add Team' }}</h2>
        <form @submit.prevent="saveTeam">
          <div class="form-group">
            <label>Team name *</label>
            <input v-model="teamForm.teamName" type="text" required placeholder="e.g., Team Alpha" />
          </div>
          <div class="form-group">
            <label>Team Lead (optional)</label>
            <select v-model="teamForm.teamManagerUserId">
              <option value="">None</option>
              <option v-for="u in orgUsers" :key="u.id" :value="u.id">{{ userDisplayName(u) }}</option>
            </select>
            <small>Team Leads (provider_plus) can manage their team.</small>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeTeamModal">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="teamSaving">{{ teamSaving ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Add Member Modal -->
    <div v-if="showMemberModal" class="modal-overlay" @click.self="closeMemberModal">
      <div class="modal-content">
        <h2>Add Participant</h2>
        <form @submit.prevent="addMember">
          <div class="form-group">
            <label>User *</label>
            <select v-model="memberForm.providerUserId" required>
              <option value="">Select…</option>
              <option v-for="u in availableUsers" :key="u.id" :value="u.id">{{ userDisplayName(u) }}</option>
            </select>
            <small v-if="!availableUsers.length">No users in this organization. Add users via Company Profile first.</small>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeMemberModal">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="memberSaving">{{ memberSaving ? 'Adding…' : 'Add' }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const router = useRouter();
const agencyStore = useAgencyStore();

const organizationId = computed(() => agencyStore.currentAgency?.id || null);

const loading = ref(false);
const error = ref('');
const challenges = ref([]);
const saving = ref(false);
const showChallengeModal = ref(false);
const editingChallenge = ref(null);
const challengeForm = ref({
  className: '',
  description: '',
  status: 'draft',
  startsAt: '',
  endsAt: '',
  activityTypesText: '',
  weeklyGoalMinimum: null,
  teamMinPointsPerWeek: null,
  individualMinPointsPerWeek: null,
  mastersAgeThreshold: 53,
  recognitionCategories: []
});

const weeklyTasksWeek = ref(getThisWeekSunday());
const weeklyTasksForm = ref([{ name: '', description: '' }, { name: '', description: '' }, { name: '', description: '' }]);
const weeklyTasksSaving = ref(false);
const closeWeekSaving = ref(false);
const weeklyAssignments = ref([]);
const weeklyTasksWithIds = ref([]);
const teamMembersCache = ref({});

function getThisWeekSunday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day;
  const sun = new Date(d);
  sun.setDate(diff);
  return sun.toISOString().slice(0, 10);
}

const showManageModal = ref(false);
const managingChallenge = ref(null);
const manageTab = ref('teams');
const teams = ref([]);
const providerMembers = ref([]);
const orgUsers = ref([]);

const showTeamModal = ref(false);
const editingTeam = ref(null);
const teamForm = ref({ teamName: '', teamManagerUserId: '' });
const teamSaving = ref(false);

const showMemberModal = ref(false);
const memberForm = ref({ providerUserId: '' });
const memberSaving = ref(false);

const launching = ref(false);
const participantProfiles = ref([]);
const participantProfilesLoading = ref(false);
const profileEdits = ref({});

const organizationSlug = computed(() => agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || null);

const challengeDashboardLink = (c) => {
  const id = c.id;
  if (organizationSlug.value) return `/${organizationSlug.value}/challenges/${id}`;
  return `/challenges/${id}`;
};

const formatStatus = (c) => {
  const s = String(c?.status || '').toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'draft') return 'Draft';
  if (s === 'closed') return 'Closed';
  if (s === 'archived') return 'Archived';
  return s || '—';
};

const statusClass = (c) => {
  const s = String(c?.status || '').toLowerCase();
  if (s === 'active') return 'status-active';
  if (s === 'closed') return 'status-closed';
  return '';
};

const formatDates = (c) => {
  const start = c?.starts_at || c?.startsAt;
  const end = c?.ends_at || c?.endsAt;
  if (!start && !end) return '';
  const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `Starts ${fmt(start)}`;
  return `Ends ${fmt(end)}`;
};

const formatActivityTypes = (raw) => {
  if (Array.isArray(raw)) return raw.map((t) => String(t).replace(/_/g, ' ')).join(', ');
  if (typeof raw === 'object' && raw) return Object.keys(raw).map((k) => k.replace(/_/g, ' ')).join(', ');
  return '';
};

const userDisplayName = (u) => {
  const fn = u?.first_name || '';
  const ln = u?.last_name || '';
  const email = u?.email || '';
  if (fn || ln) return `${fn} ${ln}`.trim() || email;
  return email || `User ${u?.id}`;
};

const memberDisplayName = (m) => {
  const fn = m?.first_name || '';
  const ln = m?.last_name || '';
  const email = m?.email || '';
  if (fn || ln) return `${fn} ${ln}`.trim() || email;
  return email || `User ${m?.provider_user_id}`;
};

const teamLeadName = (t) => {
  const fn = t?.manager_first_name || '';
  const ln = t?.manager_last_name || '';
  if (fn || ln) return `${fn} ${ln}`.trim();
  return null;
};

const availableUsers = computed(() => {
  const memberIds = new Set((providerMembers.value || []).map((m) => Number(m.provider_user_id)));
  return (orgUsers.value || []).filter((u) => !memberIds.has(Number(u.id)));
});

const loadChallenges = async () => {
  if (!organizationId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get('/learning-program-classes', { params: { organizationId: organizationId.value } });
    challenges.value = Array.isArray(r.data?.classes) ? r.data.classes : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load challenges';
    challenges.value = [];
  } finally {
    loading.value = false;
  }
};

const openCreateModal = () => {
  editingChallenge.value = null;
  challengeForm.value = {
    className: '',
    description: '',
    status: 'draft',
    startsAt: '',
    endsAt: '',
    activityTypesText: '',
    weeklyGoalMinimum: null,
    teamMinPointsPerWeek: null,
    individualMinPointsPerWeek: null,
    mastersAgeThreshold: 53,
    recognitionCategories: []
  };
  showChallengeModal.value = true;
};

const openEditModal = (c) => {
  editingChallenge.value = c;
  const at = c?.activity_types_json;
  let activityTypesText = '';
  if (Array.isArray(at)) activityTypesText = at.join(', ');
  else if (typeof at === 'object' && at) activityTypesText = Object.keys(at).join(', ');
  const rec = c.recognition_categories_json ?? c.recognitionCategoriesJson;
  const recArr = Array.isArray(rec) ? rec : (typeof rec === 'string' ? (() => { try { return JSON.parse(rec) || []; } catch { return []; } })() : []);
  challengeForm.value = {
    className: c.class_name || c.className || '',
    description: c.description || '',
    status: (c.status || 'draft').toLowerCase(),
    startsAt: c.starts_at || c.startsAt ? new Date(c.starts_at || c.startsAt).toISOString().slice(0, 16) : '',
    endsAt: c.ends_at || c.endsAt ? new Date(c.ends_at || c.endsAt).toISOString().slice(0, 16) : '',
    activityTypesText,
    weeklyGoalMinimum: c.weekly_goal_minimum ?? c.weeklyGoalMinimum ?? null,
    teamMinPointsPerWeek: c.team_min_points_per_week ?? c.teamMinPointsPerWeek ?? null,
    individualMinPointsPerWeek: c.individual_min_points_per_week ?? c.individualMinPointsPerWeek ?? null,
    mastersAgeThreshold: c.masters_age_threshold ?? c.mastersAgeThreshold ?? 53,
    recognitionCategories: recArr
  };
  showChallengeModal.value = true;
};

const closeChallengeModal = () => {
  showChallengeModal.value = false;
  editingChallenge.value = null;
};

const saveChallenge = async () => {
  if (!organizationId.value) return;
  const name = String(challengeForm.value.className || '').trim();
  if (!name) return;
  saving.value = true;
  try {
    const atText = String(challengeForm.value.activityTypesText || '').trim();
    let activityTypesJson = null;
    if (atText) {
      const arr = atText.split(',').map((s) => s.trim()).filter(Boolean);
      if (arr.length) activityTypesJson = arr;
    }
    const startsAt = challengeForm.value.startsAt ? new Date(challengeForm.value.startsAt).toISOString() : null;
    const endsAt = challengeForm.value.endsAt ? new Date(challengeForm.value.endsAt).toISOString() : null;
    const payload = {
      className: name,
      description: challengeForm.value.description || null,
      status: challengeForm.value.status,
      startsAt,
      endsAt,
      activityTypesJson,
      weeklyGoalMinimum: challengeForm.value.weeklyGoalMinimum ?? null,
      teamMinPointsPerWeek: challengeForm.value.teamMinPointsPerWeek ?? null,
      individualMinPointsPerWeek: challengeForm.value.individualMinPointsPerWeek ?? null,
      mastersAgeThreshold: challengeForm.value.mastersAgeThreshold ?? 53,
      recognitionCategoriesJson: challengeForm.value.recognitionCategories?.length ? challengeForm.value.recognitionCategories : null
    };
    if (editingChallenge.value) {
      await api.put(`/learning-program-classes/${editingChallenge.value.id}`, payload);
    } else {
      await api.post('/learning-program-classes', { organizationId: organizationId.value, ...payload });
    }
    closeChallengeModal();
    await loadChallenges();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save challenge';
  } finally {
    saving.value = false;
  }
};

const openManageModal = async (c) => {
  managingChallenge.value = c;
  manageTab.value = 'teams';
  showManageModal.value = true;
  await Promise.all([loadTeams(c.id), loadProviderMembers(c.id), loadOrgUsers()]);
};

const launchChallenge = async (c) => {
  if (!c?.id) return;
  launching.value = true;
  try {
    await api.post(`/learning-program-classes/${c.id}/launch`);
    await loadChallenges();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to launch';
  } finally {
    launching.value = false;
  }
};

const loadParticipantProfiles = async () => {
  const id = managingChallenge.value?.id;
  if (!id) return;
  participantProfilesLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/participant-profiles`);
    participantProfiles.value = Array.isArray(r.data?.profiles) ? r.data.profiles : [];
    const map = {};
    for (const p of participantProfiles.value) {
      map[p.provider_user_id] = { gender: p.gender || '', dateOfBirth: p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '' };
    }
    for (const m of providerMembers.value || []) {
      if (!map[m.provider_user_id]) map[m.provider_user_id] = { gender: '', dateOfBirth: '' };
    }
    profileEdits.value = map;
  } catch {
    participantProfiles.value = [];
    profileEdits.value = {};
  } finally {
    participantProfilesLoading.value = false;
  }
};

const saveProfile = async (m) => {
  const id = managingChallenge.value?.id;
  if (!id || !m?.provider_user_id) return;
  const edit = profileEdits.value[m.provider_user_id];
  if (!edit) return;
  try {
    await api.put(`/learning-program-classes/${id}/participant-profiles/${m.provider_user_id}`, {
      gender: edit.gender || null,
      dateOfBirth: edit.dateOfBirth || null
    });
    await loadParticipantProfiles();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save profile';
  }
};

const closeManageModal = () => {
  showManageModal.value = false;
  managingChallenge.value = null;
  teams.value = [];
  providerMembers.value = [];
};

const loadTeams = async (classId) => {
  if (!classId) return;
  try {
    const r = await api.get(`/learning-program-classes/${classId}/teams`);
    teams.value = Array.isArray(r.data?.teams) ? r.data.teams : [];
  } catch {
    teams.value = [];
  }
};

const loadProviderMembers = async (classId) => {
  if (!classId) return;
  try {
    const r = await api.get(`/learning-program-classes/${classId}`);
    providerMembers.value = Array.isArray(r.data?.providerMembers) ? r.data.providerMembers : [];
  } catch {
    providerMembers.value = [];
  }
};

const loadOrgUsers = async () => {
  if (!organizationId.value) return;
  try {
    const r = await api.get(`/agencies/${organizationId.value}/users`);
    orgUsers.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    orgUsers.value = [];
  }
};

const loadWeeklyTasks = async () => {
  if (!managingChallenge.value?.id) return;
  try {
    const [tasksRes, assignRes] = await Promise.all([
      api.get(`/learning-program-classes/${managingChallenge.value.id}/weekly-tasks`, { params: { week: weeklyTasksWeek.value } }),
      api.get(`/learning-program-classes/${managingChallenge.value.id}/weekly-assignments`, { params: { week: weeklyTasksWeek.value } })
    ]);
    const tasks = Array.isArray(tasksRes.data?.tasks) ? tasksRes.data.tasks : [];
    weeklyTasksForm.value = [
      { name: tasks[0]?.name || '', description: tasks[0]?.description || '' },
      { name: tasks[1]?.name || '', description: tasks[1]?.description || '' },
      { name: tasks[2]?.name || '', description: tasks[2]?.description || '' }
    ];
    weeklyAssignments.value = Array.isArray(assignRes.data?.assignments) ? assignRes.data.assignments : [];
    weeklyTasksWithIds.value = tasks;
    for (const team of teams.value) {
      if (team.id && !teamMembersCache.value[team.id]) {
        try {
          const mRes = await api.get(`/learning-program-classes/${managingChallenge.value.id}/teams/${team.id}/members`);
          teamMembersCache.value = { ...teamMembersCache.value, [team.id]: Array.isArray(mRes.data?.members) ? mRes.data.members : [] };
        } catch {
          teamMembersCache.value = { ...teamMembersCache.value, [team.id]: [] };
        }
      }
    }
  } catch {
    weeklyTasksForm.value = [{ name: '', description: '' }, { name: '', description: '' }, { name: '', description: '' }];
    weeklyAssignments.value = [];
  }
};

const getTeamMembers = (teamId) => teamMembersCache.value[teamId] || [];

const getAssignmentFor = (taskId, teamId) =>
  weeklyAssignments.value.find((a) => Number(a.task_id) === Number(taskId) && Number(a.team_id) === Number(teamId));

const updateAssignment = async (taskId, teamId, providerUserId) => {
  if (!managingChallenge.value?.id || !providerUserId) return;
  try {
    await api.post(`/learning-program-classes/${managingChallenge.value.id}/weekly-assignments`, {
      taskId,
      teamId,
      providerUserId,
      volunteered: false
    });
    await loadWeeklyTasks();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update assignment');
  }
};

const saveWeeklyTasks = async () => {
  if (!managingChallenge.value?.id) return;
  weeklyTasksSaving.value = true;
  try {
    await api.post(`/learning-program-classes/${managingChallenge.value.id}/weekly-tasks`, {
      week: weeklyTasksWeek.value,
      tasks: weeklyTasksForm.value.filter((t) => t.name?.trim())
    });
    await loadWeeklyTasks();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to save weekly tasks');
  } finally {
    weeklyTasksSaving.value = false;
  }
};

const closeWeek = async () => {
  if (!managingChallenge.value?.id) return;
  if (!confirm('Close this week? This will post the scoreboard and run elimination. Eliminated users will lose access.')) return;
  closeWeekSaving.value = true;
  try {
    await api.post(`/learning-program-classes/${managingChallenge.value.id}/close-week`, {
      week: weeklyTasksWeek.value
    });
    alert('Week closed. Scoreboard posted.');
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to close week');
  } finally {
    closeWeekSaving.value = false;
  }
};

const openAddTeamModal = () => {
  editingTeam.value = null;
  teamForm.value = { teamName: '', teamManagerUserId: '' };
  showTeamModal.value = true;
};

const openEditTeamModal = (t) => {
  editingTeam.value = t;
  teamForm.value = {
    teamName: t.team_name || '',
    teamManagerUserId: t.team_manager_user_id ? String(t.team_manager_user_id) : ''
  };
  showTeamModal.value = true;
};

const closeTeamModal = () => {
  showTeamModal.value = false;
  editingTeam.value = null;
};

const saveTeam = async () => {
  const classId = managingChallenge.value?.id;
  if (!classId) return;
  const name = String(teamForm.value.teamName || '').trim();
  if (!name) return;
  teamSaving.value = true;
  try {
    if (editingTeam.value) {
      await api.put(`/learning-program-classes/${classId}/teams/${editingTeam.value.id}`, {
        teamName: name,
        teamManagerUserId: teamForm.value.teamManagerUserId ? Number(teamForm.value.teamManagerUserId) : null
      });
    } else {
      await api.post(`/learning-program-classes/${classId}/teams`, {
        teamName: name,
        teamManagerUserId: teamForm.value.teamManagerUserId ? Number(teamForm.value.teamManagerUserId) : null
      });
    }
    closeTeamModal();
    await loadTeams(classId);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save team';
  } finally {
    teamSaving.value = false;
  }
};

const removeTeam = async (t) => {
  if (!confirm(`Remove team "${t.team_name}"?`)) return;
  const classId = managingChallenge.value?.id;
  if (!classId) return;
  try {
    await api.delete(`/learning-program-classes/${classId}/teams/${t.id}`);
    await loadTeams(classId);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to remove team';
  }
};

const openAddMemberModal = () => {
  memberForm.value = { providerUserId: '' };
  showMemberModal.value = true;
};

const closeMemberModal = () => {
  showMemberModal.value = false;
};

const addMember = async () => {
  const classId = managingChallenge.value?.id;
  const userId = Number(memberForm.value.providerUserId);
  if (!classId || !userId) return;
  memberSaving.value = true;
  try {
    await api.put(`/learning-program-classes/${classId}/providers`, {
      members: [{ providerUserId: userId, membershipStatus: 'active' }]
    });
    closeMemberModal();
    await loadProviderMembers(classId);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to add participant';
  } finally {
    memberSaving.value = false;
  }
};

const duplicateChallenge = async (c) => {
  if (!confirm(`Duplicate "${c.class_name || c.className}"? A new draft challenge will be created.`)) return;
  try {
    await api.post(`/learning-program-classes/${c.id}/duplicate`, { copyMembers: false });
    await loadChallenges();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to duplicate challenge';
  }
};

const removeMember = async (m) => {
  if (!confirm(`Remove ${memberDisplayName(m)} from this challenge?`)) return;
  const classId = managingChallenge.value?.id;
  if (!classId) return;
  try {
    await api.put(`/learning-program-classes/${classId}/providers`, {
      members: [{ providerUserId: m.provider_user_id, membershipStatus: 'removed' }]
    });
    await loadProviderMembers(classId);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to remove participant';
  }
};

watch(organizationId, () => {
  if (organizationId.value) loadChallenges();
  else challenges.value = [];
});

onMounted(() => {
  if (organizationId.value) loadChallenges();
});
</script>

<style scoped>
.challenge-management {
  padding: 0;
}
.page-header {
  margin-bottom: 20px;
}
.page-header h1 {
  margin: 0 0 4px 0;
  font-size: 1.4em;
}
.page-description {
  margin: 0;
  color: var(--text-muted, #666);
  font-size: 0.95em;
}
.controls {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.challenge-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.challenge-card {
  padding: 16px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  background: var(--bg, #fff);
}
.challenge-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.challenge-card-header h3 {
  margin: 0 8px 0 0;
  font-size: 1.1em;
}
.challenge-status {
  font-size: 0.8em;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.challenge-status.status-active {
  background: #e8f5e9;
  color: #2e7d32;
}
.challenge-status.status-closed {
  background: #f5f5f5;
  color: #666;
}
.challenge-actions {
  display: flex;
  gap: 8px;
}
.challenge-description {
  margin: 8px 0;
  font-size: 0.95em;
  color: var(--text-muted, #666);
}
.challenge-meta {
  font-size: 0.85em;
  color: var(--text-muted, #666);
}
.team-list,
.member-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.team-item,
.member-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color, #eee);
}
.team-lead,
.member-status {
  font-size: 0.9em;
  color: var(--text-muted, #666);
}
.manage-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.tab-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color, #ddd);
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
}
.tab-btn.active {
  background: var(--primary, #0066cc);
  color: #fff;
  border-color: var(--primary, #0066cc);
}
.manage-panel {
  padding: 12px 0;
}
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
}
.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: normal;
  cursor: pointer;
}
.profiles-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.profile-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}
.profile-row span:first-child {
  min-width: 140px;
}
.profile-row select {
  width: 140px;
  padding: 6px 10px;
}
.profile-row input[type="date"] {
  width: 140px;
  padding: 6px 10px;
}
.panel-actions {
  margin-bottom: 12px;
}
.empty-hint {
  padding: 12px;
  color: var(--text-muted, #666);
  font-size: 0.95em;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  max-width: 480px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-wide {
  max-width: 560px;
}
.form-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.form-row .form-group {
  flex: 1;
  min-width: 140px;
}
.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}
.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
}
.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-muted, #666);
  font-size: 0.85em;
}
.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}
.weekly-tasks-form {
  margin-bottom: 20px;
}
.weekly-assignments {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color, #eee);
}
.weekly-assignments h4 {
  margin: 0 0 8px 0;
  font-size: 1em;
}
.weekly-assignments .hint {
  margin-bottom: 12px;
}
.assignment-group {
  margin-bottom: 16px;
}
.assignment-group strong {
  display: block;
  margin-bottom: 8px;
}
.assignment-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}
.assignment-row span:first-child {
  min-width: 120px;
}
.assignment-row select {
  min-width: 180px;
  padding: 6px 10px;
}
.badge-done {
  background: #e8f5e9;
  color: #2e7d32;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85em;
}
</style>
