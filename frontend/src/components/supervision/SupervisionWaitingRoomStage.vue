<template>
  <div class="swr" :class="{ 'swr--pip': pip }">
    <video class="swr__bg" autoplay muted loop playsinline>
      <source src="/assets/video/waiting-room.mp4" type="video/mp4" />
    </video>
    <div class="swr__shade" aria-hidden="true" />
    <div v-if="!pip" class="swr__overlay">
      <p class="swr__kicker">Waiting Room</p>
      <h2>Welcome to the Waiting Room</h2>
      <p class="swr__sub">We’re here for you. Your supervisor will admit you shortly.</p>
      <div class="swr__cards">
        <div class="swr__card">
          <strong>You are in the waiting room</strong>
          <span>Your privacy and care are our priority.</span>
        </div>
        <div class="swr__card swr__card--status">
          <div class="swr__status-row">
            <span>Waiting Room Status</span>
            <span class="swr__pill">Standing by</span>
          </div>
          <p class="swr__status-copy">You’ll join the live session as soon as you’re admitted.</p>
        </div>
      </div>
      <p class="swr__hint">Tap your video preview to prioritize your camera.</p>
    </div>
    <button
      v-else
      type="button"
      class="swr__thumb"
      title="Show waiting room"
      @click="$emit('show-waiting-room')"
    >
      <video autoplay muted loop playsinline>
        <source src="/assets/video/waiting-room.mp4" type="video/mp4" />
      </video>
      <span>Waiting room</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  pip: { type: Boolean, default: false }
});
defineEmits(['show-waiting-room']);
</script>

<style scoped>
.swr {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.swr--pip {
  inset: auto;
  right: 14px;
  bottom: 72px;
  width: min(34%, 220px);
  height: auto;
  aspect-ratio: 16 / 10;
  border-radius: 12px;
  overflow: hidden;
  z-index: 4;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  border: 2px solid rgba(255, 255, 255, 0.35);
}
.swr__bg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.swr__shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(8, 20, 16, 0.28) 0%, rgba(8, 20, 16, 0.55) 45%, rgba(8, 20, 16, 0.78) 100%);
}
.swr__overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: clamp(18px, 4vw, 36px);
  max-width: 560px;
}
.swr__kicker {
  margin: 0 0 6px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(220, 245, 230, 0.9);
}
.swr__overlay h2 {
  margin: 0 0 8px;
  font-size: clamp(1.45rem, 3vw, 2rem);
  line-height: 1.15;
  color: #f4faf6;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.35);
}
.swr__sub {
  margin: 0 0 16px;
  color: rgba(236, 245, 238, 0.92);
  font-size: 0.98rem;
  max-width: 36ch;
}
.swr__cards {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}
.swr__card {
  background: rgba(255, 255, 255, 0.92);
  color: #134e3a;
  border-radius: 18px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.swr__card strong { font-size: 0.98rem; }
.swr__card span,
.swr__status-copy {
  margin: 0;
  font-size: 0.86rem;
  color: #3f6b58;
  line-height: 1.35;
}
.swr__status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 0.9rem;
}
.swr__pill {
  background: #dcfce7;
  color: #166534;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.75rem;
  font-weight: 700;
}
.swr__hint {
  margin: 0;
  font-size: 0.8rem;
  color: rgba(226, 240, 230, 0.85);
}
.swr__thumb {
  position: relative;
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
  cursor: pointer;
  background: #0b1210;
  color: #fff;
}
.swr__thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.swr__thumb span {
  position: absolute;
  left: 8px;
  bottom: 8px;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.72rem;
  font-weight: 700;
}
@media (max-width: 900px) {
  .swr--pip {
    width: min(46%, 180px);
    right: 10px;
    bottom: 10px;
  }
  .swr__overlay {
    max-width: none;
    padding: 14px;
  }
  .swr__overlay h2 { font-size: 1.35rem; }
}
</style>
