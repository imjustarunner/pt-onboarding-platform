<template>
  <img
    class="lbw-cat-icon"
    :src="src"
    :alt="alt"
    draggable="false"
    @error="onError"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { iconSlugForCategory, lifeBalanceIconUrl } from '../../utils/lifeBalanceIcons.js';

const props = defineProps({
  /** category object { key, icon } or icon slug string */
  category: { type: [Object, String], default: null },
  name: { type: String, default: '' },
  alt: { type: String, default: '' }
});

const failed = ref(false);

const slug = computed(() => {
  if (props.category) return iconSlugForCategory(typeof props.category === 'string' ? { icon: props.category } : props.category);
  if (props.name) return iconSlugForCategory({ icon: props.name, key: props.name });
  return 'health';
});

const src = computed(() => {
  if (failed.value) return lifeBalanceIconUrl('health');
  return lifeBalanceIconUrl(slug.value);
});

watch(slug, () => {
  failed.value = false;
});

function onError() {
  failed.value = true;
}
</script>

<style scoped>
.lbw-cat-icon {
  width: 1em;
  height: 1em;
  display: block;
  object-fit: contain;
  flex-shrink: 0;
  pointer-events: none;
  user-select: none;
}
</style>
