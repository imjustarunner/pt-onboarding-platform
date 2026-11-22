import {createApp,h,ref} from 'vue';
import {createPinia} from 'pinia';
import {createRouter,createMemoryHistory} from 'vue-router';
import Hub from '../../src/components/tutoring/TutoringSessionHub.vue';
const role=new URLSearchParams(location.search).get('view')==='learner'?'learner':'tutor';
const host=role==='tutor';
const state={host,sessionHubV2:true,sessionId:9000600,appointmentId:9000481,studentName:'Example Learner · synthetic',title:'Mathematics / Individual tutoring',available:true,status:'in_progress',startedAt:new Date(Date.now()-240000).toISOString(),startAt:new Date().toISOString(),endAt:new Date(Date.now()+3600000).toISOString(),visits:[],visit:{status:'admitted'}};
const request=async(suffix,method='get',body,options={})=>{const response=await fetch('/__qa/'+role+suffix,{method:method.toUpperCase(),...(body?{body:body instanceof FormData?body:JSON.stringify(body),headers:body instanceof FormData?{}:{'Content-Type':'application/json'}}:{})});if(!response.ok)throw {response:{status:response.status,data:await response.json()}};return options.responseType==='blob'?response.blob():response.json();};
const goals=[{id:91,title:'Compare fractions using equal-size wholes'},{id:92,title:'Add fractions and explain the common unit'}];
const app=createApp({setup(){const message=ref('');return ()=>h('div',[
 h('div',{style:'font:11px system-ui;background:#f8edc6;color:#5c4c20;padding:5px 12px'},'ENGINEERING PREVIEW · Synthetic data · No live appointment, video or delivered email'),
 h(Hub,{state,connected:false,closed:false,inPerson:true,guest:!host,brand:'Next Level Up',logo:'/assets/nlu/logo.png',goals:host?goals:[],backPath:'/',learningContext:host?{tracks:[{subject:{school_grade:'5'},bundle:{goals}}]}:null,request,workspaceRequest:(suffix,options={})=>request('/workspace'+suffix,options.method||'get',options.body),rateActivity:host?async(id,rating)=>request('/review','post',{targetId:id,rating}):undefined,generateQuestion:host?async()=>({prompt:'Which fraction is equal to one half?',format:'choice',options:['2/4','3/4'],skill:'Equivalent fractions',grade:'5'}):undefined},{learning:()=>h('div',[h('p','Mathematics · Grade 5'),h('p','Practice with visual models, then explain your strategy.'),...goals.map(g=>h('p',g.title))]),notes:()=>h('section',[h('p','Private tutor notes'),h('textarea',{placeholder:'Capture observations from the performed lesson',style:'width:100%;min-height:120px'}),h('button',{onClick:()=>message.value='Preview only · saved-note persistence is verified by separate app tests.'},'Save preview note'),h('p',message.value)])})
]);}});
app.use(createPinia());app.use(createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]}));app.mount('#app');
