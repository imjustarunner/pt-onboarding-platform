<template>
  <section class="crisis-quick-actions" aria-label="Crisis response shortcuts">
    <div class="crisis-intro"><strong>Safety comes first.</strong><p>For immediate danger, call emergency services. Do not wait for an app message or an AI answer.</p></div>
    <div class="crisis-contacts">
      <a href="tel:911"><strong>911</strong><span>Immediate danger or medical emergency</span></a>
      <a href="tel:988"><strong>988</strong><span>Call or text · Mental health crisis support</span></a>
      <a href="tel:18442645437"><strong>844-264-5437</strong><span>Colorado child abuse / neglect reporting</span></a>
    </div>
    <nav aria-label="Response procedures">
      <button type="button" @click="$emit('open', 'on-site-emergency')">On-site response →</button>
      <button type="button" @click="$emit('open', 'remote-emergency')">Remote / off-site response →</button>
      <button type="button" @click="$emit('open', 'contacts-and-readiness')">Contacts &amp; local readiness →</button>
    </nav>
    <p class="crisis-location">For a remote client, direct emergency help to their current physical location. Q&amp;A explains the guide; it cannot assess a person’s safety or dispatch help.</p>
  </section>
</template>
<script setup>
defineEmits(['open']);
</script>
<style scoped>
.crisis-quick-actions { padding: 26px 30px; background: #fff7e8; color: #493421; border-bottom: 1px solid #dbc8a7; }
.crisis-intro strong { font-size: 22px; }.crisis-intro p { font-size: 13px; line-height: 1.7; margin: 8px 0 18px; max-width: 780px; }
.crisis-contacts { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }.crisis-contacts a { display: block; background: #fffdf7; border: 1px solid #d6b889; border-radius: 9px; padding: 14px 16px; color: #583810; text-decoration: none; }.crisis-contacts strong { display: block; font-size: 22px; line-height: 1.4; }.crisis-contacts span { display: block; font-size: 12px; line-height: 1.5; margin-top: 5px; }
nav { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }button { font: inherit; font-size: 12px; color: #493421; background: transparent; border: 1px solid #cbb494; border-radius: 6px; padding: 10px 12px; cursor: pointer; }
.crisis-location { font-size: 12px; line-height: 1.7; margin: 15px 0 0; max-width: 850px; }a:focus-visible,button:focus-visible { outline: 3px solid #795421; outline-offset: 3px; }
@media(max-width:650px) { .crisis-quick-actions { padding: 22px 18px; }.crisis-contacts { grid-template-columns: 1fr; }.crisis-contacts a { padding: 12px 14px; }nav button { width: 100%; text-align: left; } }
</style>
