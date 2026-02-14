<template>
  <div class="modal-overlay review-prompt-overlay" @click.self="$emit('close')">
    <div class="modal review-prompt-modal" @click.stop>
      <div class="modal-header">
        <h2>How are we doing?</h2>
        <button class="close" type="button" aria-label="Close" @click="$emit('close')">×</button>
      </div>

      <div class="modal-body">
        <p class="prompt-message">{{ config.message || defaultMessage }}</p>

        <div class="actions">
          <a
            v-if="config.reviewLink"
            :href="config.reviewLink"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-primary"
            @click="onLeaveReview"
          >
            Leave a review on {{ platformLabel }}
          </a>
          <a
            v-if="config.surveyLink && !config.reviewLink"
            :href="config.surveyLink"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-primary"
            @click="onLeaveReview"
          >
            Share feedback
          </a>
          <a
            v-if="config.surveyLink && config.reviewLink"
            :href="config.surveyLink"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-secondary"
            @click="onLeaveReview"
          >
            How are we doing? (Survey)
          </a>

          <div class="secondary-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="onSnooze">
              Remind me later
            </button>
            <button type="button" class="btn btn-secondary btn-sm" @click="onDismiss">
              Dismiss for 30 days
            </button>
          </div>
        </div>

        <p class="hint">
          Your feedback helps us improve. The only way to stop seeing this prompt is to leave a review.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  config: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['close', 'completed', 'snooze', 'dismiss']);

const defaultMessage = 'Do you like our services? We’d love to hear from you. Your feedback helps us serve you better.';

const platformLabel = computed(() => {
  const label = props.config?.platformLabel || '';
  if (label) return label;
  if (props.config?.reviewLink) {
    const url = String(props.config.reviewLink || '').toLowerCase();
    if (url.includes('google')) return 'Google';
    if (url.includes('indeed')) return 'Indeed';
    if (url.includes('yelp')) return 'Yelp';
  }
  return 'our review page';
});

const onLeaveReview = () => {
  emit('completed');
  emit('close');
};

const onSnooze = () => {
  emit('snooze');
  emit('close');
};

const onDismiss = () => {
  emit('dismiss');
  emit('close');
};
</script>

<style scoped>
.review-prompt-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.review-prompt-modal {
  max-width: 420px;
  width: 100%;
}

.prompt-message {
  font-size: 16px;
  line-height: 1.5;
  margin: 0 0 20px;
  color: var(--text-primary);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.actions .btn-primary {
  display: inline-block;
  text-align: center;
  text-decoration: none;
}

.secondary-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}
</style>
