import {createServer} from 'vite';
import vue from '@vitejs/plugin-vue';
import {fileURLToPath} from 'node:url';
const here=fileURLToPath(new URL('.',import.meta.url));
const frontend=fileURLToPath(new URL('../../',import.meta.url));
const stub='\0capture-unopened-portal-step';
const server=await createServer({configFile:false,root:here,publicDir:frontend+'public',plugins:[{name:'local-fictional-capture',enforce:'pre',resolveId(source,importer){
 if(importer?.endsWith('HirePortalWorkspace.vue')&&source.endsWith('.vue')&&!/HirePortalIcon|PlotlineSignature/.test(source))return stub;
 if(source.endsWith('/SupervisionVideoRoom.vue'))return here+'MockVideoRoom.vue';
 if(/(?:^|\/)services\/api(?:\.js)?$/.test(source))return here+'mock-api.js';
 if(importer?.endsWith('ApplicantInterviewView.vue')&&/(?:useTeamMeetingLiveTranscript|utils\/activityTracker)(?:\.js)?$/.test(source))return here+'no-capture.js';
},load(id){if(id===stub)return 'export default {template:"<div hidden />"}';}},vue()],resolve:{dedupe:['vue','vue-router']},server:{host:'127.0.0.1',port:5212,strictPort:true,fs:{allow:[frontend,'/Users/mendez/PTOnboardingApp/frontend']}}});
await server.listen();console.log('Fictional capture harness: http://127.0.0.1:5212');
