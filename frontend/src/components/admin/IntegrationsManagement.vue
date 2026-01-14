<template>
  <div class="integrations-management">
    <div class="section-header">
      <h2>Integrations</h2>
      <p class="section-description">
        Manage third-party integrations and API connections. This feature is coming soon.
      </p>
    </div>
    
    <div class="placeholder-content">
      <div class="placeholder-icon">🔌</div>
      <h3>Integrations Management</h3>
      <p>This section will allow you to configure and manage integrations with external services, APIs, and webhooks.</p>
      <p class="placeholder-note">Feature coming soon as part of the system overhaul.</p>
    </div>
  </div>
</template>

<script setup>
// Placeholder component for Integrations management
// This will be implemented as part of the system overhaul
</script>

<style scoped>
.integrations-management {
  width: 100%;
}

.section-header {
  margin-bottom: 32px;
}

.section-header h2 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.section-description {
  color: var(--text-secondary);
  margin: 0;
}

.placeholder-content {
  text-align: center;
  padding: 60px 20px;
  background: var(--bg-alt);
  border-radius: 12px;
  border: 2px dashed var(--border);
}

.placeholder-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.placeholder-content h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.placeholder-content p {
  margin: 8px 0;
  color: var(--text-secondary);
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}

.placeholder-note {
  font-style: italic;
  color: var(--text-secondary);
  opacity: 0.8;
}
</style>
