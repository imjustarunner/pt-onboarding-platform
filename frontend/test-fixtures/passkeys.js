import {createApp,ref,h} from 'vue';
import PasskeysPanel from '../src/components/PasskeysPanel.vue';
import PasskeySignIn from '../src/components/PasskeySignIn.vue';
createApp({setup(){const signedIn=ref(false);return()=>h('main',{style:'max-width:800px;margin:auto;font-family:Arial'},[h('h1','Test care portal'),h(PasskeysPanel),h(PasskeySignIn,{onSignedIn:()=>signedIn.value=true}),signedIn.value?h('p',{role:'status'},'Passkey sign-in completed'):null]);}}).mount('#app');
