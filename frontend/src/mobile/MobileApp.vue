<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { LockKeyhole, UserRound, Fingerprint, Bell, ArrowRight, LogOut } from '@lucide/vue';
import AuricWellBrand from '../components/auricwell/AuricWellBrand.vue';
import QuickView from '../views/QuickViewAccessView.vue';
import { MobileDevice, native, mobileApi, quickApiBase, randomSecret, pkceChallenge, accountUrl, mobileRequestError } from './transport.js';

const route=useRoute(),router=useRouter();
const screen=ref('loading'),busy=ref(false),error=ref(''),portal=ref(''),passcode=ref(''),confirmCode=ref('');
const access=ref(null),profile=ref(null),workspace=ref(null),accountOpen=ref(false),connectAccount=ref(null),selectedAgency=ref('');
const qv=ref(null),notificationStatus=ref(''),biometry=ref(false);
let generation=0,interceptor,deviceListener,pushListener,privacyListener;
const accountLink=computed(()=>accountUrl(profile.value?.workspace));
const securityLink=computed(()=>accountUrl(profile.value?.workspace,'account-security'));
const preferencesLink=computed(()=>accountUrl(profile.value?.workspace,'preferences'));
const connectQuery=()=>Object.fromEntries(new URLSearchParams(window.location.search));
async function deviceRequest(method,path,data={}) {
  if(native)return MobileDevice.request({method,path,data});
  return (await mobileApi.request({method,url:path,data})).data;
}
async function detectSession() {
  screen.value='loading';error.value='';
  try { const status=await deviceRequest('GET','/session');workspace.value=status.workspace;screen.value=status.needsCode?'setup':'locked'; }
  catch(e){screen.value='signin';if(e.response?.status===503)error.value=mobileRequestError(e);}
}
async function startSignIn() {
  busy.value=true;error.value='';
  try {
    const slug=portal.value.trim().toLowerCase();
    if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug))throw new Error('Enter your organization’s workspace name, such as itsco.');
    const {data:tenant}=await axios.get(`${quickApiBase}/tenant`,{params:{portal:slug}});
    const verifier=randomSecret(),state=randomSecret(),challenge=await pkceChallenge(verifier);
    const callback=native?'com.auricwell.mobile://auth':'https://auricwell.com/mobile/callback';
    const url=new URL('/mobile/connect',tenant.loginUrl);
    url.search=new URLSearchParams({clientId:native?'ios':'web',redirectUri:callback,challenge,state,loginPath:new URL(tenant.loginUrl).pathname}).toString();
    if(native){
      const {url:callbackUrl}=await MobileDevice.signIn({url:url.href});
      await completeSignIn(callbackUrl,{state,verifier,callback,clientId:'ios'});
    } else {
      sessionStorage.setItem('auricwell.mobile.pending',JSON.stringify({state,verifier,callback,clientId:'web',createdAt:Date.now()}));
      window.location.assign(url.href);
    }
  } catch(e){error.value=mobileRequestError(e);} finally {busy.value=false;}
}
async function loadConnect() {
  screen.value='connect';busy.value=true;
  const query=connectQuery();
  try {
    if(!['web','ios'].includes(query.clientId) || !/^[\w-]{43}$/.test(query.challenge || '') || !/^[\w-]{43}$/.test(query.state || ''))throw new Error('Restart sign-in from Auricwell mobile.');
    const {data}=await mobileApi.get('/account');connectAccount.value=data;selectedAgency.value=String(data.agencies[0]?.id || '');
  } catch(e) {
    if([401,423].includes(e.response?.status)){
      const path=query.loginPath;
      if(!/^\/(?:[a-z0-9-]+\/)*login\/?$/i.test(path || '')){error.value='Restart sign-in from Auricwell mobile.';return;}
      const login=new URL(path,location.origin);login.searchParams.set('redirect',location.pathname+location.search);location.assign(login.href);
    } else error.value=mobileRequestError(e);
  } finally {busy.value=false;}
}
async function authorize() {
  busy.value=true;error.value='';
  try {
    const query=connectQuery();
    const {data}=await mobileApi.post('/authorize',{...query,agencyId:Number(selectedAgency.value),expectedUserId:connectAccount.value.user.id});
    const callback=new URL(data.redirectUri);callback.search=new URLSearchParams({code:data.code,state:query.state}).toString();
    location.replace(callback.href);
  } catch(e){error.value=mobileRequestError(e);} finally {busy.value=false;}
}
async function completeSignIn(url,pending) {
  const callback=new URL(url),code=callback.searchParams.get('code');
  if(!pending || pending.state!==callback.searchParams.get('state') || !code || pending.createdAt && Date.now()-pending.createdAt>600000)throw new Error('The sign-in request expired. Start again from this device.');
  const data={code,verifier:pending.verifier,clientId:pending.clientId,redirectUri:pending.callback,deviceName:native?'Auricwell iPhone':'Auricwell browser'};
  const result=native?await MobileDevice.exchange({data}):(await mobileApi.post('/exchange',data)).data;
  workspace.value=result.workspace;screen.value='setup';
}
async function callback() {
  try {
    const pending=JSON.parse(sessionStorage.getItem('auricwell.mobile.pending') || 'null');sessionStorage.removeItem('auricwell.mobile.pending');
    const url=location.href;history.replaceState(null,'','/mobile');
    await completeSignIn(url,pending);
  }catch(e){screen.value='signin';error.value=mobileRequestError(e);}
}
async function enter(biometrics=false) {
  busy.value=true;error.value='';const current=generation;
  try {
    if(screen.value==='setup' && passcode.value!==confirmCode.value)throw new Error('The quick access codes must match.');
    const result=biometrics?await MobileDevice.unlockWithBiometrics():await deviceRequest('POST',screen.value==='setup'?'/code':'/unlock',{passcode:passcode.value});
    if(current!==generation)return;
    access.value=result;profile.value=result.profile;workspace.value=result.profile.workspace;passcode.value='';confirmCode.value='';screen.value='workspace';
    if(native){
      try{const {data}=await mobileApi.get('/profile',{headers:{'X-Quick-View-Session':result.sessionToken}});if(current!==generation)return;profile.value=data;if(data.notifications.enabled){const registration=await MobileDevice.registerPush();await registerPush({enabled:true,...registration});}}catch{/* Notification settings must not prevent unlocking. */}
      const target=await MobileDevice.pendingNotification();if(target.url)await openNotification(target.url);}
    else if(route.query.kind)await openNotification(location.pathname+location.search);
  }catch(e){
    if(current!==generation)return;
    error.value=mobileRequestError(e);
    const code=e.response?.data?.error?.code || e.code;
    if(['MOBILE_SIGN_IN_REQUIRED','MOBILE_ACCOUNT_CHANGED','ACCOUNT_DISABLED','ACCOUNT_UNAVAILABLE','MOBILE_WORKSPACE_UNAVAILABLE','PRODUCT_SESSION_MISMATCH'].includes(code))screen.value='signin';
    if(code==='MOBILE_SETUP_REQUIRED')screen.value='setup';
  } finally {busy.value=false;}
}
function lock() {
  ++generation;
  const old=access.value;access.value=null;profile.value=null;accountOpen.value=false;passcode.value='';confirmCode.value='';
  if(screen.value==='workspace')screen.value='locked';
  if(old)axios.post(`${quickApiBase}/session/logout`,{},{headers:{'X-Quick-View-Session':old.sessionToken},withCredentials:true}).catch(()=>{});
}
function background() {if(!native && document.hidden && ['workspace','locked','setup'].includes(screen.value))lock();}
async function signOut() {
  busy.value=true;error.value='';
  try { await deviceRequest('POST','/logout');lock();workspace.value=null;screen.value='signin'; }
  catch(e){error.value=mobileRequestError(e);} finally {busy.value=false;}
}
async function showAccount() {
  const current=generation;accountOpen.value=true;
  try {const {data}=await mobileApi.get('/profile',{headers:{'X-Quick-View-Session':access.value.sessionToken}});if(current===generation)profile.value=data;}
  catch(e){error.value=mobileRequestError(e);}
}
async function changeWorkspace(event) {
  const current=generation;busy.value=true;
  try {
    const {data}=await mobileApi.post('/workspace',{agencyId:Number(event.target.value)},{headers:{'X-Quick-View-Session':access.value.sessionToken}});
    if(current!==generation)return;
    access.value=data;profile.value=data.profile;workspace.value=data.profile.workspace;accountOpen.value=false;
  }catch(e){error.value=mobileRequestError(e);}finally{busy.value=false;}
}
async function registerPush(payload) {
  if(!access.value)return;
  const {data}=await mobileApi.post('/notifications',payload,{headers:{'X-Quick-View-Session':access.value.sessionToken}});
  notificationStatus.value=payload.enabled?(native&&!data.appleReady || !native&&!data.webReady?'Permission saved. Server notification delivery is awaiting configuration.':'Notifications enabled for the whole Conversa suite.'):'Notifications disabled on this device.';
}
async function enableNotifications() {
  busy.value=true;notificationStatus.value='';
  try {
    if(native){const result=await MobileDevice.registerPush();await registerPush({enabled:true,...result});return;}
    if(!('serviceWorker' in navigator) || !('PushManager' in window))throw new Error('For iPhone browser notifications, add Auricwell to your Home Screen and open it there.');
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error('Notifications are off in this device’s settings.');
    const config=profile.value?.notifications;
    if(!config?.webPublicKey)throw new Error('Server notification delivery is awaiting configuration.');
    const worker=await navigator.serviceWorker.register('/mobile-sw.js',{scope:'/mobile/'});
    if(!worker.active)await new Promise((resolve,reject)=>{const active=worker.installing || worker.waiting;if(!active)return reject(new Error('Could not activate notifications. Try again.'));active.addEventListener('statechange',()=>{if(active.state==='activated')resolve();if(active.state==='redundant')reject(new Error('Could not activate notifications. Try again.'));});});
    const key=Uint8Array.from(atob(config.webPublicKey.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    const subscription=await worker.pushManager.getSubscription() || await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await registerPush({enabled:true,subscription:subscription.toJSON()});
  }catch(e){notificationStatus.value=mobileRequestError(e);}finally{busy.value=false;}
}
async function openNotification(url) {
  const parsed=new URL(url,'https://auricwell.com');
  if(parsed.origin!=='https://auricwell.com' || parsed.pathname!=='/mobile/workspace')return;
  if(!access.value){await router.replace(parsed.pathname+parsed.search);return;}
  const kind=parsed.searchParams.get('kind'),id=parsed.searchParams.get('id');
  if(!['email','sms','chat'].includes(kind) || !/^[1-9]\d*$/.test(id || ''))return;
  try {
    const {data}=await mobileApi.get(`/notification-target/${kind}/${id}`,{headers:{'X-Quick-View-Session':access.value.sessionToken}});
    await router.replace({path:'/mobile/workspace',query:data});
    await nextTick();qv.value?.openDeepLink();
  }catch(e){error.value=mobileRequestError(e);}
}
onMounted(async()=>{
  document.addEventListener('visibilitychange',background);
  interceptor=axios.interceptors.response.use(r=>r,e=>{if(access.value && [401,423].includes(e.response?.status))lock();return Promise.reject(e);});
  if(native){
    try {biometry.value=(await MobileDevice.status()).biometrics;deviceListener=await MobileDevice.addListener('deviceLocked',lock);privacyListener=await MobileDevice.addListener('privacyReady',async()=>{await nextTick();await MobileDevice.reveal();});pushListener=await MobileDevice.addListener('notificationTapped',event=>openNotification(event.url));}catch{error.value='This native build needs the Auricwell device plugin.';}
  }
  if(!native && location.pathname==='/mobile/connect')await loadConnect();
  else if(!native && location.pathname==='/mobile/callback')await callback();
  else await detectSession();
  if(native){await nextTick();await MobileDevice.reveal();}
});
onUnmounted(()=>{lock();document.removeEventListener('visibilitychange',background);axios.interceptors.response.eject(interceptor);deviceListener?.remove();pushListener?.remove();privacyListener?.remove();});
</script>

<template>
  <div class="mobile-app">
    <template v-if="screen==='workspace' && access">
      <button class="mobile-account-button" @click="showAccount"><UserRound :size="18" />My Account</button>
      <QuickView :key="access.sessionToken" ref="qv" :mobile-session="access" @locked="lock" />
      <div v-if="accountOpen" class="mobile-overlay" @keydown.esc="accountOpen=false">
        <section class="mobile-card account" role="dialog" aria-modal="true" aria-labelledby="account-title">
          <button class="close" @click="accountOpen=false" aria-label="Close My Account">×</button>
          <h1 id="account-title">My Account</h1><p>{{ profile?.user?.firstName }} {{ profile?.user?.lastName }}<br>{{ profile?.user?.email }}</p>
          <label v-if="profile?.agencies?.length>1">Workspace<select :value="workspace?.id" :disabled="busy" @change="changeWorkspace"><option v-for="agency in profile.agencies" :key="agency.id" :value="agency.id">{{ agency.name }}</option></select></label>
          <a v-if="accountLink" :href="accountLink" target="_blank" rel="noopener">Manage profile <ArrowRight :size="17" /></a>
          <a v-if="securityLink" :href="securityLink" target="_blank" rel="noopener">Security & passkeys <ArrowRight :size="17" /></a>
          <a v-if="preferencesLink" :href="preferencesLink" target="_blank" rel="noopener">Account preferences <ArrowRight :size="17" /></a>
          <h2><Bell :size="18" />Conversa notifications</h2><p>Email, text messages, direct messages, channels, replies, mentions and secure messages. Message previews stay private.</p>
          <button :disabled="busy" @click="enableNotifications">Enable notifications</button><button class="secondary" :disabled="busy" @click="registerPush({enabled:false})">Turn off on this device</button><p role="status">{{ notificationStatus }}</p>
          <button class="secondary" @click="lock"><LockKeyhole :size="17" />Lock workspace</button><button class="secondary danger" :disabled="busy" @click="signOut"><LogOut :size="17" />Sign out of this device</button>
          <p v-if="error" role="alert" class="error">{{ error }}</p>
        </section>
      </div>
    </template>
    <main v-else class="mobile-gate">
      <header><AuricWellBrand context="Your daily workspace" /></header>
      <section class="mobile-card">
        <p v-if="screen==='loading'" role="status">Opening Auricwell…</p>
        <template v-else-if="screen==='connect'">
          <h1>Connect this device</h1><p v-if="connectAccount">Continue as {{ connectAccount.user.firstName }} {{ connectAccount.user.lastName }} ({{ connectAccount.user.email }}).</p>
          <label v-if="connectAccount">Workspace<select v-model="selectedAgency"><option v-for="agency in connectAccount.agencies" :key="agency.id" :value="String(agency.id)">{{ agency.name }}</option></select></label>
          <p>Your account’s permissions apply. This device will stay signed in until you sign out or account security requires a new sign-in.</p>
          <button :disabled="busy || !selectedAgency" @click="authorize">Connect to Auricwell <ArrowRight :size="18" /></button>
        </template>
        <form v-else-if="screen==='signin'" @submit.prevent="startSignIn">
          <h1>Your workday, within reach.</h1><p>Use your existing staff account to open your scoped workspace.</p>
          <label>Organization workspace<input v-model="portal" autocomplete="organization" placeholder="For example, itsco" required autocapitalize="none" spellcheck="false"></label>
          <button :disabled="busy">{{ busy?'Connecting…':'Continue to sign in' }}<ArrowRight :size="18" /></button>
          <p class="small">Sign in with your password, SSO or an existing passkey. You can add a passkey in your account settings.</p>
        </form>
        <form v-else @submit.prevent="enter()">
          <span class="gate-icon"><LockKeyhole :size="26" /></span><p class="eyebrow">{{ workspace?.name || 'Your workspace' }}</p>
          <h1>{{ screen==='setup'?'Protect your workspace':'Welcome back' }}</h1>
          <p>{{ screen==='setup'?'Choose a six-digit quick access code for this device.':'Unlock to pick up where you left off. Your account is still signed in.' }}</p>
          <label>{{ screen==='setup'?'New quick access code':'Quick access code' }}<input v-model="passcode" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" :autocomplete="screen==='setup'?'new-password':'current-password'" required></label>
          <label v-if="screen==='setup'">Confirm code<input v-model="confirmCode" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required></label>
          <button :disabled="busy || passcode.length!==6">{{ busy?'Opening…':screen==='setup'?'Save & open workspace':'Unlock workspace' }}<ArrowRight :size="18" /></button>
          <button v-if="native && biometry && screen==='locked'" type="button" class="secondary" :disabled="busy" @click="enter(true)"><Fingerprint :size="20" />Unlock with Face ID / Touch ID</button>
          <button type="button" class="text-button" :disabled="busy" @click="signOut">Sign out or recover access</button>
        </form>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
      </section>
      <footer>Private access. Your organization’s permissions apply.</footer>
    </main>
  </div>
</template>

<style>
html,body,#app{margin:0;min-height:100%;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#183154}*{box-sizing:border-box}.mobile-app{min-height:100dvh;background:#f3f6fc}.mobile-gate{min-height:100dvh;display:flex;flex-direction:column;align-items:center;padding:calc(30px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom));background:radial-gradient(ellipse at 90% 0,#e5edff,transparent 65%)}.mobile-gate header{align-self:flex-start;margin-bottom:60px}.mobile-card{width:min(100%,460px);background:white;border:1px solid #e0e8f5;border-radius:24px;padding:34px;box-shadow:0 20px 60px #2348780a}.mobile-card h1{font-size:30px;line-height:1.15;letter-spacing:-1px;margin:0 0 16px}.mobile-card h2{font-size:17px;display:flex;gap:8px;align-items:center;margin-top:28px}.mobile-card p{font-size:15px;line-height:1.65;color:#657891}.mobile-card label{display:block;font-size:14px;font-weight:600;margin:25px 0 18px}.mobile-card input,.mobile-card select{display:block;width:100%;font:inherit;padding:15px 16px;border:1px solid #cfdaec;border-radius:12px;margin-top:10px;background:#fafcff;color:#183154;min-height:50px}.mobile-card input[type=password]{letter-spacing:10px;text-align:center;font-size:22px}.mobile-card button,.mobile-card a{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px 18px;border:1px solid transparent;border-radius:12px;font:inherit;font-size:14px;font-weight:600;background:#285fe8;color:white;min-height:48px;text-decoration:none;cursor:pointer;margin-top:12px}.mobile-card button:disabled{opacity:.55;cursor:wait}.mobile-card .secondary,.mobile-card a{background:#f1f5fc;color:#254978;border-color:#e1e9f6}.mobile-card .text-button{background:transparent;color:#526a8d;font-weight:400}.mobile-card .small{font-size:12px;margin-top:23px}.mobile-card .error{color:#a32c43;background:#fff3f5;padding:12px;border-radius:10px}.mobile-card .eyebrow{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px}.gate-icon{display:inline-flex;padding:15px;border-radius:16px;background:#eff4ff;color:#3165da;margin-bottom:14px}.mobile-gate footer{font-size:12px;color:#7788a0;margin-top:30px;text-align:center}.mobile-account-button{position:fixed;right:20px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:40;display:flex;gap:7px;align-items:center;padding:12px 16px;background:#fff;border:1px solid #d6e1f3;box-shadow:0 5px 20px #183b6b16;color:#254978;border-radius:30px;font:inherit;font-size:12px;cursor:pointer}.mobile-overlay{position:fixed;inset:0;background:#152b4d80;backdrop-filter:blur(10px);z-index:100;display:grid;place-items:center;padding:20px}.mobile-card.account{position:relative;max-height:calc(100dvh - 40px);overflow:auto}.mobile-card .close{position:absolute;right:14px;top:8px;background:transparent;color:#607796;width:35px;padding:0;min-height:35px;font-size:26px}.mobile-card .danger{color:#9c3345}:focus-visible{outline:3px solid #80acff;outline-offset:3px}@media(min-width:1000px){.mobile-account-button{bottom:24px}.mobile-gate header{margin-bottom:80px}}@media(max-width:500px){.mobile-card{padding:26px}.mobile-gate header{margin-bottom:40px}}
</style>
