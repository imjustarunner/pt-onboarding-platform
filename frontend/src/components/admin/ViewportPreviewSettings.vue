<template>
  <div class="viewport-preview">
    <h2 class="title">Viewport Preview</h2>
    <p class="subtitle">
      Super Admin only. This constrains the app width and can force hamburger-only navigation to help you
      preview mobile/tablet layouts while working from desktop.
    </p>

    <div class="card">
      <label class="label">Preview as</label>
      <div class="options" role="radiogroup" aria-label="Viewport preview mode">
        <label class="option">
          <input type="radio" name="previewViewport" value="desktop" v-model="viewport" />
          <span class="optionText">Desktop</span>
          <span class="hint">Full layout</span>
        </label>

        <label class="option">
          <input type="radio" name="previewViewport" value="tablet" v-model="viewport" />
          <span class="optionText">Tablet</span>
          <span class="hint">Constrained width + hamburger</span>
        </label>

        <label class="option">
          <input type="radio" name="previewViewport" value="mobile" v-model="viewport" />
          <span class="optionText">Mobile</span>
          <span class="hint">Constrained width + hamburger</span>
        </label>
      </div>

      <div class="row">
        <button class="btn btn-secondary" type="button" @click="resetToDesktop">
          Reset to Desktop
        </button>
        <small class="persistHint">Saved on this device for this browser.</small>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';

const STORAGE_KEY = 'superadminPreviewViewport';

const authStore = useAuthStore();
const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');

const viewport = ref('desktop');

const readStored = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'mobile' || raw === 'tablet' || raw === 'desktop') return raw;
  } catch {
    // ignore
  }
  return 'desktop';
};

const writeStored = (next) => {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore
  }
  // App.vue listens for this to apply immediately.
  window.dispatchEvent(new CustomEvent('superadmin-preview-updated', { detail: { viewport: next } }));
};

onMounted(() => {
  viewport.value = readStored();
});

watch(viewport, (next) => {
  if (!isSuperAdmin.value) return;
  if (next !== 'mobile' && next !== 'tablet' && next !== 'desktop') return;
  writeStored(next);
});

const resetToDesktop = () => {
  viewport.value = 'desktop';
};
</script>

<style scoped>
.viewport-preview {
  max-width: 840px;
}

.title {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 800;
}

.subtitle {
  margin: 0 0 16px 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.card {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--shadow);
}

.label {
  display: block;
  font-weight: 800;
  color: var(--text-primary);
  font-size: 13px;
  margin-bottom: 10px;
}

.options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.option {
  display: grid;
  grid-template-columns: 18px 1fr;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 10px;
  row-gap: 4px;
  padding: 12px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  user-select: none;
  background: #fff;
}

.option input {
  grid-row: 1 / span 2;
}

.optionText {
  font-weight: 800;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.1;
}

.hint {
  grid-column: 2;
  font-size: 12px;
  color: var(--text-secondary);
}

.row {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.persistHint {
  color: var(--text-secondary);
}

@media (max-width: 900px) {
  .options {
    grid-template-columns: 1fr;
  }
}
</style>

