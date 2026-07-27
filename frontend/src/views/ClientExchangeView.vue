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
  max-width: 980px;
  margin: 0 auto;
  padding: 20px 16px 60px;
}
</style>
