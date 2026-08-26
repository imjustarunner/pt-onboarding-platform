<template>
  <section v-if="visible" class="na-session-strip" aria-label="Session documentation context">
    <div class="na-session-strip__grid">
      <div>
        <span class="lbl">Clinician</span>
        <strong>{{ clinicianLabel || '—' }}</strong>
      </div>
      <div>
        <span class="lbl">Patient</span>
        <strong>{{ patientLabel || '—' }}</strong>
        <span v-if="patientDob" class="sub">DOB {{ patientDob }}</span>
      </div>
      <div>
        <span class="lbl">Date &amp; time</span>
        <strong>{{ dateTimeLabel || '—' }}</strong>
      </div>
      <div>
        <span class="lbl">Duration (min)</span>
        <input
          type="number"
          min="1"
          max="240"
          class="na-session-strip__input"
          :value="durationMinutes"
          @change="$emit('update:durationMinutes', Number($event.target.value) || null)"
        />
      </div>
      <div>
        <span class="lbl">Service code</span>
        <strong>{{ serviceCode || '—' }}</strong>
      </div>
      <div>
        <span class="lbl">Location</span>
        <strong>{{ locationLabel || '—' }}</strong>
      </div>
      <div class="na-session-strip__participants">
        <span class="lbl">Participants</span>
        <select
          class="na-session-strip__select"
          :value="participants"
          @change="$emit('update:participants', $event.target.value)"
        >
          <option value="Client Only">Client Only</option>
          <option value="Client + Family">Client + Family</option>
          <option value="Client + Other">Client + Other</option>
          <option value="Collateral">Collateral</option>
        </select>
        <p v-if="participantsFlag" class="flag">
          Session content suggests others were present — set Participants before signing.
        </p>
      </div>
    </div>
    <p v-if="codeSwitchBanner" class="banner">{{ codeSwitchBanner }}</p>
  </section>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  clinicianLabel: { type: String, default: '' },
  patientLabel: { type: String, default: '' },
  patientDob: { type: String, default: '' },
  dateTimeLabel: { type: String, default: '' },
  durationMinutes: { type: [Number, null], default: null },
  serviceCode: { type: String, default: '' },
  locationLabel: { type: String, default: '' },
  participants: { type: String, default: 'Client Only' },
  participantsFlag: { type: Boolean, default: false },
  codeSwitchBanner: { type: String, default: '' }
});

defineEmits(['update:durationMinutes', 'update:participants']);
</script>

<style scoped>
.na-session-strip {
  position: sticky;
  top: 0;
  z-index: 5;
  background: #f0fdfa;
  border: 1px solid #99f6e4;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.na-session-strip__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px 14px;
}
.lbl {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #0f766e;
  margin-bottom: 2px;
}
strong {
  font-size: 0.88rem;
  color: #0f172a;
  font-weight: 650;
}
.sub {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 2px;
}
.na-session-strip__input,
.na-session-strip__select {
  width: 100%;
  max-width: 160px;
  border: 1px solid #99f6e4;
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
  background: #fff;
}
.flag {
  margin: 6px 0 0;
  font-size: 0.75rem;
  color: #b45309;
  font-weight: 600;
}
.banner {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #9a3412;
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
