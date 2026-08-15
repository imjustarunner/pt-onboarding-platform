<template>
  <div class="link-image">
    <span class="link-image-label">Link image</span>
    <p class="link-image-help">
      This is the picture people see when this page is texted or shared.
      Use <strong>1200 × 630 px</strong> PNG or JPG (1.91:1), under 5 MB.
      Put your logo and the page name (for example “ITSCO Support”) in the center — iMessage crops the edges.
    </p>
    <div class="link-image-row">
      <img v-if="previewUrl" :src="previewUrl" alt="Link preview" class="link-image-thumb" />
      <div class="link-image-actions">
        <label class="link-image-btn">
          {{ previewUrl ? 'Replace image' : 'Upload image' }}
          <input type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" @change="onFile" />
        </label>
        <button v-if="custom" type="button" class="link-image-btn" :disabled="busy" @click="remove">
          Remove
        </button>
      </div>
    </div>
    <p v-if="hint" class="link-image-hint">{{ hint }}</p>
    <p v-if="error" class="link-image-error">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencySlug: { type: String, required: true },
  page: { type: String, required: true }
});

const imageUrl = ref('');
const custom = ref(false);
const busy = ref(false);
const error = ref('');
const hint = ref('');
const localPreview = ref('');

const previewUrl = computed(() => localPreview.value || imageUrl.value);

function apply(data) {
  imageUrl.value = data?.imageUrl || '';
  custom.value = !!data?.custom;
}

onMounted(async () => {
  if (!props.agencySlug) return;
  try {
    const { data } = await api.get(`/public/share-preview/${encodeURIComponent(props.agencySlug)}`, {
      params: { page: props.page },
      skipGlobalLoading: true
    });
    apply(data);
  } catch {
    /* keep empty until upload */
  }
});

async function onFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  error.value = '';
  hint.value = '';
  if (file.size > 5 * 1024 * 1024) {
    error.value = 'Keep the image under 5 MB.';
    return;
  }
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (bitmap) {
    if (bitmap.width < 600 || bitmap.height < 315) {
      hint.value = `This is ${bitmap.width}×${bitmap.height}. 1200×630 looks best in iMessage.`;
    } else if (Math.abs(bitmap.width / bitmap.height - 1.91) > 0.25) {
      hint.value = `This is ${bitmap.width}×${bitmap.height}. 1200×630 (wide landscape) is the size iMessage expects.`;
    }
    bitmap.close?.();
  }
  if (localPreview.value) URL.revokeObjectURL(localPreview.value);
  localPreview.value = URL.createObjectURL(file);
  busy.value = true;
  try {
    const body = new FormData();
    body.append('image', file);
    body.append('page', props.page);
    const { data } = await api.post(
      `/public/share-preview/${encodeURIComponent(props.agencySlug)}/image`,
      body,
      { skipGlobalLoading: true }
    );
    apply(data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to save that image.';
  } finally {
    busy.value = false;
  }
}

async function remove() {
  busy.value = true;
  error.value = '';
  try {
    const { data } = await api.delete(
      `/public/share-preview/${encodeURIComponent(props.agencySlug)}/image`,
      { params: { page: props.page }, skipGlobalLoading: true }
    );
    if (localPreview.value) URL.revokeObjectURL(localPreview.value);
    localPreview.value = '';
    apply(data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to remove that image.';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.link-image {
  display: grid;
  gap: 0.4rem;
  margin-top: 0.75rem;
  padding: 0.75rem;
  border: 1px dashed #c5d5cc;
  border-radius: 12px;
  background: #f7faf8;
}
.link-image-label { font-size: 0.82rem; font-weight: 800; }
.link-image-help { margin: 0; font-size: 0.78rem; line-height: 1.4; color: #4b5563; font-weight: 500; }
.link-image-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
.link-image-thumb {
  width: 160px;
  height: 84px;
  object-fit: cover;
  border-radius: 8px;
  background: #e5efe9;
}
.link-image-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.link-image-btn {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  border: 1px solid #c5d5cc;
  background: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.link-image-btn input { display: none; }
.link-image-hint { margin: 0; font-size: 0.76rem; color: #9a3412; }
.link-image-error { margin: 0; font-size: 0.76rem; color: #b42318; }
</style>
