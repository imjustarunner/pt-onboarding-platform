<template>
  <Teleport to="body">
    <div
      class="office-skip-splash"
      role="dialog"
      aria-modal="true"
      aria-labelledby="office-skip-splash-title"
      @click="emitContinue"
    >
      <div class="office-skip-splash__card" @click="emitContinue">
        <img
          class="office-skip-splash__art"
          :src="artSrc"
          alt=""
          width="1672"
          height="941"
        />
        <div class="office-skip-splash__footer" @click.stop>
          <p id="office-skip-splash-title" class="office-skip-splash__support">
            {{ supportText }}
          </p>
          <button type="button" class="office-skip-splash__skip" @click.stop="emit('skip-now')">
            <span class="office-skip-splash__skip-label">{{ skipLabel }}</span>
            <span class="office-skip-splash__skip-hint">{{ skipHint }}</span>
          </button>
          <button type="button" class="office-skip-splash__continue" @click.stop="emitContinue">
            {{ continueLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  artSrc: { type: String, default: '/assets/skipnow.png' },
  supportText: {
    type: String,
    default:
      'We noticed you skipped all of the optional inputs and we support you! Your provider will ask these questions during your first session.'
  },
  skipLabel: { type: String, default: 'Skip Now' },
  skipHint: { type: String, default: 'Only show me essential/mandatory info' },
  continueLabel: { type: String, default: 'Continue as normal' }
});

const emit = defineEmits(['skip-now', 'continue-normal']);

function emitContinue() {
  emit('continue-normal');
}
</script>

<style scoped>
.office-skip-splash {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
}

.office-skip-splash__card {
  width: min(720px, 100%);
  max-height: min(92vh, 920px);
  overflow: auto;
  border-radius: 18px;
  background: #f4efe6;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  cursor: default;
}

.office-skip-splash__art {
  display: block;
  width: 100%;
  height: auto;
  vertical-align: top;
}

.office-skip-splash__footer {
  padding: 8px 22px 22px;
  text-align: center;
  background: linear-gradient(180deg, rgba(244, 239, 230, 0) 0%, #f4efe6 18%);
  margin-top: -36px;
  position: relative;
}

.office-skip-splash__support {
  margin: 0 auto 14px;
  max-width: 34rem;
  font-size: 0.95rem;
  line-height: 1.45;
  color: #1a3e4c;
  font-weight: 600;
}

.office-skip-splash__skip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: min(100%, 320px);
  margin: 0 auto 10px;
  padding: 12px 16px;
  border: none;
  border-radius: 12px;
  background: #1a3e4c;
  color: #f8fafc;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(26, 62, 76, 0.28);
}

.office-skip-splash__skip:hover {
  background: #14323d;
}

.office-skip-splash__skip-label {
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.01em;
}

.office-skip-splash__skip-hint {
  font-size: 0.78rem;
  font-weight: 500;
  opacity: 0.88;
  line-height: 1.3;
}

.office-skip-splash__continue {
  display: block;
  width: min(100%, 320px);
  margin: 0 auto;
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid rgba(26, 62, 76, 0.28);
  background: rgba(255, 255, 255, 0.72);
  color: #1a3e4c;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}

.office-skip-splash__continue:hover {
  background: #fff;
}

@media (max-width: 640px) {
  .office-skip-splash {
    padding: 10px;
    align-items: flex-end;
  }
  .office-skip-splash__card {
    border-radius: 16px 16px 10px 10px;
  }
  .office-skip-splash__footer {
    padding: 6px 14px 16px;
    margin-top: -28px;
  }
  .office-skip-splash__support {
    font-size: 0.88rem;
  }
}
</style>
