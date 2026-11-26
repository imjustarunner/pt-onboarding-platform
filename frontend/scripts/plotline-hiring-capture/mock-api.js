import {question,reference} from './fixtures.js';
const calls=[];window.__plotlineCaptureCalls=calls;
const clean=new URLSearchParams(location.search).has('clean');
export default {
 async get(url){calls.push({method:'GET',url});
  if(url.endsWith('/video-token'))return {data:{token:'local-fixture-only',sessionId:'local-fixture-only',applicationId:'local-fixture-only',displayName:'Sofia Bennett',roomMode:'main',branding:{name:'Next Level Up',logoUrl:'/assets/nlu/logo.png'}}};
  if(url.endsWith('/details'))return {data:{agency:{name:'Next Level Up',logoUrl:'/assets/nlu/logo.png'},meeting:{startsAt:'2026-12-03T17:00:00Z',endsAt:'2026-12-03T18:00:00Z',timezone:'America/Denver'}}};
  if(url.endsWith('/admission-status'))return {data:{admitted:true,roomMode:'main'}};
  if(url.endsWith('/question'))return {data:{question:clean?null:{id:1,text:question}}};
  if(url.endsWith('/chat'))return {data:{messages:clean?[]:[{id:'fictional-message',authorName:'Lauren Kim',roleLabel:'Host',text:'Welcome, Sofia. Take a moment to settle in. We’re glad you’re here.'}]}};
  if(url.startsWith('/public/hiring/reference/'))return {data:reference};
  throw Error('Unexpected capture read: '+url);
 },
 async post(url){calls.push({method:'MOCK_POST',url});if(url.endsWith('/join-presence'))return {data:{}};throw Error('Capture has no write path: '+url);}
};
