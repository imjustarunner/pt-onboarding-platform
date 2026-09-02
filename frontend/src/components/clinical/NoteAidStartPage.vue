<template>
  <div class="na-start">
    <div class="na-start-pill">
      <span class="na-start-pill-icon" aria-hidden="true">👤</span>
      Client: {{ clientLabel }}
    </div>

    <div class="na-start-hero">
      <div class="na-start-icon" aria-hidden="true">✨</div>
      <h1>No note selected</h1>
      <p>Select a note from the library, open a to-do from the work queue, or create a new note to begin.</p>
    </div>

    <div class="na-start-actions">
      <button type="button" class="na-start-btn na-start-btn--primary" @click="$emit('create')">
        <span class="na-start-btn-icon" aria-hidden="true">+</span>
        <span class="na-start-btn-text">
          <strong>Create New Note</strong>
          <em>Start a new note</em>
        </span>
      </button>
      <button
        type="button"
        class="na-start-btn"
        :disabled="!hasNextInProgress"
        @click="$emit('next-in-progress')"
      >
        <span class="na-start-btn-icon" aria-hidden="true">📄</span>
        <span class="na-start-btn-text">
          <strong>Select next in progress</strong>
          <em>{{ hasNextInProgress ? 'Continue an in-progress note' : 'No in-progress notes' }}</em>
        </span>
      </button>
      <button
        type="button"
        class="na-start-btn"
        :disabled="!hasNextInQueue"
        @click="$emit('next-in-queue')"
      >
        <span class="na-start-btn-icon" aria-hidden="true">☑</span>
        <span class="na-start-btn-text">
          <strong>Open next work queue item</strong>
          <em>{{ hasNextInQueue ? 'Work from your to-do list' : 'Queue is empty' }}</em>
        </span>
      </button>
    </div>

    <div class="na-start-ways">
      <h2>Ways to begin</h2>
      <div class="na-start-ways-grid">
        <button type="button" class="na-start-way" @click="$emit('create')">
          <span aria-hidden="true">+</span>
          <div>
            <strong>Create new note</strong>
            <em>Start a fresh note</em>
          </div>
        </button>
        <button
          type="button"
          class="na-start-way"
          :disabled="!hasNextInProgress"
          @click="$emit('next-in-progress')"
        >
          <span aria-hidden="true">📄</span>
          <div>
            <strong>Resume draft</strong>
            <em>Continue an in-progress note</em>
          </div>
        </button>
        <button
          type="button"
          class="na-start-way"
          :disabled="!hasNextInQueue"
          @click="$emit('next-in-queue')"
        >
          <span aria-hidden="true">✓</span>
          <div>
            <strong>Use a to-do item</strong>
            <em>Open from your work queue</em>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  clientLabel: { type: String, default: 'none selected' },
  hasNextInProgress: { type: Boolean, default: false },
  hasNextInQueue: { type: Boolean, default: false }
});

defineEmits(['create', 'next-in-progress', 'next-in-queue']);
</script>

<style scoped>
.na-start {
  max-width: 920px;
  margin: 0 auto;
  padding: 32px 24px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
}

.na-start-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  background: #f0fdfa;
  border: 1px solid #99f6e4;
  color: #0f766e;
  font-size: 0.88rem;
  font-weight: 600;
}

.na-start-hero {
  text-align: center;
  max-width: 520px;
}

.na-start-icon {
  font-size: 2rem;
  margin-bottom: 8px;
}

.na-start-hero h1 {
  margin: 0 0 10px;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.na-start-hero p {
  margin: 0;
  color: var(--na-muted, #64748b);
  line-height: 1.5;
}

.na-start-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  width: 100%;
}

.na-start-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 18px 16px;
  border-radius: 14px;
  border: 1px solid var(--na-border, #e2e8f0);
  background: white;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.na-start-btn:hover:not(:disabled) {
  border-color: #5eead4;
  box-shadow: 0 4px 14px rgba(15, 118, 110, 0.08);
}

.na-start-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.na-start-btn--primary {
  background: var(--na-teal, #0d9488);
  border-color: var(--na-teal, #0d9488);
  color: white;
}

.na-start-btn--primary:hover:not(:disabled) {
  background: var(--na-teal-dark, #0f766e);
  border-color: var(--na-teal-dark, #0f766e);
}

.na-start-btn--primary .na-start-btn-text em {
  color: rgba(255, 255, 255, 0.85);
}

.na-start-btn-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.na-start-btn-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.na-start-btn-text strong {
  font-size: 0.95rem;
}

.na-start-btn-text em {
  font-style: normal;
  font-size: 0.8rem;
  color: var(--na-muted, #64748b);
  font-weight: 500;
}

.na-start-ways {
  width: 100%;
  padding-top: 8px;
}

.na-start-ways h2 {
  margin: 0 0 12px;
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--na-muted, #64748b);
}

.na-start-ways-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.na-start-way {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--na-border, #e2e8f0);
  background: #fafafa;
  cursor: pointer;
  text-align: left;
}

.na-start-way:hover:not(:disabled) {
  border-color: #99f6e4;
  background: #f0fdfa;
}

.na-start-way:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.na-start-way span:first-child {
  font-size: 1.1rem;
}

.na-start-way strong {
  display: block;
  font-size: 0.88rem;
}

.na-start-way em {
  display: block;
  font-style: normal;
  font-size: 0.78rem;
  color: var(--na-muted, #64748b);
}

@media (max-width: 860px) {
  .na-start-actions,
  .na-start-ways-grid {
    grid-template-columns: 1fr;
  }
}
</style>
