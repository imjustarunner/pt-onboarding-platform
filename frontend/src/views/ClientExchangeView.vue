<template>
  <div class="client-exchange-view">
    <ClientExchangePanel />
  </div>
</template>

<script setup>
import ClientExchangePanel from '../components/clientExchange/ClientExchangePanel.vue';
</script>

<style scoped>
.client-exchange-view {
  padding: 20px 24px 60px;
  max-width: 1600px;
  margin: 0 auto;
}
</style>
