<template>
  <div class="ams-page">
    <header class="ams-header">
      <div>
        <h1>School Marketing Campaigns</h1>
        <p class="muted">
          Promote a public page, event, program, or enrollment as a slide-out toast on every school portal.
          Visible to <strong>school staff</strong> by default; pause individual schools any time.
        </p>
      </div>
      <div class="ams-header-actions">
        <button type="button" class="btn btn-primary" @click="startNew">+ New campaign</button>
      </div>
    </header>

    <div v-if="loading" class="ams-empty muted">Loading…</div>
    <div v-else-if="!agencyId" class="ams-empty muted">No agency in context.</div>
    <div v-else-if="!splashes.length && !editing" class="ams-empty">
      <p class="muted">No campaigns yet. Create one to start marketing a public page or event to your school portals.</p>
      <button type="button" class="btn btn-primary" @click="startNew">Create your first campaign</button>
    </div>

    <div class="ams-grid">
      <ul v-if="splashes.length" class="ams-list" :class="{ 'has-editor': !!editing }">
        <li
          v-for="s in splashes"
          :key="s.id"
          class="ams-row"
          :class="{ active: editing && editing.id === s.id }"
          @click="select(s)"
        >
          <div class="ams-row-main">
            <div class="ams-row-title">
              <span :class="['ams-status', s.isActive ? 'on' : 'off']">{{ s.isActive ? 'On' : 'Off' }}</span>
              <strong>{{ s.title }}</strong>
            </div>
            <div class="ams-row-meta">
              <span class="ams-row-kind">{{ kindLabel(s.destination?.kind) }}</span>
              <span v-if="s.destination?.resolved?.url" class="ams-row-url" :title="s.destination.resolved.url">
                {{ s.destination.resolved.url }}
              </span>
              <span v-if="s.endsAt" class="ams-row-dates">until {{ formatDate(s.endsAt) }}</span>
            </div>
          </div>
          <div class="ams-row-actions" @click.stop>
            <label class="ams-toggle">
              <input
                type="checkbox"
                :checked="s.isActive"
                :disabled="busyKey === `toggle-${s.id}`"
                @change="toggleActive(s, $event.target.checked)"
              />
              <span>{{ s.isActive ? 'Active' : 'Off' }}</span>
            </label>
          </div>
        </li>
      </ul>

      <section v-if="editing" class="ams-editor card">
        <header class="ams-editor-head">
          <h2>{{ editing.id ? 'Edit campaign' : 'New campaign' }}</h2>
          <button class="ams-close" type="button" @click="cancelEdit" aria-label="Close editor">×</button>
        </header>
        <div v-if="editorError" class="ams-error">{{ editorError }}</div>

        <div class="ams-fields">
          <label class="ams-field">
            <span>Title</span>
            <input v-model.trim="editing.title" type="text" maxlength="180" placeholder="Spring Open House" />
          </label>

          <label class="ams-field">
            <span>One-line subtitle</span>
            <input v-model.trim="editing.subtitle" type="text" maxlength="240" />
          </label>

          <label class="ams-field">
            <span>Description / blurb (optional)</span>
            <textarea v-model="editing.body" rows="3"></textarea>
          </label>

          <div class="ams-field-row">
            <label class="ams-field flex">
              <span>CTA label</span>
              <input v-model.trim="editing.ctaLabel" type="text" maxlength="64" placeholder="Learn more / RSVP / Sign up" />
            </label>
            <label class="ams-field">
              <span>Accent color</span>
              <input v-model="editing.accentColor" type="color" />
            </label>
          </div>

          <fieldset class="ams-fieldset">
            <legend>Destination (must be a real registratable page)</legend>
            <div class="ams-field-row">
              <label class="ams-field flex">
                <span>Kind</span>
                <select v-model="editing.destinationKind" @change="onKindChange">
                  <option value="marketing_page">Public marketing page</option>
                  <option value="event">Single event</option>
                  <option value="program_events">Program events</option>
                  <option value="program_enrollment">Program enrollment</option>
                  <option value="agency_events">Agency public events page</option>
                  <option value="agency_enrollment">Agency enrollment page</option>
                </select>
              </label>
              <label v-if="needsDestinationId" class="ams-field flex">
                <span>{{ destinationLookupLabel }}</span>
                <select v-model.number="editing.destinationId" @change="onDestinationChange">
                  <option :value="null">Choose…</option>
                  <option v-for="o in destinationOptions" :key="o.id" :value="o.id">
                    {{ o.label }}{{ o.sublabel ? ' · ' + o.sublabel : '' }}
                  </option>
                </select>
              </label>
            </div>

            <div v-if="editing.destinationKind === 'program_events' && availableSessions.length" class="ams-subset">
              <span class="ams-field-label">Feature only these sessions (optional):</span>
              <div class="ams-subset-list">
                <label v-for="sess in availableSessions" :key="sess.id" class="ams-subset-item">
                  <input
                    type="checkbox"
                    :value="sess.id"
                    :checked="(editing.destinationSubsetJson || []).includes(sess.id)"
                    @change="toggleSession(sess.id, $event.target.checked)"
                  />
                  {{ sess.label }}
                </label>
              </div>
            </div>

            <label class="ams-field">
              <span>Override URL (optional)</span>
              <input v-model.trim="editing.destinationOverrideUrl" type="text" placeholder="Leave blank to use the auto-resolved URL" />
            </label>

            <div v-if="resolvedDestination" class="ams-resolved">
              <span class="ams-resolved-label">Resolves to:</span>
              <a :href="resolvedDestination.url" target="_blank" rel="noopener">{{ resolvedDestination.url }}</a>
              <span v-if="resolvedDestination.isLive === false" class="ams-resolved-warn">⚠ destination not live</span>
            </div>
          </fieldset>

          <fieldset class="ams-fieldset">
            <legend>Schedule</legend>
            <div class="ams-field-row">
              <label class="ams-field flex">
                <span>Starts</span>
                <input v-model="editing.startsAt" type="datetime-local" />
              </label>
              <label class="ams-field flex">
                <span>Ends</span>
                <input v-model="editing.endsAt" type="datetime-local" />
              </label>
            </div>
            <div class="ams-field-row">
              <label class="ams-field flex">
                <span>Re-show after (hours)</span>
                <input v-model.number="editing.reshowAfterHours" type="number" min="0" max="720" />
              </label>
              <label class="ams-field flex">
                <span>Priority</span>
                <input v-model.number="editing.priority" type="number" />
              </label>
            </div>
          </fieldset>

          <fieldset class="ams-fieldset">
            <legend>Look & feel</legend>
            <div class="ams-field-row">
              <label class="ams-field flex">
                <span>Initial state</span>
                <select v-model="editing.initialState">
                  <option value="peek">Peek (slides out partial)</option>
                  <option value="expanded">Expanded (full splash)</option>
                  <option value="tab">Collapsed tab</option>
                </select>
              </label>
              <label class="ams-field flex">
                <span>Position</span>
                <select v-model="editing.position">
                  <option value="right">Right edge</option>
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
            </div>
            <div class="ams-field-row">
              <label class="ams-checkbox-field">
                <input v-model="editing.showQr" type="checkbox" />
                <span>Show QR code</span>
              </label>
              <label class="ams-checkbox-field">
                <input v-model="editing.showFlier" type="checkbox" />
                <span>Show flier download</span>
              </label>
              <label class="ams-checkbox-field">
                <input v-model="editing.audienceSchoolStaffOnly" type="checkbox" />
                <span>School staff only</span>
              </label>
            </div>
          </fieldset>

          <fieldset class="ams-fieldset">
            <legend>PDF flier</legend>
            <div v-if="editing.flierUrl" class="ams-flier-current">
              <a :href="editing.flierUrl" target="_blank" rel="noopener">{{ editing.flierFilename || 'Current flier' }}</a>
              <button type="button" class="btn btn-secondary btn-sm" :disabled="busyKey === 'flier'" @click="removeFlier">Remove</button>
            </div>
            <input
              ref="flierInput"
              type="file"
              accept=".pdf,image/png,image/jpeg"
              :disabled="!editing.id || busyKey === 'flier'"
              @change="onFlierChange"
            />
            <p v-if="!editing.id" class="ams-help">Save the campaign first, then upload a flier.</p>
          </fieldset>

          <fieldset class="ams-fieldset">
            <legend>Schools that see this campaign</legend>
            <p v-if="!schools.length" class="muted">No schools linked to this agency yet.</p>
            <div v-else class="ams-school-list">
              <label v-for="sch in schools" :key="sch.id" class="ams-school-row">
                <input
                  type="checkbox"
                  :checked="schoolEnabled(sch.id)"
                  @change="toggleSchool(sch.id, $event.target.checked)"
                />
                <span>{{ sch.name }}</span>
              </label>
            </div>
            <p class="ams-help">Unchecked schools won't see the toast. Use the per-school "Pause" quick action from a school's overview to opt out without editing here.</p>
          </fieldset>
        </div>

        <footer class="ams-editor-foot">
          <button type="button" class="btn btn-secondary" :disabled="saving" @click="cancelEdit">Cancel</button>
          <button v-if="editing.id" type="button" class="btn btn-danger" :disabled="saving" @click="remove">Delete</button>
          <button type="button" class="btn btn-primary" :disabled="saving || !canSave" @click="save">
            {{ saving ? 'Saving…' : (editing.id ? 'Save changes' : 'Create campaign') }}
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0));

