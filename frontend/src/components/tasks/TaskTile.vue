<template>
  <router-link :to="linkTo" class="task-tile">
    <div class="tile-content">
      <h3>{{ title }}</h3>
      <p class="count">{{ count }}</p>
      <p class="subtitle">{{ subtitle }}</p>
    </div>
  </router-link>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  count: {
    type: Number,
    default: 0
  },
  subtitle: {
    type: String,
    default: ''
  },
  linkTo: {
    type: String,
    required: true
  }
});
</script>

<style scoped>
.task-tile {
  display: block;
  background: white;
  border-radius: 12px;
  padding: 32px;
  text-decoration: none;
  color: inherit;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  transition: all 0.2s;
}

.task-tile:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: var(--primary);
}

.tile-content h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
}

.count {
  font-size: 48px;
  font-weight: 700;
  color: var(--primary);
  margin: 0 0 8px 0;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
}
</style>

