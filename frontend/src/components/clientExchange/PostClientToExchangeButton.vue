<template>
  <span v-if="canPost">
    <button type="button" class="btn btn-secondary" @click="open = true">Post to Client Exchange</button>
    <Teleport to="body">
      <div v-if="open && !agencyId" class="exchange-agency-picker">
        <label>Choose an agency
          <select v-model="selected">
            <option value="">Select an agency…</option>
            <option v-for="agency in agencies" :key="agency.id" :value="agency.id">{{ agency.name }}</option>
          </select>
        </label>
        <button type="button" @click="open = false">Cancel</button>
      </div>
      <PostListingModal v-if="open && agencyId" :agency-id="agencyId" :is-backoffice="isBackoffice" @close="open = false" @posted="onPosted" />
    </Teleport>
  </span>
</template>
<script setup>
import { computed, ref } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useClientExchangeAgency } from '../../composables/useClientExchangeAgency';
import { canSeeClientExchangeNav } from '../../utils/clientExchangeNav';
import PostListingModal from './PostListingModal.vue';
const emit = defineEmits(['posted']);
const auth = useAuthStore();
const { agencyId, agencies, selected } = useClientExchangeAgency();
const open = ref(false);
const canPost = computed(() => canSeeClientExchangeNav(auth.user?.role));
const isBackoffice = computed(() => ['admin', 'super_admin', 'support', 'staff'].includes(auth.user?.role));
function onPosted() { open.value = false; emit('posted'); }
</script>
<style scoped>
.exchange-agency-picker { position: fixed; inset: 30% 20% auto; z-index: 10050; padding: 24px; background: var(--bg, white); border: 1px solid var(--border, #ddd); border-radius: 12px; box-shadow: 0 10px 60px #0004; }
</style>