const splashes = ref([]);
const schools = ref([]);
const loading = ref(false);
const saving = ref(false);
const busyKey = ref('');
const editorError = ref('');
const editing = ref(null);
const destinationOptions = ref([]);
const flierInput = ref(null);

const KIND_LABELS = {
  marketing_page: 'Public marketing page',
  event: 'Single event',
  agency_events: 'Agency events page',
  program_events: 'Program events',
  program_enrollment: 'Program enrollment',
  agency_enrollment: 'Agency enrollment'
};
const kindLabel = (k) => KIND_LABELS[k] || k || 'Destination';

const needsDestinationId = computed(() =>
  ['marketing_page', 'event', 'program_events', 'program_enrollment'].includes(editing.value?.destinationKind)
);
const destinationLookupLabel = computed(() => {
  switch (editing.value?.destinationKind) {
    case 'marketing_page': return 'Pick a marketing page';
    case 'event': return 'Pick an event';
    case 'program_events': return 'Pick a program';
    case 'program_enrollment': return 'Pick a program';
    default: return 'Pick';
  }
});
const availableSessions = computed(() => {
  if (editing.value?.destinationKind !== 'program_events') return [];
  const opt = destinationOptions.value.find((o) => o.id === editing.value.destinationId);
  return Array.isArray(opt?.sessions) ? opt.sessions : [];
});
const resolvedDestination = computed(() => editing.value?._resolved || null);

