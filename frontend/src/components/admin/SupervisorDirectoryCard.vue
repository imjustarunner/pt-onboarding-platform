<template>
  <article class="supervisor-card">
    <header class="supervisor-heading">
      <div class="supervisor-identity">
        <h3><router-link :to="profilePath(supervisor.id)" @click="$emit('open-profile')">{{ supervisor.first_name }} {{ supervisor.last_name }}</router-link></h3>
        <p v-if="roleLabel">{{ roleLabel }}</p>
        <p>{{ supervisor.email }}</p>
        <p v-if="supervisor.agencies">{{ supervisor.agencies }}</p>
        <div v-if="!loading && !error && types.length" class="supervision-roles" aria-label="Supervisory roles">
          <span v-for="type in types" :key="type" class="supervision-badge">{{ roleName(type) }}</span>
        </div>
      </div>
      <button type="button" class="btn btn-sm btn-primary" @click="$emit('add')">Add Supervisee</button>
    </header>
    <details open class="supervisor-team">
      <summary>{{ loading ? 'Loading assigned people…' : error ? 'Assigned people unavailable' : `${people.length} assigned ${people.length === 1 ? 'person' : 'people'}` }}</summary>
      <div v-if="loading" class="team-message" role="status">Loading assignments…</div>
      <div v-else-if="error" class="team-message" role="alert">
        {{ error }} <button type="button" class="btn btn-sm btn-secondary" @click="$emit('retry')">Retry</button>
      </div>
      <p v-else-if="!people.length" class="team-message">No supervisees assigned.</p>
      <ul v-else class="supervisor-people">
        <li v-for="person in people" :key="person.id" class="supervisor-person">
          <div class="person-info">
            <router-link class="person-name" :to="profilePath(person.id)" @click="$emit('open-profile')">{{ person.name }}</router-link>
            <p>{{ person.email }}</p>
            <ul class="person-assignments" aria-label="Supervisor responsibilities">
              <li v-for="assignment in person.assignments" :key="assignment.id">
                <span class="supervision-badge">{{ roleName(assignment.supervisor_type) }}</span>
                <span>{{ assignment.agency_name }}</span>
                <span v-if="Number(assignment.is_primary) === 1" class="primary-label">Primary</span>
              </li>
            </ul>
          </div>
          <router-link :to="profilePath(person.id)" class="btn btn-sm btn-secondary" @click="$emit('open-profile')">View Profile</router-link>
        </li>
      </ul>
    </details>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import { SUPERVISOR_TYPES, normalizeSupervisorType } from '../../constants/supervisorTypes.js';

const props = defineProps({
  supervisor: { type: Object, required: true },
  assignments: { type: Array, default: () => [] },
  loading: Boolean,
  error: { type: String, default: '' },
  roleLabel: { type: String, default: '' },
  profilePath: { type: Function, required: true }
});
defineEmits(['add', 'retry', 'open-profile']);
const roleName = (type) => ({ clinical: 'Clinical supervisor', manager: 'Manager', billing: 'Billing supervisor' })[normalizeSupervisorType(type)];
const types = computed(() => SUPERVISOR_TYPES.filter((type) => props.assignments.some((a) => normalizeSupervisorType(a.supervisor_type) === type)));
// A person can have several supervision types and agency assignments with the same supervisor.
const people = computed(() => {
  const grouped = new Map();
  for (const assignment of props.assignments) {
    const id = Number(assignment.supervisee_id);
    if (!grouped.has(id)) {
      grouped.set(id, {
        id,
        name: [assignment.supervisee_first_name, assignment.supervisee_last_name].filter(Boolean).join(' ') || assignment.supervisee_email || `User #${id}`,
        email: assignment.supervisee_email,
        assignments: []
      });
    }
    grouped.get(id).assignments.push(assignment);
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
});
</script>

<style scoped>
.supervisor-card { border: 1px solid var(--border); border-radius: 10px; padding: 18px; margin-bottom: 16px; background: var(--bg); }
.supervisor-heading, .supervisor-person { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.supervisor-identity, .person-info { min-width: 0; overflow-wrap: anywhere; }
h3 { margin: 0 0 6px; font-size: 17px; }
h3 a, .person-name { color: var(--text-primary); text-decoration: none; }
h3 a:hover, .person-name:hover { text-decoration: underline; }
p { margin: 4px 0; color: var(--text-secondary); font-size: 13px; }
.supervision-roles { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.supervision-badge { display: inline-block; border: 1px solid var(--border); border-radius: 999px; padding: 3px 9px; font-size: 12px; font-weight: 600; color: var(--text-primary); background: var(--bg-secondary); }
.supervisor-team { margin-top: 16px; border-top: 1px solid var(--border); padding-top: 12px; }
summary { cursor: pointer; font-size: 14px; font-weight: 600; }
.supervisor-people { list-style: none; margin: 14px 0 0 10px; padding: 0 0 0 18px; border-left: 2px solid var(--border); }
.supervisor-person { position: relative; padding: 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 10px; background: var(--bg-secondary); }
.supervisor-person::before { content: ''; position: absolute; width: 18px; left: -20px; top: 24px; border-top: 2px solid var(--border); }
.person-name { font-weight: 600; }
.person-assignments { list-style: none; padding: 0; margin: 10px 0 0; }
.person-assignments li { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 6px; color: var(--text-secondary); font-size: 12px; }
.primary-label { font-weight: 600; }
.team-message { padding: 14px 0 0 16px; color: var(--text-secondary); font-size: 14px; }
.btn { flex-shrink: 0; }
@media (max-width: 600px) {
  .supervisor-heading, .supervisor-person { flex-direction: column; gap: 10px; }
  .supervisor-card { padding: 12px; }
  .supervisor-people { margin-left: 2px; padding-left: 12px; }
  .supervisor-person::before { width: 12px; left: -14px; }
}
</style>
