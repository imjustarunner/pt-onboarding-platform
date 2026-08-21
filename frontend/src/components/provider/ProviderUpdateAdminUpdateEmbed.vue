<template>
  <div class="au-embed" :class="{ preview: previewMode, editable }">
    <div v-if="loading" class="au-embed-msg">Loading Admin Update…</div>
    <div v-else-if="!available" class="au-embed-msg">
      <strong>No Admin Update selected</strong>
      <p>{{ message || 'Attach an Admin Update (e.g. August 2026) from the list above.' }}</p>
    </div>
    <template v-else>
      <div class="au-embed-bar">
        <div>
          <div class="au-embed-kicker">Admin Update step · same published page as the token link</div>
          <strong>{{ editTitle || title || 'Admin Update' }}</strong>
          <span class="status">{{ status }}</span>
        </div>
        <div class="bar-actions">
          <button v-if="editable && status !== 'sent'" type="button" class="au-link" @click="showEdit = !showEdit">
            {{ showEdit ? 'Hide editor' : 'Edit here' }}
          </button>
          <a v-if="viewUrl && !previewMode" class="au-link" :href="viewUrl" target="_blank" rel="noopener">Open full page →</a>
        </div>
      </div>

      <div v-if="editable && showEdit && status !== 'sent'" class="au-edit">
        <label class="field"><span>Title</span><input v-model="editTitle" class="input" /></label>
        <label class="field"><span>Subtitle</span><input v-model="editSubtitle" class="input" /></label>
        <label class="field"><span>Greeting</span><input v-model="editGreeting" class="input" /></label>
        <label class="field"><span>Intro</span><textarea v-model="editIntro" rows="3" class="input" /></label>
        <div class="row">
          <button type="button" class="au-btn ghost" :disabled="saving" @click="saveEdits">
            {{ saving ? 'Saving…' : 'Apply edits' }}
          </button>
          <a class="au-link" :href="composeHref" target="_blank" rel="noopener">Open full Admin Update composer →</a>
        </div>
        <p v-if="editNote" class="ok">{{ editNote }}</p>
      </div>

      <iframe class="au-embed-frame" title="Admin Update" :srcdoc="pageHtml" />
      <div v-if="!previewMode && !editable" class="au-embed-actions">
        <button type="button" class="au-btn" :disabled="busy" @click="$emit('complete', { adminUpdateId: updateId, viewed: true })">
          {{ busy ? 'Saving…' : 'I’ve reviewed this Admin Update' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const props = defineProps({
  mode: { type: String, default: 'auth' },
  token: { type: String, default: '' },
  agencyId: { type: [Number, String], default: null },
  updateId: { type: [Number, String], default: null },
  previewMode: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
  busy: { type: Boolean, default: false }
});
const emit = defineEmits(['complete', 'updated']);

const route = useRoute();
const loading = ref(false);
const available = ref(false);
const message = ref('');
const title = ref('');
const status = ref('');
const pageHtml = ref('');
const viewUrl = ref('');
const updateId = ref(null);
const showEdit = ref(false);
const saving = ref(false);
const editNote = ref('');
const editTitle = ref('');
const editSubtitle = ref('');
const editGreeting = ref('');
const editIntro = ref('');

const composeHref = computed(() => {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : '';
  const prefix = slug ? `/${slug}` : '';
  return `${prefix}/admin/communications?mode=admin-update`;
});

async function load() {
  loading.value = true;
  available.value = false;
  message.value = '';
  try {
    let res;
    if (props.mode === 'token' && props.token) {
      res = await api.get(
        `/public/provider-update/${encodeURIComponent(props.token)}/admin-update-latest`,
        { skipGlobalLoading: true }
      );
    } else if (props.editable || props.previewMode) {
      res = await api.get('/provider-update/admin-update-latest', {
        params: { agencyId: props.agencyId, updateId: props.updateId || undefined },
        skipGlobalLoading: true
      });
    } else {
      res = await api.get('/provider-update/me/admin-update-latest', {
        params: { agencyId: props.agencyId, updateId: props.updateId || undefined },
        skipGlobalLoading: true
      });
    }
    const data = res.data || {};
    available.value = !!data.available;
    message.value = data.message || '';
    title.value = data.title || '';
    status.value = data.status || '';
    pageHtml.value = data.pageHtml || '';
    viewUrl.value = data.viewUrl || '';
    updateId.value = data.updateId || null;
    const d = data.detail || {};
    editTitle.value = d.title || data.title || '';
    editSubtitle.value = d.subtitle || '';
    editGreeting.value = d.greeting || '';
    editIntro.value = d.intro_html || d.introHtml || '';
  } catch (e) {
    available.value = false;
    message.value = e?.response?.data?.error?.message || 'Could not load Admin Update';
  } finally {
    loading.value = false;
  }
}

async function saveEdits() {
  if (!updateId.value) return;
  saving.value = true;
  editNote.value = '';
  try {
    const res = await api.put(`/provider-update/admin-updates/${updateId.value}`, {
      agencyId: Number(props.agencyId),
      title: editTitle.value,
      subtitle: editSubtitle.value,
      greeting: editGreeting.value,
      introHtml: editIntro.value
    });
    if (res.data?.preview?.pageHtml) pageHtml.value = res.data.preview.pageHtml;
    title.value = editTitle.value;
    editNote.value = 'Edits applied to this Admin Update.';
    emit('updated', res.data);
    await load();
  } catch (e) {
    editNote.value = e?.response?.data?.error?.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
watch(() => [props.agencyId, props.token, props.mode, props.updateId], load);
</script>

<style scoped>
.au-embed {
  display: grid;
  gap: 0;
  background: rgba(226, 232, 240, 0.55);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  overflow: hidden;
  min-height: 420px;
  backdrop-filter: blur(8px);
}
.au-embed.preview { min-height: 520px; }
.au-embed-msg {
  margin: 1.25rem;
  padding: 1.25rem;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 12px;
  color: #334155;
}
.au-embed-bar {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.85rem 1rem;
  background: rgba(255, 255, 255, 0.75);
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(10px);
}
.au-embed-kicker {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.status {
  margin-left: 0.5rem;
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}
.bar-actions { display: flex; gap: 0.75rem; align-items: center; }
.au-edit {
  display: grid;
  gap: 0.55rem;
  padding: 0.85rem 1rem;
  background: rgba(255, 255, 255, 0.82);
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}
.field { display: grid; gap: 0.25rem; font-size: 0.85rem; }
.input, textarea.input {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 10px;
  padding: 0.45rem 0.6rem;
  font: inherit;
  background: rgba(255, 255, 255, 0.9);
}
.row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
.au-embed-frame {
  display: block;
  width: 100%;
  min-height: 480px;
  border: 0;
  background: #e2e8f0;
}
.au-embed.preview .au-embed-frame { min-height: 560px; }
.au-embed-actions {
  padding: 0.75rem 1rem 1rem;
  background: rgba(255, 255, 255, 0.8);
  border-top: 1px solid rgba(15, 23, 42, 0.06);
}
.au-btn {
  border: 0;
  background: linear-gradient(135deg, #3d6b4f, #2f5540);
  color: #fff;
  border-radius: 10px;
  padding: 0.55rem 0.9rem;
  font-weight: 700;
  cursor: pointer;
}
.au-btn.ghost {
  background: rgba(255, 255, 255, 0.9);
  color: #3d6b4f;
  border: 1px solid rgba(61, 107, 79, 0.35);
}
.au-link {
  color: #0f766e;
  font-weight: 700;
  text-decoration: none;
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
}
.ok { color: #3d6b4f; font-size: 0.9rem; }
</style>