const canSave = computed(() => {
  if (!editing.value) return false;
  if (!editing.value.title) return false;
  if (needsDestinationId.value && !editing.value.destinationId) return false;
  return true;
});

function formatDate(s) {
  try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
}

async function load() {
  if (!agencyId.value) return;
  loading.value = true;
  try {
    const { data } = await api.get(`/agency-marketing-splashes/agencies/${agencyId.value}`);
    splashes.value = data.splashes || [];
    schools.value = data.schools || [];
  } finally {
    loading.value = false;
  }
}

function startNew() {
  editing.value = blankCampaign();
  destinationOptions.value = [];
}

function blankCampaign() {
  return {
    id: null,
    title: '',
    subtitle: '',
    body: '',
    ctaLabel: 'Learn more',
    accentColor: '#4f46e5',
    destinationKind: 'marketing_page',
    destinationId: null,
    destinationSubsetJson: null,
    destinationOverrideUrl: '',
    startsAt: '',
    endsAt: '',
    isActive: false,
    priority: 0,
    initialState: 'peek',
    position: 'right',
    showQr: true,
    showFlier: true,
    reshowAfterHours: 24,
    audienceSchoolStaffOnly: true,
    flierUrl: null,
    flierFilename: null,
    targetSchools: [],
    _enabledSet: new Set()
  };
}

async function select(s) {
  editing.value = hydrateForEdit(s);
  await loadDestinationOptions();
}

function hydrateForEdit(s) {
  const enabled = new Set();
  if (Array.isArray(s.targetSchools) && s.targetSchools.length) {
    for (const t of s.targetSchools) if (t.isEnabled) enabled.add(t.schoolOrganizationId);
  } else {
    for (const sch of schools.value) enabled.add(sch.id);
  }
  return {
    id: s.id,
    title: s.title || '',
    subtitle: s.subtitle || '',
    body: s.body || '',
    ctaLabel: s.ctaLabel || '',
    accentColor: s.accentColor || '#4f46e5',
    destinationKind: s.destination?.kind || 'marketing_page',
    destinationId: s.destination?.id || null,
    destinationSubsetJson: Array.isArray(s.destination?.subsetJson) ? [...s.destination.subsetJson] : null,
    destinationOverrideUrl: s.destination?.overrideUrl || '',
    startsAt: toLocalDt(s.startsAt),
    endsAt: toLocalDt(s.endsAt),
    isActive: !!s.isActive,
    priority: Number(s.priority || 0),
    initialState: s.initialState || 'peek',
    position: s.position || 'right',
    showQr: !!s.showQr,
    showFlier: !!s.showFlier,
    reshowAfterHours: Number(s.reshowAfterHours ?? 24),
    audienceSchoolStaffOnly: !!s.audienceSchoolStaffOnly,
    flierUrl: s.flierUrl,
    flierFilename: s.flierFilename,
    targetSchools: s.targetSchools || [],
    _enabledSet: enabled,
    _resolved: s.destination?.resolved || null
  };
}

