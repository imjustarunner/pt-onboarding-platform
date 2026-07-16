<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Edit tool">
      <div class="modal-header">
        <h3>Edit tool</h3>
        <button type="button" class="close-btn" aria-label="Close" @click="close">✕</button>
      </div>

      <div class="modal-body">
        <label class="field-label" for="te-title">Name</label>
        <input id="te-title" v-model="form.title" type="text" class="form-input" maxlength="120" />

        <label class="field-label" for="te-little">Little name</label>
        <input
          id="te-little"
          v-model="form.littleName"
          type="text"
          class="form-input"
          maxlength="120"
          placeholder="Short subtitle / tagline"
        />

        <label class="field-label" for="te-population">Who it is for</label>
        <input
          id="te-population"
          v-model="form.population"
          type="text"
          class="form-input"
          maxlength="80"
          placeholder="e.g. Adults, Teens, Couples"
        />

        <label class="field-label" for="te-desc">What it is about</label>
        <textarea
          id="te-desc"
          v-model="form.description"
          class="form-input form-textarea"
          rows="4"
          maxlength="600"
        />

        <label class="field-label">Image / icon</label>
        <div class="icon-row">
          <div class="icon-preview" aria-hidden="true">
            <img v-if="form.imageUrl" :src="form.imageUrl" alt="" @error="onPreviewError" />
            <span v-else class="icon-fallback">◇</span>
          </div>
          <div class="icon-controls">
            <input
              v-model="form.imageUrl"
              type="url"
              class="form-input"
              placeholder="Image URL (https://…)"
            />
            <div class="icon-actions">
              <label class="file-btn">
                Upload
                <input type="file" accept="image/*" hidden @change="onFile" />
              </label>
              <button
                v-if="form.imageUrl"
                type="button"
                class="btn btn-secondary"
                @click="form.imageUrl = ''"
              >Clear</button>
            </div>
            <p v-if="fileError" class="err">{{ fileError }}</p>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="!canSave" @click="save">Save</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';

const props = defineProps({
  tool: { type: Object, required: true }
});

const emit = defineEmits(['close', 'save']);

const form = reactive({
  title: '',
  littleName: '',
  population: '',
  description: '',
  imageUrl: ''
});
const fileError = ref('');

function syncFromTool() {
  const t = props.tool || {};
  form.title = String(t.title || t.displayName || '');
  form.littleName = String(t.littleName || '');
  form.population = String(t.population || '');
  form.description = String(t.description || '');
  form.imageUrl = String(t.imageUrl || '');
  fileError.value = '';
}

watch(() => props.tool, syncFromTool, { immediate: true });

const canSave = computed(() => String(form.title || '').trim().length > 0);

function close() {
  emit('close');
}

function onPreviewError(e) {
  // Keep URL in form so user can fix it; hide broken preview via empty src swap
  if (e?.target) e.target.style.display = 'none';
}

function onFile(ev) {
  fileError.value = '';
  const file = ev.target?.files?.[0];
  if (!file) return;
  if (!String(file.type || '').startsWith('image/')) {
    fileError.value = 'Please choose an image file';
    return;
  }
  if (file.size > 600 * 1024) {
    fileError.value = 'Image must be under 600KB for local save';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    form.imageUrl = String(reader.result || '');
  };
  reader.onerror = () => {
    fileError.value = 'Could not read image';
  };
  reader.readAsDataURL(file);
  ev.target.value = '';
}

function save() {
  if (!canSave.value) return;
  emit('save', {
    title: String(form.title || '').trim(),
    littleName: String(form.littleName || '').trim(),
    population: String(form.population || '').trim(),
    description: String(form.description || '').trim(),
    imageUrl: String(form.imageUrl || '').trim()
  });
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 16px;
}
.modal {
  width: min(480px, 100%);
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  max-height: min(90vh, 720px);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
}
.modal-header h3 {
  margin: 0;
  font-size: 1.05rem;
}
.close-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
  color: #64748b;
}
.modal-body {
  padding: 14px 16px;
  overflow-y: auto;
  display: grid;
  gap: 8px;
}
.modal-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e2e8f0;
}
.field-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
  margin-top: 4px;
}
.form-input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 0.92rem;
  box-sizing: border-box;
}
.form-textarea {
  resize: vertical;
  min-height: 88px;
  font-family: inherit;
}
.icon-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.icon-preview {
  flex: 0 0 56px;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.icon-fallback {
  color: #94a3b8;
  font-size: 1.2rem;
}
.icon-controls {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 8px;
}
.icon-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.file-btn {
  display: inline-flex;
  align-items: center;
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
}
.err {
  color: #991b1b;
  font-size: 0.85rem;
  margin: 0;
}
.btn {
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  font-size: 0.88rem;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-primary {
  background: #0f766e;
  color: #fff;
  border-color: #0f766e;
}
.btn-primary:hover:not(:disabled) {
  background: #0d5f59;
}
.btn-secondary {
  background: #fff;
  color: #334155;
  border-color: #cbd5e1;
}
</style>
