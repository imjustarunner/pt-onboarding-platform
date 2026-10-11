<template>
  <section class="email-reminders" aria-labelledby="personal-reminder-title">
    <header>
      <span class="eyebrow">Optional reminders</span>
      <h3 id="personal-reminder-title">Personal email reminders</h3>
      <p>Messages always arrive in the app. Would you also like a reminder at your saved personal email?</p>
      <p v-if="transitionPlanned" class="transition-note">These choices start after your move to app-only email is confirmed. Keep using your work email until then.</p>
    </header>
    <fieldset :disabled="readonly">
      <legend class="sr-only">Receive personal email reminders</legend>
      <div class="choices">
        <label class="choice" :class="{selected: !modelValue.personalEmailNotify}">
          <input type="radio" :name="`${id}-enabled`" :checked="!modelValue.personalEmailNotify" @change="update({personalEmailNotify:false})" />
          <span><strong>No reminders</strong><small>I’ll check my messages in the app.</small></span>
        </label>
        <label class="choice" :class="{selected: modelValue.personalEmailNotify}">
          <input type="radio" :name="`${id}-enabled`" :checked="modelValue.personalEmailNotify" @change="update({personalEmailNotify:true})" />
          <span><strong>Email me reminders</strong><small>Use my saved personal email.</small></span>
        </label>
      </div>
    </fieldset>
    <template v-if="modelValue.personalEmailNotify">
      <fieldset :disabled="readonly">
        <legend>What would you like to receive?</legend>
        <div class="choices">
          <label class="choice" :class="{selected: modelValue.personalEmailDeliveryMode === 'notification'}">
            <input type="radio" :name="`${id}-delivery`" :checked="modelValue.personalEmailDeliveryMode === 'notification'" @change="update({personalEmailDeliveryMode:'notification'})" />
            <span><strong>A reminder with a link</strong><small>Open the app to read and reply. Message contents stay in the app.</small></span>
          </label>
          <label class="choice" :class="{selected: modelValue.personalEmailDeliveryMode === 'forward_one_to_one'}">
            <input type="radio" :name="`${id}-delivery`" :checked="modelValue.personalEmailDeliveryMode === 'forward_one_to_one'" @change="update({personalEmailDeliveryMode:'forward_one_to_one'})" />
            <span><strong>Individual emails I can reply to</strong><small>Eligible individual messages include their content. Reply by email or in the app.</small></span>
          </label>
        </div>
        <p class="hint">Group and restricted messages always use a secure app link.</p>
      </fieldset>
      <fieldset :disabled="readonly">
        <legend>When should we remind you?</legend>
        <div class="choices">
          <label class="choice" :class="{selected: modelValue.personalEmailDelayMode === 'business_day'}">
            <input type="radio" :name="`${id}-timing`" :checked="modelValue.personalEmailDelayMode === 'business_day'" @change="update({personalEmailDelayMode:'business_day',personalEmailDelayHours:24})" />
            <span><strong>After 24 business hours</strong><small>Only if the message is still unread. Uses your saved Availability Hours.</small></span>
          </label>
          <label class="choice" :class="{selected: modelValue.personalEmailDelayMode === 'immediate'}">
            <input type="radio" :name="`${id}-timing`" :checked="modelValue.personalEmailDelayMode === 'immediate'" @change="update({personalEmailDelayMode:'immediate'})" />
            <span><strong>Right away</strong><small>Reminders may arrive at any hour.</small></span>
          </label>
        </div>
        <p v-if="!['business_day','immediate'].includes(modelValue.personalEmailDelayMode)" class="transition-note">Your earlier timing setting is saved. Choose one of these options to enable reminders.</p>
      </fieldset>
      <p class="hint">You can check your personal email in Contact &amp; Address.</p>
    </template>
    <p class="save-note">Finish the choices below, then select <strong>Sign and save my choices</strong> to save.</p>
  </section>
</template>
<script setup>
import {useId} from 'vue';
const props=defineProps({modelValue:{type:Object,required:true},readonly:Boolean,transitionPlanned:Boolean});
const emit=defineEmits(['update:modelValue']);
const id=useId();
function update(patch){if(!props.readonly)emit('update:modelValue',{...props.modelValue,...patch});}
</script>
<style scoped>
.email-reminders{padding:clamp(18px,3vw,30px);border:1px solid #dae5df;border-radius:20px;background:#fff;box-shadow:0 4px 18px #173c2d06;color:#20392f;display:grid;gap:24px;min-width:0;margin-bottom:20px}
header{display:grid;gap:10px}.eyebrow{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:#527561}.email-reminders h3{margin:0;font-size:1.45rem;line-height:1.25;color:#285b42}.email-reminders p{margin:0;line-height:1.55;max-width:76ch}fieldset{border:0;padding:0;margin:0;min-width:0}legend{font-weight:700;margin-bottom:12px;font-size:1rem;padding:0}.choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.choice{display:flex;align-items:flex-start;gap:12px;cursor:pointer;border:1px solid #cddbd3;border-radius:14px;padding:18px;background:#fff;line-height:1.4;min-width:0;transition:border-color .15s,background .15s}.choice:hover{border-color:#739780;background:#fafcfb}.choice.selected{border-color:#3e7857;background:#eff7f1;box-shadow:inset 0 0 0 1px #3e7857}.choice input[type=radio]{appearance:auto;accent-color:#356b4c;width:20px;height:20px;flex:0 0 20px;margin:2px 0 0;padding:0}.choice span{display:grid;gap:5px;min-width:0}.choice strong{font-size:1rem}.choice small,.hint,.save-note{font-size:.9rem;color:#586e61}.choice:focus-within{outline:3px solid #2977ae;outline-offset:3px}fieldset:disabled .choice{cursor:default}.hint{margin-top:12px!important}.transition-note{padding:12px 16px;background:#edf4f8;border-radius:10px;color:#375a70;font-size:.9rem}.save-note{padding-top:16px;border-top:1px solid #e4ece7}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:650px){.choices{grid-template-columns:1fr}.choice{padding:15px}.email-reminders{gap:20px}}
@media(prefers-reduced-motion:reduce){.choice{transition:none}}
</style>
