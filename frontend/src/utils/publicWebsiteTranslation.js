// Translation adapter for public marketing copy, including content supplied by the page editor.
// Keeps each English text node intact as the source; never changes HTML, input values, URLs or editor controls.
export const WEBSITE_SPANISH = {
 'Home':'Inicio','About':'Acerca de nosotros','About Us':'Acerca de nosotros','Services':'Servicios','Our Services':'Nuestros servicios','Our Programs':'Nuestros programas','Programs':'Programas','Get Involved':'Participa','Impact':'Impacto','Our Impact':'Nuestro impacto','Resources':'Recursos','Contact':'Contacto','Contact Us':'Contáctanos','Our Network':'Nuestra red','Our providers':'Nuestros profesionales','Our tutors':'Nuestros tutores','Our coaches':'Nuestros coaches','Find a provider':'Encuentra un profesional','Find Providers':'Buscar profesionales','Find Support':'Encuentra apoyo','Get started':'Comenzar','Get Started':'Comenzar','Learn More':'Más información','Learn more':'Más información','Donate':'Donar','Donate Today':'Dona hoy','Donate Now':'Donar ahora','Support Our Mission':'Apoya nuestra misión','Support our mission':'Apoya nuestra misión','Privacy':'Privacidad','Privacy Policy':'Política de privacidad','Terms':'Términos','Terms of Service':'Términos de servicio','Coming soon':'Próximamente','Menu':'Menú','Close':'Cerrar','Menu ☰':'Menú ☰','Close ×':'Cerrar ×','Search':'Buscar','Search the website':'Buscar en el sitio','Skip to content':'Saltar al contenido','Partner With Us':'Colabora con nosotros','Partner with us':'Colabora con nosotros','Our partners':'Nuestros colaboradores','View all':'Ver todo','All services':'Todos los servicios','All partners':'Todos los colaboradores','Who We Help':'A quiénes ayudamos','Who We Support':'A quiénes apoyamos','Men':'Hombres','Boys':'Niños','Athletes':'Deportistas','Build Inner':'Desarrolla tu','Strength':'fortaleza interior','How It Works':'Cómo funciona','Contact our team':'Contacta a nuestro equipo','Begin intake →':'Iniciar inscripción →','Get started →':'Comenzar →','Real connections.':'Conexiones reales.','Brighter paths.':'Caminos más prometedores.','REAL CONNECTIONS.':'CONEXIONES REALES.','BRIGHTER PATHS.':'CAMINOS MÁS PROMETEDORES.','Our programs':'Nuestros programas','About MH4Kidz':'Acerca de MH4Kidz','The Unplugged Series':'The Unplugged Series','Real People.':'Personas reales.','Brighter Tomorrows.':'Mañanas más prometedores.','Expanding':'Ampliando','Mental Health':'la salud mental','Together.':'juntos.','A Shared Mission.':'Una misión compartida.','A Greater Reach.':'Un mayor alcance.','Different Strengths.':'Fortalezas distintas.','One Shared Mission.':'Una misión compartida.','Stronger Together':'Más fuertes juntos','Find the Right Support.':'Encuentra el apoyo adecuado.','Build. Manage. Scale.':'Construye. Gestiona. Crece.','Your Next Chapter.':'Tu próximo capítulo.','Let’s Get Your':'Pongamos tu','Business Moving.':'negocio en marcha.','Let’s Talk':'Hablemos','Let\'s Talk':'Hablemos','Choose Your Path':'Elige tu camino','Our story':'Nuestra historia','Our mission':'Nuestra misión','Counseling':'Terapia','Life Coaching':'Coaching de vida','Tutoring':'Tutoría','Mental health':'Salud mental','Mental Health Agencies':'Agencias de salud mental','Consultants':'Consultores','Coaches':'Coaches','Life Coaches':'Coaches de vida','Tutors':'Tutores','Other Service Businesses':'Otras empresas de servicios','Website search':'Búsqueda del sitio','Try again':'Intentar de nuevo','MH4Kidz':'MH4Kidz','Rise Revive':'Rise Revive','Plot Twist Co.':'Plot Twist Co.','Plot Twist Co':'Plot Twist Co','Plot Twist HQ':'Plot Twist HQ','Mental Range Collective':'Mental Range Collective','Inner Strength Institute':'Inner Strength Institute'
};
const ROOTS = '.itsco-site,.tisi-site,.rise-site,.mh-site,.ptco-site,.range-site,.pmh-sub-page';
const SKIP = 'script,style,svg,textarea,input,[contenteditable="true"],[translate="no"],.notranslate,.page-editor,.tisi-editor-bar,[class*="-ed-"],.public-translate-widget';
export function createWebsiteTranslator({ document, translate, onState = () => {} }) {
 const entries=new Map(),cache=new Map(Object.entries(WEBSITE_SPANISH)),attempted=new Set();
 let spanish=false,stopped=false,timer,version=0,pending=false;
 const rootFor=node=>node.parentElement?.closest(ROOTS);
 function collect(){
  for(const [node] of entries) if(!node.isConnected) entries.delete(node);
  for(const root of document.querySelectorAll(ROOTS)){
   const walker=document.createTreeWalker(root,4);
   let node;
   while((node=walker.nextNode())){
    if(node.parentElement?.closest(SKIP)||!/[A-Za-z]/.test(node.data)||!node.data.trim())continue;
    const prior=entries.get(node);
    if(!prior||node.data!==prior.rendered) entries.set(node,{source:node.data,rendered:node.data});
   }
  }
 }
 function render(){observer.disconnect();collect();
  for(const [node,entry] of entries){if(!rootFor(node))continue;const key=entry.source.trim();const translated=spanish?cache.get(key):null;const text=translated?entry.source.replace(key,translated):entry.source;if(node.data!==text)node.data=text;entry.rendered=text;}
  if(!stopped)observer.observe(document.body,{childList:true,subtree:true,characterData:true});
 }
 async function run(){if(stopped)return;render();if(!spanish||pending)return;
  const strings=[...new Set([...entries.values()].map(e=>e.source.trim()))].filter(s=>!cache.has(s)&&!attempted.has(s)&&s.length<=8000);
  if(!strings.length)return;pending=true;const generation=version;onState('loading');let failed=false;
  try{for(let i=0;i<strings.length;i+=40){const batch=strings.slice(i,i+40);batch.forEach(s=>attempted.add(s));const response=await translate(batch);for(const s of batch){const value=response?.translations?.[s];if(typeof value==='string'&&value.trim()&&value!==s)cache.set(s,value);else failed=true;}if(stopped||generation!==version)break;render();}}
  catch{failed=true;}finally{pending=false;if(!stopped){onState(spanish&&failed?'unavailable':'');schedule();}}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(run,80);}
 const observer=new MutationObserver(schedule);
 return {setSpanish(value){spanish=!!value;version++;if(!spanish)onState('');render();schedule();},refresh(){schedule();},retry(){attempted.clear();schedule();},stop(){stopped=true;version++;clearTimeout(timer);observer.disconnect();spanish=false;render();entries.clear();}};
}
