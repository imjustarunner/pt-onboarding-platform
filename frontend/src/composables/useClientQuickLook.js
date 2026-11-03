import { ref, onBeforeUnmount, onMounted } from 'vue';

// The Clients directory's existing 420ms hover / 250ms leave behavior, shared by
// the directory and fictional demo. No record loading or mutations occur here.
export function useClientQuickLook() {
  const quickViewClient=ref(null), quickViewPinned=ref(false);
  let openTimer, closeTimer;
  const clearOpen=()=>clearTimeout(openTimer);
  const cancelQuickViewClose=()=>clearTimeout(closeTimer);
  function closeClientPanel(){clearOpen();cancelQuickViewClose();quickViewClient.value=null;quickViewPinned.value=false;}
  function pinClientPanel(client){clearOpen();cancelQuickViewClose();quickViewClient.value=client;quickViewPinned.value=true;}
  function openQuickView(client){clearOpen();cancelQuickViewClose();quickViewClient.value=client;}
  function scheduleQuickView(client){cancelQuickViewClose();if(quickViewClient.value?.id===client.id)return;clearOpen();openTimer=setTimeout(()=>{quickViewClient.value=client;},420);}
  function scheduleQuickViewClose(){if(quickViewPinned.value)return;cancelQuickViewClose();closeTimer=setTimeout(()=>{quickViewClient.value=null;},250);}
  function cancelQuickView(){clearOpen();scheduleQuickViewClose();}
  const escape=event=>{if(event.key==='Escape')closeClientPanel();};
  onMounted(()=>window.addEventListener('keydown',escape));
  onBeforeUnmount(()=>{clearOpen();cancelQuickViewClose();window.removeEventListener('keydown',escape);});
  return {quickViewClient,quickViewPinned,pinClientPanel,closeClientPanel,openQuickView,scheduleQuickView,cancelQuickView,cancelQuickViewClose,scheduleQuickViewClose};
}
