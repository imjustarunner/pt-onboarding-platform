<template>
  <section class="handbook-locations" aria-label="Where to find this change in the handbook">
    <h4>Where to find this in the Workplace Handbook</h4>
    <p v-if="!entry.handbook_locations?.length" class="location-note">An exact handbook section has not been linked yet. This change is communicated here; ask People Operations if you need its handbook location.</p>
    <template v-else>
      <p class="location-note">Select a section below to read the handbook text. Your update stays open.</p>
      <component v-for="group in locationGroups" :key="group.key" :is="group.related ? 'details' : 'div'" class="location-group">
      <summary v-if="group.related" class="related-summary">Related handbook sections ({{ group.locations.length }})</summary>
      <details v-for="location in group.locations" :key="location.slug" class="handbook-location">
        <summary :aria-controls="`handbook-location-${entry.id}-${location.slug}`">
          <span>{{ location.path || location.title }}</span>
          <span class="location-action">Read handbook section</span>
        </summary>
        <div :id="`handbook-location-${entry.id}-${location.slug}`" class="location-content">
          <p class="location-source">{{ location.sourceLabel }}<template v-if="location.sourcePage"> · Original page {{ location.sourcePage }}</template></p>
          <h4>{{ location.title }}</h4>
          <div class="policy-text" v-html="sanitize(location.bodyHtml)" />
        </div>
      </details>
      </component>
      <p v-if="entry.handbook_location_status === 'partial'" class="location-note">Some related sections are still awaiting handbook text or an updated link.</p>
    </template>
  </section>
</template>
<script setup>
import DOMPurify from 'dompurify';
import { computed } from 'vue';
const props = defineProps({ entry: { type: Object, required: true } });
const locationGroups = computed(() => {
  const locations = props.entry.handbook_locations || [];
  return [{ key: 'primary', related: false, locations: locations.slice(0, 1) },
    ...(locations.length > 1 ? [{ key: 'related', related: true, locations: locations.slice(1) }] : [])];
});
const sanitize = html => DOMPurify.sanitize(html || '');
</script>
<style scoped>
.handbook-locations { margin: 16px 0; padding: 16px; border: 1px solid #c8ded4; border-radius: 12px; background: #f0f7f3; }
.handbook-locations h4 { margin: 0 0 8px; color: #244d3e; }
.location-note, .location-source { font-size: 13px; line-height: 1.5; color: #52685e; margin: 8px 0; }
.handbook-location { margin-top: 10px; background: white; border: 1px solid #c8ded4; border-radius: 8px; }
.handbook-location summary { cursor: pointer; padding: 12px; color: #24583f; line-height: 1.5; overflow-wrap: anywhere; }
.handbook-location summary:focus-visible { outline: 3px solid #24583f; outline-offset: 2px; }
.location-action { display: block; margin-top: 4px; font-size: 13px; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
.related-summary { cursor: pointer; padding: 12px 0 4px; font-size: 13px; color: #24583f; font-weight: 600; }
.location-content { padding: 4px 16px 16px; overflow-x: auto; }
.policy-text { line-height: 1.65; overflow-wrap: anywhere; }
.policy-text :deep(table) { border-collapse: collapse; width: 100%; }
.policy-text :deep(th), .policy-text :deep(td) { padding: 8px; border: 1px solid #d4ded8; text-align: left; }
</style>
