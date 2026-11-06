<template>
  <section v-if="waiting.length" class="release-banner" role="status" aria-label="School release waiting">
    <div>
      <strong>A school release is waiting in your documents.</strong>
      <p v-for="item in waiting" :key="item.clientId">{{ item.childName }} · {{ item.schoolName || 'Current school' }}</p>
    </div>
    <button v-for="item in waiting" :key="`open-${item.clientId}`" type="button" @click="$emit('open', item.clientId)">Open documents</button>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  people: { type: Array, default: () => [] }
});
defineEmits(['open']);

const waiting = ref([]);
let ticket = 0;

async function load() {
  const current = ++ticket;
  const people = (props.people || []).filter((person) => Number(person.clientId));
  if (!people.length) {
    waiting.value = [];
    return;
  }
  const results = await Promise.all(people.map(async (person) => {
    try {
      const { data } = await api.get(`/guardian-portal/clients/${person.clientId}/school-release`);
      if (!data?.ready) return null;
      return {
        clientId: Number(person.clientId),
        childName: person.childName || 'Your child',
        schoolName: data.schoolName || person.schoolName || ''
      };
    } catch {
      return null;
    }
  }));
  if (current !== ticket) return;
  waiting.value = results.filter(Boolean);
}

watch(() => (props.people || []).map((person) => Number(person.clientId)).join(','), load, { immediate: true });
</script>

<style scoped>
.release-banner { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin: 0 0 16px; padding: 16px 18px; border: 1px solid #e6c98a; border-radius: 12px; background: #fff8e8; color: #3d2e10; }
.release-banner strong { display: block; margin-bottom: 4px; }
.release-banner p { margin: 2px 0; }
.release-banner button { border: 0; border-radius: 8px; background: #176b50; color: #fff; padding: 10px 14px; cursor: pointer; }
</style>
