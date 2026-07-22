<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-card">
      <header>
        <div>
          <h2>Create from template</h2>
          <p class="muted">Proven lesson formats with editable sample content. Pick one, then customize in Course Builder.</p>
        </div>
        <button type="button" class="btn-icon" @click="$emit('close')">×</button>
      </header>

      <div class="toolbar">
        <input v-model="search" type="search" placeholder="Search templates…" />
        <select v-model="category">
          <option value="">All categories</option>
          <option value="onboarding">Onboarding</option>
          <option value="policy">Policy</option>
          <option value="compliance">Compliance</option>
          <option value="skills">Skills</option>
          <option value="safety">Safety</option>
        </select>
      </div>

      <div v-if="loading" class="state">Loading templates…</div>
      <div v-else-if="error" class="state error">{{ error }}</div>
      <div v-else class="template-grid">
        <article
          v-for="tpl in filtered"
          :key="tpl.id"
          class="template-card"
          :class="{ selected: selectedId === tpl.id }"
          @click="selectedId = tpl.id"
        >
          <div class="format">{{ tpl.formatLabel }}</div>
          <h3>{{ tpl.title }}</h3>
          <p>{{ tpl.description }}</p>
          <div class="meta">
            <span>{{ tpl.lessonCount }} lesson{{ tpl.lessonCount === 1 ? '' : 's' }}</span>
            <span v-if="tpl.estimatedMinutes">~{{ tpl.estimatedMinutes }} min</span>
            <span class="cat">{{ tpl.category }}</span>
          </div>
          <ul v-if="tpl.outline?.length" class="outline">
            <li v-for="(lesson, i) in tpl.outline" :key="i">
              {{ lesson.title }} · {{ lesson.blockCount }} blocks
            </li>
          </ul>
        </article>
      </div>

      <footer>
        <label class="title-field">
          Optional title override
          <input v-model="customTitle" type="text" placeholder="Leave blank to use template title" />
        </label>
        <div class="actions">
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!selectedId || creating"
            @click="create"
          >
            {{ creating ? 'Creating…' : 'Create & open builder' }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  trainingFocusId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'created']);

const loading = ref(true);
const error = ref('');
const templates = ref([]);
const selectedId = ref(null);
const search = ref('');
const category = ref('');
const customTitle = ref('');
const creating = ref(false);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return templates.value.filter((t) => {
    if (category.value && t.category !== category.value) return false;
    if (!q) return true;
    return `${t.title} ${t.description} ${t.formatLabel} ${(t.tags || []).join(' ')}`
      .toLowerCase()
      .includes(q);
  });
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/course-templates', {
      params: props.agencyId ? { agencyId: props.agencyId } : {}
    });
    templates.value = Array.isArray(res.data) ? res.data : [];
    if (templates.value[0]) selectedId.value = templates.value[0].id;
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Failed to load templates';
  } finally {
    loading.value = false;
  }
}

async function create() {
  if (!selectedId.value) return;
  creating.value = true;
  try {
    const res = await api.post(`/course-templates/${selectedId.value}/instantiate`, {
      agencyId: props.agencyId || null,
      trainingFocusId: props.trainingFocusId || null,
      createFocus: !props.trainingFocusId && (templates.value.find((t) => t.id === selectedId.value)?.lessonCount || 0) > 1,
      customTitle: customTitle.value || null
    });
    emit('created', res.data);
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Failed to create from template');
  } finally {
    creating.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 20, 0.45);
  display: grid;
  place-items: center;
  z-index: 1200;
  padding: 20px;
}
.modal-card {
  width: min(960px, 100%);
  max-height: min(90vh, 900px);
  overflow: auto;
  background: var(--bg, #fff);
  border-radius: 16px;
  border: 1px solid var(--border);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
}
header, footer {
  padding: 18px 22px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
footer {
  border-bottom: none;
  border-top: 1px solid var(--border);
  flex-direction: column;
}
header h2 { margin: 0 0 4px; font-family: var(--font-header); }
.btn-icon {
  border: none;
  background: transparent;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
}
.toolbar {
  display: flex;
  gap: 10px;
  padding: 12px 22px;
}
.toolbar input, .toolbar select, .title-field input {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
  background: var(--bg);
}
.toolbar input { flex: 1; }
.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  padding: 8px 22px 18px;
}
.template-card {
  border: 2px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  background: var(--bg-alt, #f7f8f7);
  transition: border-color 0.15s, transform 0.15s;
}
.template-card:hover { border-color: color-mix(in srgb, var(--primary) 45%, var(--border)); }
.template-card.selected {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, white);
}
.format {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--secondary);
  margin-bottom: 6px;
}
.template-card h3 { margin: 0 0 8px; font-size: 1rem; }
.template-card p { margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.4; }
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}
.cat {
  text-transform: capitalize;
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 999px;
}
.outline {
  margin: 10px 0 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}
.state { padding: 40px; text-align: center; }
.state.error { color: var(--error); }
.muted { color: var(--text-secondary); margin: 0; font-size: 13px; }
.title-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}
.actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
