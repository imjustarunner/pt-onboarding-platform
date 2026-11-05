<template>
  <section v-if="items.length" class="pending-docs" aria-label="Documents waiting for you">
    <h3>Documents waiting for you</h3>
    <ul>
      <li v-for="item in items" :key="item.id">
        <span>{{ item.childName }} · {{ item.label }}</span>
        <router-link :to="item.sessionUrl">Open</router-link>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const items = ref([]);

onMounted(async () => {
  try {
    const { data } = await api.get('/guardian-portal/family-documents');
    items.value = (data.sessions || []).flatMap((session) => session.items || []);
  } catch {
    items.value = [];
  }
});
</script>

<style scoped>
.pending-docs { margin-bottom: 16px; padding: 16px; border: 1px solid #cfe7db; border-radius: 12px; background: #f4faf7; }
ul { list-style: none; padding: 0; }
li { display: flex; justify-content: space-between; gap: 12px; margin: 8px 0; }
a { color: #176b50; }
</style>
