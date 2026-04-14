<template>
  <section class="platform-preview-banner" :class="[`platform-preview-banner--${tone}`]">
    <div class="platform-preview-banner__eyebrow">Platform Preview</div>
    <div class="platform-preview-banner__title">{{ title }}</div>
    <div v-if="subtitle" class="platform-preview-banner__subtitle">{{ subtitle }}</div>
  </section>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: 'Previewing tenant dashboard'
  },
  subtitle: {
    type: String,
    default: ''
  },
  tone: {
    type: String,
    default: 'default'
  }
});
</script>

<style scoped>
.platform-preview-banner {
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(44, 92, 197, 0.18);
  background:
    linear-gradient(135deg, rgba(44, 92, 197, 0.08), rgba(18, 131, 196, 0.12)),
    #ffffff;
  box-shadow: 0 12px 28px rgba(17, 24, 39, 0.08);
}

.platform-preview-banner--warm {
  border-color: rgba(214, 123, 19, 0.2);
  background:
    linear-gradient(135deg, rgba(255, 190, 92, 0.14), rgba(255, 232, 176, 0.24)),
    #ffffff;
}

.platform-preview-banner__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #2c5cc5;
}

.platform-preview-banner__title {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 700;
  color: #14213d;
}

.platform-preview-banner__subtitle {
  margin-top: 4px;
  color: #536277;
  line-height: 1.5;
}
</style>
