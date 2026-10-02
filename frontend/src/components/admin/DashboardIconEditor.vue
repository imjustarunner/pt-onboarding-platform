<template>
  <button v-if="canEdit" ref="trigger" type="button" class="dashboard-icon-edit"
    :title="`Edit ${label} icon`" :aria-label="`Edit ${label} icon`" @click.stop.prevent="open">
    <span aria-hidden="true">✎</span>
  </button>
  <Teleport to="body">
    <div v-if="editing" class="dashboard-icon-overlay" @click.self="close" @keydown.esc.stop="close">
      <section ref="panel" class="dashboard-icon-dialog" role="dialog" aria-modal="true"
        :aria-label="`Edit ${label} icon`" tabindex="-1" @keydown.tab="trapFocus">
        <h2>Edit {{ label }} icon</h2>
        <p v-if="editingOrg.isPlatform">Applies to the {{ editingOrg.name }} platform dashboard.</p>
        <p v-else>Applies to {{ editingOrg.name }} for everyone using this dashboard.</p>
        <img v-if="currentUrl" :src="currentUrl" alt="Current icon" class="current-icon" />
        <fieldset :disabled="busy">
          <legend>Choose a replacement</legend>
          <IconSelector v-model="selectedId" :default-agency-id="editingOrg.id" />
          <label class="upload-label">Upload a new icon (SVG, PNG or JPG, up to 2 MB)
            <input type="file" accept="image/svg+xml,image/png,image/jpeg" @change="upload" />
          </label>
          <button type="button" class="btn btn-secondary" @click="selectedId = null; changed = true">Use original / inherited icon</button>
        </fieldset>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <p v-if="busy" role="status">{{ uploading ? 'Uploading…' : 'Saving…' }}</p>
        <footer>
          <button type="button" class="btn btn-secondary" :disabled="busy" @click="close">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="busy || !changed" @click="save">Save icon</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import IconSelector from './IconSelector.vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import api from '../../services/api';

const props = defineProps({
  surface: { type: String, default: 'dashboard' },
  iconKey: { type: String, required: true },
  label: { type: String, required: true },
  currentUrl: { type: String, default: null },
  disabled: Boolean
});
const auth = useAuthStore();
const agencies = useAgencyStore();
const branding = useBrandingStore();
const canEdit = computed(() => !props.disabled && auth.user?.role === 'super_admin' && !!branding.dashboardIconEditingTarget);
const trigger = ref(null);
const panel = ref(null);
const editing = ref(false);
const editingOrg = ref(null);
const selectedId = ref(null);
const changed = ref(false);
const busy = ref(false);
const uploading = ref(false);
const error = ref('');
watch(selectedId, () => { changed.value = true; });

async function open() {
  if (!canEdit.value) return;
  // Capture the destination so an asynchronous save cannot follow a tenant switch.
  editingOrg.value = { ...branding.dashboardIconEditingTarget };
  selectedId.value = branding.getDashboardIconOverrideId(props.surface, props.iconKey, editingOrg.value.isPlatform ? null : editingOrg.value);
  error.value = '';
  editing.value = true;
  await nextTick();
  changed.value = false;
  panel.value?.focus();
}
function close() {
  if (busy.value) return;
  editing.value = false;
  nextTick(() => trigger.value?.focus());
}
function trapFocus(event) {
  const items = [...panel.value.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
  const first = items[0];
  const last = items.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first?.focus();
  }
}
async function upload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  error.value = '';
  if (!['image/svg+xml', 'image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    error.value = 'Choose an SVG, PNG or JPG file no larger than 2 MB.';
    event.target.value = '';
    return;
  }
  busy.value = uploading.value = true;
  try {
    const data = new FormData();
    data.append('icon', file);
    data.append('name', file.name.replace(/\.[^.]+$/, '').slice(0, 255) || props.label);
    data.append('agencyId', editingOrg.value.isPlatform ? 'null' : String(editingOrg.value.id));
    const response = await api.post('/icons/upload', data);
    selectedId.value = Number(response.data.id);
    if (response.data.file_path) branding.iconFilePathCache[String(selectedId.value)] = response.data.file_path;
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Could not upload the icon. Please try again.';
  } finally {
    busy.value = uploading.value = false;
    event.target.value = '';
  }
}
async function save() {
  if (!canEdit.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const url = editingOrg.value.isPlatform ? '/platform-branding/dashboard-icons' : `/agencies/${editingOrg.value.id}/dashboard-icons`;
    const response = await api.put(url, {
      surface: props.surface, key: props.iconKey, iconId: selectedId.value == null ? null : Number(selectedId.value)
    });
    if (editingOrg.value.isPlatform) await branding.setPlatformBrandingFromResponse(response.data);
    else agencies.applyBrandingResponse(response.data);
    if (selectedId.value) await branding.prefetchIconIds([selectedId.value]);
    editing.value = false;
    nextTick(() => trigger.value?.focus());
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Could not save the icon. Your previous icon is unchanged.';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.dashboard-icon-edit { position: absolute; z-index: 2; top: 50%; left: 14px; transform: translateY(-50%); width: 34px; height: 34px; padding: 0; border: 1px solid transparent; border-radius: 9px; background: transparent; cursor: pointer; }
.dashboard-icon-edit span { position: absolute; right: -5px; bottom: -5px; font-size: 12px; line-height: 16px; width: 16px; border-radius: 50%; background: var(--primary); color: white; }
.dashboard-icon-edit:hover, .dashboard-icon-edit:focus-visible { border-color: var(--primary); outline: 2px solid var(--primary); outline-offset: 2px; }
.dashboard-icon-overlay { position: fixed; inset: 0; z-index: 1900; display: grid; place-items: center; padding: 20px; background: #0008; }
.dashboard-icon-dialog { width: min(520px, 100%); max-height: 85vh; overflow-y: auto; padding: 24px; border-radius: 16px; background: var(--bg, white); color: var(--text-primary); box-shadow: 0 20px 70px #0004; }
h2 { margin: 0 0 8px; font-size: 22px; }
p { line-height: 1.5; }
fieldset { border: 0; padding: 0; margin: 20px 0; display: grid; gap: 18px; }
legend { font-weight: 600; margin-bottom: 12px; }
.current-icon { width: 48px; height: 48px; object-fit: contain; }
.upload-label { display: grid; gap: 8px; font-size: 14px; }
footer { display: flex; justify-content: flex-end; gap: 12px; }
.error { color: var(--error, #b91c1c); }
</style>
