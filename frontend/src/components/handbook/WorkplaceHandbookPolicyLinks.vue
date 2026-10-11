<template>
  <nav v-if="locations.length" class="policy-locations" aria-label="Current handbook policy locations">
    <strong>Current policy in the handbook</strong>
    <a v-for="location in locations" :key="location.slug" :href="`#handbook-${location.slug}`" @click.prevent="$emit('open', location.slug)">
      <span v-if="location.chapter" class="policy-chapter">{{ location.chapter }}</span>
      <span>{{ location.title }} <span aria-hidden="true">↗</span></span>
    </a>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({ entry: { type: Object, required: true }, sections: { type: Array, default: () => [] } });
defineEmits(['open']);
const locations = computed(() => {
  const bySlug = new Map(props.sections.map(s => [s.slug, s]));
  const slugs = props.entry.policy_section_slugs?.length ? props.entry.policy_section_slugs : [props.entry.handbook_section_slug];
  return [...new Set(slugs)].map(slug => {
    const section = bySlug.get(slug);
    if (!section || section.content_status === 'pending' || !section.body_html) return null;
    const parents = [];
    const seen = new Set([slug]);
    let parent = bySlug.get(section.parent_slug);
    while (parent && !seen.has(parent.slug)) {
      seen.add(parent.slug); parents.unshift(parent.title); parent = bySlug.get(parent.parent_slug);
    }
    return { slug, title: section.title, chapter: parents.join(' › ') };
  }).filter(Boolean);
});
</script>

<style scoped>
.policy-locations { display: grid; gap: 9px; margin: 12px 0; padding: 14px; border: 1px solid #d3dfca; border-radius: 8px; background: #f2f6ec; }
.policy-locations>strong { font-size: 12px; color: #53614b; }.policy-locations a { display: grid; gap: 4px; font-size: 13px; line-height: 1.5; color: #12583f; overflow-wrap: anywhere; text-underline-offset: 3px; }.policy-chapter { font-size: 10px; color: #65745c; }.policy-locations a:focus-visible { outline: 2px solid #12583f; outline-offset: 3px; }
</style>
