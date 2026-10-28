<template>
  <section class="contact-options" aria-label="Contact options">
    <label class="checkbox-row">
      <input type="checkbox" :checked="choices.noRoutineCalls" @change="$emit('change', { noRoutineCalls: $event.target.checked })" />
      {{ es ? 'No quiero llamadas de rutina. Usen mis otros métodos de contacto.' : 'No routine phone calls. Use my other contact options.' }}
    </label>
    <details :open="choices.noAutomaticEmail || undefined">
      <summary>{{ es ? '¿Necesita otra forma de contacto? (opcional)' : 'Need a different way to be contacted? (optional)' }}</summary>
      <label class="checkbox-row">
        <input type="checkbox" :checked="choices.noAutomaticEmail" @change="$emit('change', { noAutomaticEmail: $event.target.checked })" />
        {{ es ? 'No me envíen correos automáticos, incluida la confirmación.' : 'Do not send automatic emails, including the confirmation.' }}
      </label>
      <p>{{ es ? 'Su equipo revisará estas instrucciones. Aún puede solicitar un enlace de acceso o recuperación de contraseña. Esta opción no cambia su permiso para mensajes de texto.' : 'Your team will review these instructions. You can still request a sign-in or password recovery email. This does not change your texting choices.' }}</p>
      <label>{{ es ? 'Cómo podemos contactarle de forma segura (opcional)' : 'How can we safely reach you? (optional)' }}
        <textarea :value="choices.alternativeContactInstructions" maxlength="500" rows="2" @input="$emit('change', { alternativeContactInstructions: $event.target.value })" />
      </label>
    </details>
  </section>
</template>
<script setup>
defineProps({ choices: { type: Object, required: true }, es: Boolean });
defineEmits(['change']);
</script>
<style scoped>
.contact-options{margin:16px 0;padding:16px;border:1px solid #cbd5e1;border-radius:10px}.checkbox-row{display:flex;gap:10px;align-items:flex-start;line-height:1.5}.checkbox-row input{margin-top:5px;flex-shrink:0}summary{cursor:pointer;margin-top:12px}details p{font-size:14px;line-height:1.5}textarea{display:block;box-sizing:border-box;width:100%;margin-top:6px;font:inherit;padding:8px}
</style>
