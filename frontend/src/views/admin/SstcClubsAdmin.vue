<template>
  <div class="container sstc-clubs-admin">
    <div class="page-header">
      <div>
        <h1>SSTC Clubs (Super Admin)</h1>
        <p class="muted">
          Create new Summit Stats Team Challenge clubs on behalf of a manager,
          and manage who is in each club. This bypasses the self-starter flow.
        </p>
      </div>
      <router-link class="btn btn-secondary btn-sm" to="/admin">Back to dashboard</router-link>
    </div>

    <div v-if="loadError" class="alert alert-danger">{{ loadError }}</div>

    <div class="muted small scope-note">
      Showing only users already in the SSTC ecosystem (members of the SSTC platform
      or members of any SSTC club). Includes managers, assistant managers and members.
    </div>

    <!-- ─────────── Create new club ─────────── -->
    <section class="card create-card">
      <div class="card-head">
        <h2>Create new club</h2>
        <button
          v-if="!showCreateForm"
          type="button"
          class="btn btn-primary"
          @click="openCreateForm"
        >+ New SSTC club</button>
        <button
          v-else
          type="button"
          class="btn btn-secondary"
          @click="showCreateForm = false"
        >Hide form</button>
      </div>

      <form v-if="showCreateForm" class="create-form" @submit.prevent="submitCreate">
        <div class="form-grid">
          <label class="form-field">
            <span>Club name<span class="required">*</span></span>
            <input
              v-model="createForm.name"
              type="text"
              placeholder="e.g. Big Sky Striders"
              required
            />
          </label>

          <label class="form-field">
            <span>Slug (optional)</span>
            <input
              v-model="createForm.slug"
              type="text"
              :placeholder="autoSlugPreview || 'auto-generated'"
            />
            <small class="help">Used in the public URL <code>/clubs/{slug}</code>. Lowercase, hyphens.</small>
          </label>

          <label class="form-field">
            <span>City</span>
            <input v-model="createForm.city" type="text" placeholder="Optional" />
          </label>

          <label class="form-field">
            <span>State</span>
            <input v-model="createForm.state" type="text" maxlength="32" placeholder="e.g. MT" />
          </label>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <span>Manager<span class="required">*</span></span>
            <UserPicker
              :users="users"
              :selected-id="createForm.managerUserId"
              :loading="usersLoading"
              :exclude-ids="createForm.assistantManagerUserIds"
              placeholder="Search by name or email…"
              @update="(u) => (createForm.managerUserId = u?.id || null)"
            />
            <small class="help">
              The chosen user becomes the club manager. If they're a basic
              member today, they'll be promoted to <code>club_manager</code>.
            </small>
          </div>

          <div class="form-field">
            <span>Assistant managers (optional)</span>
            <UserMultiPicker
              :users="users"
              :selected-ids="createForm.assistantManagerUserIds"
              :loading="usersLoading"
              :exclude-ids="createForm.managerUserId ? [createForm.managerUserId] : []"
              placeholder="Add assistants…"
              @update="(ids) => (createForm.assistantManagerUserIds = ids)"
            />
          </div>
        </div>

        <div v-if="createError" class="alert alert-danger">{{ createError }}</div>

        <div class="form-actions">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="creating || !createForm.name.trim() || !createForm.managerUserId"
          >
            {{ creating ? 'Creating…' : 'Create club' }}
          </button>
        </div>
      </form>
    </section>

    <!-- ─────────── Lookup user → manage their affiliations ─────────── -->
    <section class="card lookup-card">
      <div class="card-head">
        <h2>Look up a user’s club affiliations</h2>
      </div>
      <div class="lookup-form">
        <UserPicker
          :users="users"
          :selected-id="lookupUserId"
          :loading="usersLoading"
          placeholder="Search by name or email…"
          @update="onLookupUserChange"
        />
        <button
          v-if="lookupUserId"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="clearLookup"
        >Clear</button>
      </div>

      <div v-if="lookupLoading" class="muted">Loading…</div>
      <div v-else-if="lookupUser">
        <div class="lookup-summary">
          <div>
            <strong>{{ displayName(lookupUser) }}</strong>
            <span class="muted"> · {{ lookupUser.email }}</span>
            <span v-if="lookupUser.role" class="role-pill">{{ lookupUser.role }}</span>
          </div>
        </div>

        <div v-if="lookupClubs.length === 0" class="muted small">
          This user has no SSTC club affiliations.
        </div>
        <table v-else class="members-table">
          <thead>
            <tr>
              <th>Club</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="club in lookupClubs" :key="`la-${club.id}`">
              <td>
                <div class="club-cell">
                  <strong>{{ club.name }}</strong>
                  <small class="muted">/{{ club.slug || '—' }}</small>
                </div>
              </td>
              <td>
                <select
                  :value="club.clubRole"
                  @change="onLookupRoleChange(club, $event.target.value)"
                  :disabled="busyKey === `lr-${club.id}`"
                >
                  <option value="manager">Manager</option>
                  <option value="assistant_manager">Assistant manager</option>
                  <option value="member">Member</option>
                </select>
              </td>
              <td>
                <span class="badge" :class="club.isActive ? 'badge-success' : 'badge-secondary'">
                  {{ club.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  class="btn btn-danger btn-sm"
                  :disabled="busyKey === `lx-${club.id}`"
                  @click="removeFromLookupClub(club)"
                >Remove</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ─────────── All clubs + members ─────────── -->
    <section class="card clubs-card">
      <div class="card-head">
        <h2>All SSTC clubs</h2>
        <input
          v-model="clubSearch"
          type="text"
          class="search-input"
          placeholder="Filter clubs…"
        />
      </div>

      <div v-if="clubsLoading" class="muted">Loading clubs…</div>
      <div v-else-if="filteredClubs.length === 0" class="muted">
        No clubs yet. Use the form above to create one.
      </div>

      <ul class="clubs-list">
        <li v-for="club in filteredClubs" :key="club.id" class="club-row">
          <div class="club-row-head" @click="toggleClub(club.id)">
            <div class="club-row-title">
              <span class="caret">{{ expandedClubId === club.id ? '▾' : '▸' }}</span>
              <strong>{{ club.name }}</strong>
              <span class="muted">/{{ club.slug || '—' }}</span>
              <span v-if="club.city || club.state" class="muted small">
                · {{ [club.city, club.state].filter(Boolean).join(', ') }}
              </span>
            </div>
            <div class="club-row-actions" @click.stop>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="busyKey === `open-${club.id}`"
                @click="openAsSuperAdmin(club)"
                title="Enter this club's interface as super admin (preview mode)"
              >Open as super admin</button>
              <a
                v-if="club.slug"
                class="btn btn-secondary btn-sm"
                :href="`/clubs/${club.slug}`"
                target="_blank"
                rel="noopener"
              >Public page</a>
            </div>
          </div>

          <div v-if="expandedClubId === club.id" class="club-members">
            <div v-if="membersLoading" class="muted small">Loading members…</div>
            <div v-else-if="!members.length" class="muted small">No members yet.</div>
            <table v-else class="members-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in members" :key="`m-${m.id}`">
                  <td>
                    <strong>{{ displayName(m) }}</strong>
                    <small v-if="m.applicationPending" class="muted"> (pending)</small>
                  </td>
                  <td>{{ m.email }}</td>
                  <td>
                    <select
                      :value="m.clubRole || 'member'"
                      @change="onClubRoleChange(club, m, $event.target.value)"
                      :disabled="busyKey === `r-${club.id}-${m.id}` || m.applicationPending"
                    >
                      <option value="manager">Manager</option>
                      <option value="assistant_manager">Assistant manager</option>
                      <option value="member">Member</option>
                    </select>
                  </td>
                  <td>
                    <span class="badge" :class="m.isActiveInClub ? 'badge-success' : 'badge-secondary'">
                      {{ m.isActiveInClub ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn btn-danger btn-sm"
                      :disabled="busyKey === `x-${club.id}-${m.id}` || m.applicationPending"
                      @click="removeMember(club, m)"
                    >Remove</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import UserPicker from '../../components/admin/sstc/UserPicker.vue';
import UserMultiPicker from '../../components/admin/sstc/UserMultiPicker.vue';
import { useAgencyStore } from '../../store/agency';

const router = useRouter();
const agencyStore = useAgencyStore();

const slugify = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/'s\b/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const displayName = (u) => {
  const first = String(u?.firstName ?? u?.first_name ?? '').trim();
  const last = String(u?.lastName ?? u?.last_name ?? '').trim();
  const full = `${first} ${last}`.trim();
  return full || u?.email || `User ${u?.id || ''}`;
};

const loadError = ref('');

// SSTC-eligible users only (members of platform tenant or any SSTC club).
// Includes their existing club memberships so the picker can show context.
const users = ref([]);
const usersLoading = ref(false);
const loadUsers = async () => {
  usersLoading.value = true;
  try {
    const res = await api.get('/summit-stats/admin/eligible-users', {
      params: { limit: 500 }
    });
    const list = Array.isArray(res.data?.users) ? res.data.users : [];
    users.value = list.map((u) => ({
      id: Number(u.id),
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      email: u.email || '',
      role: u.role || '',
      status: u.status || '',
      sstcMemberships: Array.isArray(u.sstcMemberships) ? u.sstcMemberships : [],
      isClubManagerSomewhere: !!u.isClubManagerSomewhere
    }));
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Failed to load eligible users';
  } finally {
    usersLoading.value = false;
  }
};

// Clubs
const clubs = ref([]);
const clubsLoading = ref(false);
const clubSearch = ref('');
const filteredClubs = computed(() => {
  const q = clubSearch.value.trim().toLowerCase();
  if (!q) return clubs.value;
  return clubs.value.filter((c) => {
    const hay = `${c.name || ''} ${c.slug || ''} ${c.city || ''} ${c.state || ''}`.toLowerCase();
    return hay.includes(q);
  });
});
const loadClubs = async () => {
  clubsLoading.value = true;
  try {
    const res = await api.get('/summit-stats/clubs', { params: { limit: 100 } });
    const list = Array.isArray(res.data?.clubs)
      ? res.data.clubs
      : Array.isArray(res.data)
        ? res.data
        : [];
    clubs.value = list.map((c) => ({
      id: Number(c.id),
      name: c.name || '',
      slug: c.slug || '',
      city: c.city || null,
      state: c.state || null,
      isActive: c.is_active !== 0 && c.is_active !== false,
      primaryManagerName: c.primaryManagerName || null,
      primaryManagerUserId: c.primaryManagerUserId || null
    }));
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Failed to load clubs';
  } finally {
    clubsLoading.value = false;
  }
};

// Create form
const showCreateForm = ref(false);
const createForm = ref({
  name: '',
  slug: '',
  city: '',
  state: '',
  managerUserId: null,
  assistantManagerUserIds: []
});
const creating = ref(false);
const createError = ref('');
const autoSlugPreview = computed(() => slugify(createForm.value.name));
const openCreateForm = () => {
  showCreateForm.value = true;
  createError.value = '';
};
const submitCreate = async () => {
  if (!createForm.value.managerUserId) {
    createError.value = 'Please choose a manager.';
    return;
  }
  creating.value = true;
  createError.value = '';
  try {
    const payload = {
      name: createForm.value.name.trim(),
      slug: createForm.value.slug.trim() || undefined,
      city: createForm.value.city.trim() || undefined,
      state: createForm.value.state.trim() || undefined,
      managerUserId: createForm.value.managerUserId,
      assistantManagerUserIds: createForm.value.assistantManagerUserIds || []
    };
    await api.post('/summit-stats/clubs', payload);
    showCreateForm.value = false;
    createForm.value = {
      name: '', slug: '', city: '', state: '',
      managerUserId: null, assistantManagerUserIds: []
    };
    await loadClubs();
  } catch (e) {
    createError.value = e?.response?.data?.error?.message || 'Failed to create club';
  } finally {
    creating.value = false;
  }
};

// Members of expanded club
const expandedClubId = ref(null);
const members = ref([]);
const membersLoading = ref(false);
const busyKey = ref('');

const toggleClub = async (id) => {
  if (expandedClubId.value === id) {
    expandedClubId.value = null;
    members.value = [];
    return;
  }
  expandedClubId.value = id;
  await loadMembers(id);
};

const loadMembers = async (clubId) => {
  membersLoading.value = true;
  members.value = [];
  try {
    const res = await api.get(`/summit-stats/clubs/${clubId}/members`);
    members.value = Array.isArray(res.data?.members) ? res.data.members : [];
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Failed to load members';
  } finally {
    membersLoading.value = false;
  }
};

const onClubRoleChange = async (club, member, newRole) => {
  if (!newRole || newRole === (member.clubRole || 'member')) return;
  busyKey.value = `r-${club.id}-${member.id}`;
  try {
    await api.put(
      `/summit-stats/clubs/${club.id}/members/${member.id}/role`,
      { clubRole: newRole }
    );
    member.clubRole = newRole;
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to change role');
  } finally {
    busyKey.value = '';
  }
};

const removeMember = async (club, member) => {
  const ok = window.confirm(
    `Remove ${displayName(member)} from "${club.name}"?\n\nThey'll lose all club access immediately.`
  );
  if (!ok) return;
  busyKey.value = `x-${club.id}-${member.id}`;
  try {
    await api.delete(`/summit-stats/clubs/${club.id}/members/${member.id}`);
    members.value = members.value.filter((m) => m.id !== member.id);
    if (lookupUser.value?.id === member.id) {
      lookupClubs.value = lookupClubs.value.filter((c) => c.id !== club.id);
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to remove member');
  } finally {
    busyKey.value = '';
  }
};

// Lookup user
const lookupUserId = ref(null);
const lookupUser = ref(null);
const lookupClubs = ref([]);
const lookupLoading = ref(false);

const onLookupUserChange = async (user) => {
  if (!user?.id) { clearLookup(); return; }
  lookupUserId.value = user.id;
  lookupLoading.value = true;
  lookupClubs.value = [];
  try {
    const res = await api.get(`/summit-stats/users/${user.id}/club-affiliations`);
    lookupUser.value = res.data?.user || user;
    lookupClubs.value = Array.isArray(res.data?.clubs) ? res.data.clubs : [];
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to load affiliations');
  } finally {
    lookupLoading.value = false;
  }
};

const clearLookup = () => {
  lookupUserId.value = null;
  lookupUser.value = null;
  lookupClubs.value = [];
};

const onLookupRoleChange = async (club, newRole) => {
  if (!newRole || newRole === club.clubRole) return;
  busyKey.value = `lr-${club.id}`;
  try {
    await api.put(
      `/summit-stats/clubs/${club.id}/members/${lookupUser.value.id}/role`,
      { clubRole: newRole }
    );
    club.clubRole = newRole;
    if (expandedClubId.value === club.id) {
      const m = members.value.find((mm) => mm.id === lookupUser.value.id);
      if (m) m.clubRole = newRole;
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to change role');
  } finally {
    busyKey.value = '';
  }
};

const removeFromLookupClub = async (club) => {
  const ok = window.confirm(
    `Remove ${displayName(lookupUser.value)} from "${club.name}"?`
  );
  if (!ok) return;
  busyKey.value = `lx-${club.id}`;
  try {
    await api.delete(
      `/summit-stats/clubs/${club.id}/members/${lookupUser.value.id}`
    );
    lookupClubs.value = lookupClubs.value.filter((c) => c.id !== club.id);
    if (expandedClubId.value === club.id) {
      members.value = members.value.filter((m) => m.id !== lookupUser.value.id);
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to remove');
  } finally {
    busyKey.value = '';
  }
};

// Enter the club's interface as super admin. Hydrates the club into the
// agency store, then routes to the SSTC dashboard with previewMode=superadmin
// so the access guards in challenge controllers/views allow read+write.
const openAsSuperAdmin = async (club) => {
  if (!club?.id) return;
  busyKey.value = `open-${club.id}`;
  try {
    let hydrated = null;
    try {
      hydrated = await agencyStore.hydrateAgencyById(club.id);
    } catch (_) {
      hydrated = null;
    }
    if (hydrated) agencyStore.setCurrentAgency(hydrated);

    await router.push({
      path: '/sstc/my_club_dashboard',
      query: {
        previewMode: 'superadmin',
        previewAgencyId: String(club.id)
      }
    });
  } finally {
    busyKey.value = '';
  }
};

onMounted(async () => {
  await Promise.all([loadUsers(), loadClubs()]);
});
</script>

<style scoped>
.sstc-clubs-admin {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 60px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.page-header h1 { margin: 0; }
.muted { color: var(--text-secondary); }
.muted.small, .small { font-size: 12px; }
.required { color: #dc2626; margin-left: 2px; }
.scope-note {
  background: #f1f5f9;
  border-left: 4px solid #4f46e5;
  padding: 8px 12px;
  border-radius: 6px;
}

.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  padding: 18px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}
.card-head h2 { margin: 0; font-size: 18px; }

.create-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-field > span {
  font-weight: 700;
  font-size: 13px;
  color: var(--text-primary);
}
.form-field input, .form-field select {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}
.form-field .help { color: var(--text-secondary); font-size: 12px; }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; }

.search-input {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 220px;
}

.lookup-form {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.lookup-summary { margin: 8px 0; }

.role-pill {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-secondary);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.clubs-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.club-row {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt, #f8fafc);
  overflow: hidden;
}
.club-row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  gap: 10px;
}
.club-row-head:hover { background: rgba(0,0,0,0.02); }
.club-row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.caret { color: var(--text-secondary); font-weight: 800; width: 14px; }
.club-row-actions { display: flex; gap: 6px; }
.club-members { padding: 12px; background: white; border-top: 1px solid var(--border); }

.members-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.members-table th, .members-table td {
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  text-align: left;
  vertical-align: middle;
}
.members-table th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  background: var(--bg-alt, #f8fafc);
}
.club-cell { display: flex; flex-direction: column; }
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.badge-success { background: #ecfdf5; color: #047857; }
.badge-secondary { background: #f1f5f9; color: #64748b; }

.alert {
  padding: 10px 12px;
  border-radius: 8px;
  margin-top: 8px;
  font-size: 13px;
}
.alert-danger {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}
</style>
