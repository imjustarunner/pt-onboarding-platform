<template>
  <div class="lib-settings">
    <header class="lib-settings__header">
      <div>
        <h1>Library Settings</h1>
        <p>Manage categories and review archived resources for your organization.</p>
      </div>
      <router-link class="btn btn-secondary" :to="libraryPath">Back to Library</router-link>
    </header>

    <section class="lib-settings__card">
      <h2>Categories</h2>
      <p v-if="loading">Loading…</p>
      <p v-else-if="error" class="lib-settings__error">{{ error }}</p>
      <ul v-else class="lib-settings__list">
        <li v-for="c in categories" :key="c.id">
          <input v-model="c._name" class="lib-settings__input" />
          <button type="button" class="btn btn-secondary btn-sm" @click="saveCategory(c)">Save</button>
        </li>
      </ul>
    </section>

    <section class="lib-settings__card">
      <h2>Archived resources</h2>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loadingArchived" @click="loadArchived">
        {{ loadingArchived ? 'Loading…' : 'Refresh archived' }}
      </button>
      <ul v-if="archived.length" class="lib-settings__archived">
        <li v-for="r in archived" :key="r.id">
          <span>{{ r.name }}</span>
          <button type="button" class="btn btn-secondary btn-sm" @click="restore(r)">Restore</button>
        </li>
      </ul>
      <p v-else class="lib-settings__muted">No archived resources.</p>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  fetchLibraryCategories,
  updateLibraryCategory,
  fetchLibraryResources,
  updateLibraryResource
} from '../../services/library.js';

const route = useRoute();
const loading = ref(true);
const loadingArchived = ref(false);
const error = ref('');
const categories = ref([]);
const archived = ref([]);

const orgSlug = computed(() => route.params.organizationSlug || '');
const libraryPath = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/library` : '/library'
);

async function loadCategories() {
  loading.value = true;
  error.value = '';
  try {
    const list = await fetchLibraryCategories();
    categories.value = (list || []).map((c) => ({ ...c, _name: c.name }));
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
}

async function saveCategory(c) {
  await updateLibraryCategory(c.id, { name: c._name });
  c.name = c._name;
}

async function loadArchived() {
  loadingArchived.value = true;
  try {
    const all = await fetchLibraryResources({ includeArchived: '1', limit: 200 });
    archived.value = (all || []).filter((r) => r.archivedAt);
  } catch {
    archived.value = [];
  } finally {
    loadingArchived.value = false;
  }
}

async function restore(r) {
  await updateLibraryResource(r.id, { archived: false, status: 'current' });
  await loadArchived();
}

onMounted(async () => {
  await loadCategories();
  await loadArchived();
});
</script>

<style scoped>
.lib-settings {
  max-width: 800px;
  margin: 0 auto;
  padding: 1.25rem 1.25rem 3rem;
}

.lib-settings__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.lib-settings__header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.lib-settings__header p {
  margin: 0.35rem 0 0;
  color: #64748b;
}

.lib-settings__card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.lib-settings__card h2 {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
}

.lib-settings__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.lib-settings__list li {
  display: flex;
  gap: 0.5rem;
}

.lib-settings__input {
  flex: 1;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.45rem 0.65rem;
}

.lib-settings__archived {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
}

.lib-settings__archived li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.45rem 0;
  border-top: 1px solid #f1f5f9;
  font-size: 0.9rem;
}

.lib-settings__muted {
  color: #94a3b8;
  font-size: 0.875rem;
}

.lib-settings__error {
  color: #b91c1c;
}
</style>
