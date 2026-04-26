<template>
  <section class="challenge-team-list">
    <h2>Teams</h2>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="teams-list">
      <div v-for="t in teams" :key="t.id" class="team-card">
        <button type="button" class="team-card-toggle" @click="toggleTeam(t.id)">
          <span>
            <span class="team-name">{{ t.team_name }}</span>
            <span v-if="t.manager_first_name || t.manager_last_name" class="team-lead hint">
              Team Captain: {{ t.manager_first_name }} {{ t.manager_last_name }}
            </span>
          </span>
          <span class="team-expand-icon">{{ expandedTeamIds.has(Number(t.id)) ? '−' : '+' }}</span>
        </button>
        <router-link
          v-if="challengeId && organizationSlug"
          :to="`/${organizationSlug}/season/${challengeId}/team/${t.id}`"
          class="team-dashboard-link"
        >
          Open Team Dashboard
        </router-link>
        <div v-if="expandedTeamIds.has(Number(t.id))" class="team-members">
          <div v-if="membersLoading[Number(t.id)]" class="loading-inline">Loading members…</div>
          <div v-else-if="membersError[Number(t.id)]" class="empty-hint">{{ membersError[Number(t.id)] }}</div>
          <ul v-else-if="teamMembers[Number(t.id)]?.length" class="team-member-list">
            <li v-for="m in teamMembers[Number(t.id)]" :key="m.provider_user_id" class="team-member-row">
              <button
                v-if="clubId && m.provider_user_id"
                type="button"
                class="member-name-btn"
                @click="openProfile(m)"
              >{{ memberName(m) }}</button>
              <span v-else>{{ memberName(m) }}</span>
              <span v-if="m.is_team_captain" class="captain-pill">Captain</span>
            </li>
          </ul>
          <div v-else class="empty-hint">No members assigned yet.</div>
        </div>
      </div>
      <div v-if="!teams.length" class="empty-hint">No teams yet. Contact your Program Manager to add teams.</div>
    </div>

    <MemberProfileModal
      :club-id="clubId"
      :user-id="selectedUserId"
      :member-name="selectedName"
      @close="selectedUserId = null"
    />
  </section>
</template>

<script setup>
import { ref } from 'vue';
import api from '../../services/api';
import MemberProfileModal from '../shared/MemberProfileModal.vue';

const props = defineProps({
  teams: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  challengeId: { type: [Number, String], default: null },
  organizationSlug: { type: String, default: '' },
  clubId: { type: [Number, String], default: null }
});

const expandedTeamIds = ref(new Set());
const teamMembers = ref({});
const membersLoading = ref({});
const membersError = ref({});
const selectedUserId = ref(null);
const selectedName = ref('');

const memberName = (member) => `${member?.first_name || ''} ${member?.last_name || ''}`.trim() || member?.email || 'Member';

const openProfile = (m) => {
  selectedUserId.value = Number(m.provider_user_id);
  selectedName.value = memberName(m);
};

const loadMembers = async (teamId) => {
  const id = Number(teamId);
  if (!props.challengeId || !id || teamMembers.value[id]) return;
  membersLoading.value = { ...membersLoading.value, [id]: true };
  membersError.value = { ...membersError.value, [id]: '' };
  try {
    const { data } = await api.get(`/learning-program-classes/${props.challengeId}/teams/${id}/members`, { skipGlobalLoading: true });
    teamMembers.value = { ...teamMembers.value, [id]: Array.isArray(data?.members) ? data.members : [] };
  } catch (e) {
    membersError.value = { ...membersError.value, [id]: e?.response?.data?.error?.message || 'Could not load members.' };
  } finally {
    membersLoading.value = { ...membersLoading.value, [id]: false };
  }
};

const toggleTeam = async (teamId) => {
  const id = Number(teamId);
  const next = new Set(expandedTeamIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
    loadMembers(id);
  }
  expandedTeamIds.value = next;
};
</script>

<style scoped>
.challenge-team-list h2 {
  margin: 0 0 12px 0;
  font-size: 1.1em;
}
.teams-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.team-card {
  padding: 12px;
  border: 1px solid #eee;
  border-radius: 6px;
  min-width: 160px;
  background: #fafafa;
}
.team-card-toggle {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.team-name {
  display: block;
  font-weight: 600;
}
.team-lead {
  display: block;
  margin-top: 4px;
  font-size: 0.9em;
}
.team-expand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 800;
}
.team-dashboard-link {
  display: inline-flex;
  margin-top: 10px;
  font-size: 0.88em;
  font-weight: 700;
  color: #1d4ed8;
  text-decoration: none;
}
.team-dashboard-link:hover {
  text-decoration: underline;
}
.team-members {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #e5e7eb;
}
.team-member-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.team-member-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.92em;
}
.captain-pill {
  padding: 2px 7px;
  border-radius: 999px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 0.75em;
  font-weight: 800;
}
.member-name-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: inherit;
  color: #1d4ed8;
  font-weight: 500;
  text-align: left;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}
.member-name-btn:hover { color: #1e40af; text-decoration-style: solid; }
.empty-hint,
.loading-inline {
  padding: 12px;
  color: var(--text-muted, #666);
}
</style>