function toLocalDt(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

function cancelEdit() {
  editing.value = null;
  editorError.value = '';
  destinationOptions.value = [];
}

async function loadDestinationOptions() {
  destinationOptions.value = [];
  if (!editing.value || !needsDestinationId.value) return;
  try {
    const { data } = await api.get(
      `/agency-marketing-splashes/agencies/${agencyId.value}/destination-options`,
      { params: { kind: editing.value.destinationKind, limit: 50 } }
    );
    destinationOptions.value = data.options || [];
  } catch (_) {
    destinationOptions.value = [];
  }
}

function onKindChange() {
  editing.value.destinationId = null;
  editing.value.destinationSubsetJson = null;
  editing.value._resolved = null;
  loadDestinationOptions();
}

function onDestinationChange() {
  // Try to fetch a single-result lookup so we get sessions for program_events
  if (editing.value?.destinationKind === 'program_events') {
    loadDestinationOptions();
  }
}

function toggleSession(id, checked) {
  const set = new Set(editing.value.destinationSubsetJson || []);
  if (checked) set.add(id); else set.delete(id);
  editing.value.destinationSubsetJson = set.size ? [...set] : null;
}

function schoolEnabled(id) {
  return editing.value?._enabledSet?.has(id);
}
function toggleSchool(id, checked) {
  if (!editing.value) return;
  if (checked) editing.value._enabledSet.add(id);
  else editing.value._enabledSet.delete(id);
  // Trigger reactivity
  editing.value._enabledSet = new Set(editing.value._enabledSet);
}

async function save() {
  if (!editing.value || !canSave.value) return;
  saving.value = true;
  editorError.value = '';
  try {
    const enabledIds = [...editing.value._enabledSet];
    const allEnabled = enabledIds.length === schools.value.length;
    const payload = {
      title: editing.value.title,
      subtitle: editing.value.subtitle || null,
      body: editing.value.body || null,
      ctaLabel: editing.value.ctaLabel || null,
      accentColor: editing.value.accentColor || null,
      destinationKind: editing.value.destinationKind,
      destinationId: editing.value.destinationId || null,
      destinationSubsetJson: editing.value.destinationSubsetJson || null,
      destinationOverrideUrl: editing.value.destinationOverrideUrl || null,
      startsAt: editing.value.startsAt || null,
      endsAt: editing.value.endsAt || null,
      isActive: editing.value.isActive,
      priority: editing.value.priority || 0,
      initialState: editing.value.initialState,
      position: editing.value.position,
      showQr: editing.value.showQr,
      showFlier: editing.value.showFlier,
      reshowAfterHours: editing.value.reshowAfterHours,
      audienceSchoolStaffOnly: editing.value.audienceSchoolStaffOnly,
      targetSchoolIds: allEnabled ? null : enabledIds
    };
    let saved;
    if (editing.value.id) {
      const { data } = await api.patch(
        `/agency-marketing-splashes/agencies/${agencyId.value}/${editing.value.id}`, payload
      );
      saved = data;
    } else {
      const { data } = await api.post(
        `/agency-marketing-splashes/agencies/${agencyId.value}`, payload
      );
      saved = data;
    }
    await load();
    const refreshed = splashes.value.find((s) => s.id === saved.id);
    if (refreshed) await select(refreshed);
  } catch (e) {
    editorError.value = e?.response?.data?.error?.message || 'Failed to save campaign';
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!editing.value?.id) return;
  if (!confirm('Delete this marketing campaign? Any uploaded flier will also be removed.')) return;
  saving.value = true;
  try {
    await api.delete(`/agency-marketing-splashes/agencies/${agencyId.value}/${editing.value.id}`);
    cancelEdit();
    await load();
  } finally {
    saving.value = false;
  }
}

async function toggleActive(s, checked) {
  busyKey.value = `toggle-${s.id}`;
  try {
    await api.patch(`/agency-marketing-splashes/agencies/${agencyId.value}/${s.id}`, {
      isActive: checked
    });
    s.isActive = checked;
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to toggle');
  } finally {
    busyKey.value = '';
  }
}

async function onFlierChange(e) {
  const file = e?.target?.files?.[0];
  if (!file || !editing.value?.id) return;
  busyKey.value = 'flier';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post(
      `/agency-marketing-splashes/agencies/${agencyId.value}/${editing.value.id}/flier`, fd,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    editing.value.flierUrl = data.flierUrl;
    editing.value.flierFilename = data.flierFilename;
    await load();
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Upload failed');
  } finally {
    busyKey.value = '';
    nextTick(() => { if (flierInput.value) flierInput.value.value = ''; });
  }
}

async function removeFlier() {
  if (!editing.value?.id || !confirm('Remove the uploaded flier?')) return;
  busyKey.value = 'flier';
  try {
    await api.delete(`/agency-marketing-splashes/agencies/${agencyId.value}/${editing.value.id}/flier`);
    editing.value.flierUrl = null;
    editing.value.flierFilename = null;
    await load();
  } finally {
    busyKey.value = '';
  }
}

watch(agencyId, () => { load(); });
onMounted(() => { load(); });
</script>

<style scoped>
.ams-page { max-width: 1100px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.ams-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.ams-header h1 { margin: 0; font-size: 24px; }
.ams-header p { margin: 4px 0 0; max-width: 720px; font-size: 13px; }

.ams-empty { padding: 28px; background: #f8fafc; border-radius: 12px; text-align: center; }

.ams-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 960px) {
  .ams-grid { grid-template-columns: 360px 1fr; }
}

.ams-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ams-row {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s;
}
.ams-row:hover { border-color: #cbd5e1; transform: translateY(-1px); box-shadow: 0 4px 10px rgba(15,23,42,.05); }
.ams-row.active { border-color: var(--accent-color, #4f46e5); box-shadow: 0 6px 14px rgba(79,70,229,.12); }
.ams-row-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ams-row-title { display: flex; align-items: center; gap: 8px; }
.ams-row-title strong { font-size: 14px; color: #0f172a; }
.ams-status {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 999px;
}
.ams-status.on { background: #dcfce7; color: #15803d; }
.ams-status.off { background: #f1f5f9; color: #64748b; }
.ams-row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 11px;
  color: #64748b;
}
.ams-row-url {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ams-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
.ams-editor { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.ams-editor-head { display: flex; justify-content: space-between; align-items: center; }
.ams-editor-head h2 { margin: 0; font-size: 18px; }
.ams-close {
  background: none; border: 0; font-size: 22px; cursor: pointer; line-height: 1;
}
.ams-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 10px; font-size: 13px; }

.ams-fields { display: flex; flex-direction: column; gap: 12px; }
.ams-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.ams-field > span { color: #475569; font-weight: 600; }
.ams-field input,
.ams-field textarea,
.ams-field select {
  padding: 7px 9px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
}
.ams-field input[type="color"] { padding: 0; height: 36px; width: 60px; }
.ams-field-row { display: flex; gap: 10px; flex-wrap: wrap; }
.ams-field.flex { flex: 1; min-width: 180px; }
.ams-checkbox-field { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.ams-fieldset {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ams-fieldset legend { padding: 0 6px; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
.ams-subset { display: flex; flex-direction: column; gap: 4px; }
.ams-subset-list { display: flex; flex-wrap: wrap; gap: 6px 14px; max-height: 160px; overflow-y: auto; padding: 4px 0; }
.ams-subset-item { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.ams-resolved {
  font-size: 12px;
  color: #475569;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.ams-resolved a { color: var(--accent-color, #4f46e5); }
.ams-resolved-warn { color: #b91c1c; font-weight: 700; }
.ams-flier-current { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.ams-help { color: #64748b; font-size: 12px; margin: 0; }

.ams-school-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}
.ams-school-row {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f8fafc;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 13px;
}

.ams-editor-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid #f1f5f9;
  padding-top: 10px;
}
.btn-danger { background: #b91c1c; color: white; border: 0; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.muted { color: #64748b; font-size: 13px; }
</style>
