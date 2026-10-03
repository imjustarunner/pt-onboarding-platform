// Isolate preferences and sign-in storage before importing any shared application modules.
// This is the public demo document only; the normal application never imports this entry.
function memoryStorage(){const entries=new Map();return {get length(){return entries.size;},key:i=>[...entries.keys()][i]??null,getItem:key=>entries.get(String(key))??null,setItem:(key,value)=>entries.set(String(key),String(value)),removeItem:key=>entries.delete(String(key)),clear:()=>entries.clear()};}
async function start() {
try {
 Object.defineProperty(window,'localStorage',{value:memoryStorage()});
 Object.defineProperty(window,'sessionStorage',{value:memoryStorage()});
 await (await import('./main')).ready;
} catch(error) {
 document.getElementById('aw-demo').textContent='The fictional demo could not open. Please return to the AuricWell website and try again.';
 console.error('AuricWell demo failed to initialize',error);
}

}
void start();
