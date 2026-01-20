<template>
  <div class="container">
    <div class="page-header">
      <h1>School Directory Import</h1>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="goBack">Back</button>
      </div>
    </div>

    <BulkSchoolImporter @imported="handleImported" />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import BulkSchoolImporter from '../../components/admin/BulkSchoolImporter.vue';

const router = useRouter();

const goBack = () => {
  router.push('/admin');
};

const handleImported = () => {
  // Keep user on this page; results are shown inline.
};
</script>

