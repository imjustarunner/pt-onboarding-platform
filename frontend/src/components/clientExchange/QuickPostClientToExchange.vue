<template>
  <span v-if="eligible || savedListing" class="quick-exchange">
    <button v-if="!savedListing" type="button" class="btn btn-secondary btn-xs" @click.stop="reviewOpen = true">Post to exchange</button>
    <router-link v-else :to="listingLink" @click.stop>Open referral #{{ savedListing.id }}</router-link>
    <span v-if="error" role="alert" class="error">{{ error }}</span>
    <Teleport to="body">
      <PostListingModal v-if="reviewOpen" :agency-id="agencyId" :preset-client-id="Number(client.id)" :preset-client-label="clientLabel" :is-backoffice="true" :lock-client="true" @close="reviewOpen = false" @posted="onPosted" />
    </Teleport>
  </span>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { clientExchangePath } from '../../utils/clientExchangeNav.js';
import PostListingModal from './PostListingModal.vue';
const props = defineProps({ client: { type: Object, required: true } });
const emit = defineEmits(['posted']);
const auth = useAuthStore();
const route = useRoute();
const reviewOpen = ref(false);
const savedListing = ref(null);
const error = ref('');
const agencyId = computed(() => Number(props.client.agency_id || props.client.agencyId));
const clientLabel = computed(() => props.client.full_name || props.client.fullName || props.client.initials || props.client.identifier_code || `Client #${props.client.id}`);
const listingLink = computed(() => ({ path: clientExchangePath(route.params?.organizationSlug), query: { listingId: savedListing.value?.id } }));
const eligible = computed(() => {
  const c = props.client;
  return ['super_admin', 'admin', 'support', 'staff'].includes(auth.user?.role)
    && c.id && (c.agency_id || c.agencyId)
    && !c.provider_id && !c.providerId && !c.providers?.length && !String(c.provider_ids || '').trim()
    && !['ARCHIVED', 'DECLINED'].includes(String(c.status || '').toUpperCase());
});
watch(() => props.client.id, () => { savedListing.value = null; reviewOpen.value = false; error.value = ''; });
function onPosted(listing) {
  reviewOpen.value = false;
  savedListing.value = listing;
  error.value = listing?.notifications?.failed ? 'Posted, but some notification emails could not be sent.' : '';
  emit('posted', listing);
}
</script>
<style scoped>
.quick-exchange { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.error { display: block; max-width: 260px; white-space: normal; }
</style>
