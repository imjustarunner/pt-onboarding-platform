<template>
  <aside v-show="!locked && panels.length" class="email-dock" aria-label="Open email drafts">
    <section v-for="panel in panels" v-show="active === panel.id" :key="panel.id" class="dock-panel" :class="{ expanded }" aria-label="Email draft">
      <header class="dock-header">
        <div><strong>{{ panel.subject || 'New email' }}</strong><small>{{ panel.recipient || 'Choose recipients' }} · {{ panel.status || 'Opening…' }}</small></div>
        <button type="button" @click="minimize(panel)" title="Minimize draft" aria-label="Minimize draft">−</button>
        <button type="button" @click="expanded=!expanded" :aria-label="expanded ? 'Restore draft size' : 'Expand draft'">{{ expanded ? '↙' : '⛶' }}</button>
        <button type="button" :disabled="panel.busy || panel.loading || !panel.draftId" @click="popOut(panel)" title="Open in a separate window" aria-label="Pop out draft">↗</button>
        <button type="button" :disabled="panel.busy" @click="editors[panel.id]?.saveAndClose()" title="Save and close" aria-label="Save and close draft">×</button>
      </header>
      <EmailComposer :ref="el=>editors[panel.id]=el" :compose-context="panel.context" @composer-state="Object.assign(panel,$event)" @close="remove(panel.id)" />
    </section>
    <nav class="dock-tabs" aria-label="Minimized email drafts">
      <button v-for="panel in panels" :key="panel.id" type="button" :aria-pressed="active===panel.id" @click="active=active===panel.id?null:panel.id">
        <strong>{{ panel.subject || 'New email' }}</strong><small>{{ panel.status || 'Opening…' }}</small>
      </button>
    </nav>
  </aside>
</template>
<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { composerUrl } from '../../utils/emailComposerWindow';
import EmailComposer from '../../views/EmailComposerView.vue';
const props=defineProps({locked:Boolean,ownerId:[Number,String]});
const router=useRouter(),panels=ref([]),active=ref(null),expanded=ref(false),editors={};
let serial=0;
function open(event){
  event.preventDefault();
  const context=event.detail;
  const existing=panels.value.find(p=>context.draftId ? (p.draftId || p.context.draftId)===context.draftId : context.conversationId && Number(p.conversationId || p.context.conversationId)===Number(context.conversationId) && !!p.context.quickView===!!context.quickView && (p.mode || p.context.mode)===context.mode);
  if(existing){active.value=existing.id;return;}
  const panel={id:++serial,context:{...context},status:'Opening…',busy:true};
  panels.value.push(panel);active.value=panel.id;
}
function remove(id){panels.value=panels.value.filter(p=>p.id!==id);delete editors[id];if(active.value===id)active.value=null;}
function minimize(panel){active.value=null;editors[panel.id]?.save().catch(()=>{});}
async function popOut(panel){
  const popup=window.open('','_blank','popup,width=1100,height=850,resizable=yes,scrollbars=yes');
  if(!popup)return;
  popup.document.title='Saving email draft…';
  try{
    const draftId=await editors[panel.id].preparePopout();
    if(!draftId){popup.close();return;}
    if(panel.context.quickView && panel.context.session && panel.context.session!=='cookie')popup.sessionStorage.setItem('plottwist.quickViewSession',panel.context.session);
    popup.location.replace(composerUrl(router,{...panel.context,draftId}));remove(panel.id);
  }catch{popup.close();}
}
function clearQuickView(){panels.value.filter(p=>p.context.quickView).forEach(p=>remove(p.id));}
watch(()=>props.ownerId,(next,old)=>{if(next!==old){panels.value=[];active.value=null;}});
onMounted(()=>{window.addEventListener('open-email-composer',open);window.addEventListener('quick-view-session-ended',clearQuickView);});
onUnmounted(()=>{window.removeEventListener('open-email-composer',open);window.removeEventListener('quick-view-session-ended',clearQuickView);});
defineExpose({panels,active,open,minimize,popOut});
</script>
<style scoped>
.email-dock{position:fixed;right:18px;bottom:0;z-index:1000;max-width:calc(100vw - 24px);color:var(--text-primary,#20352b)}.dock-panel{box-sizing:border-box;display:flex;flex-direction:column;width:min(760px,calc(100vw - 24px));height:min(82dvh,850px);border:1px solid #9bb6a8;border-radius:12px 12px 0 0;background:var(--bg-primary,#fff);box-shadow:0 8px 40px #132e3540;overflow:hidden}.dock-panel.expanded{width:calc(100vw - 36px);height:calc(100dvh - 70px)}.dock-header{display:flex;gap:6px;align-items:center;background:var(--bg-secondary,#edf4ef);padding:10px;border-bottom:1px solid #9bb6a8}.dock-header div{flex:1;min-width:0}.dock-header strong,.dock-header small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dock-header small{font-size:.8rem;margin-top:3px}.dock-header button{border:0;background:transparent;color:inherit;min-width:36px;min-height:36px;font-size:1.2rem;cursor:pointer}.dock-panel :deep(.email-composer){min-height:0;overflow:auto;width:100%;box-sizing:border-box;flex:1;padding:16px}.dock-panel :deep(.email-composer>header){display:none}.dock-tabs{display:flex;gap:6px;justify-content:flex-end;max-width:calc(100vw - 24px);overflow:auto}.dock-tabs button{border:1px solid #9bb6a8;border-radius:7px 7px 0 0;padding:8px 12px;background:var(--bg-primary,#fff);color:inherit;min-width:140px;max-width:230px;cursor:pointer;text-align:left}.dock-tabs strong,.dock-tabs small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dock-tabs [aria-pressed=true]{background:var(--bg-secondary,#edf4ef)}@media(max-width:600px){.email-dock{right:0;max-width:100vw}.dock-panel,.dock-panel.expanded{width:100vw;height:calc(100dvh - 52px)}.dock-tabs{max-width:100vw}.dock-header{padding:6px}}
</style>
