import axios from 'axios';
const routes={
 '/hiring/rehearsal':'bootstrap','/hiring/rehearsal/i9':'i9',
 '/hiring/packet-preview/options':'options','/hiring/packet-preview/reference':'reference',
 '/hiring/packet-preview/contract':'contract','/hiring/packet-preview/job-file':'job-file'
};
export function rehearsalSourceHttp(baseURL,token){
 const http=axios.create({baseURL,withCredentials:false,headers:{Authorization:`Bearer ${token}`}});
 function path(url,method){if(!routes[url] || (method==='post' && routes[url]!=='contract') || (method==='get' && routes[url]==='contract'))throw Error('This action is not available in the rehearsal.');return `/hiring/rehearsal-access/${routes[url]}`;}
 return {get:(url,options)=>http.get(path(url,'get'),options),post:(url,body)=>http.post(path(url,'post'),body)};
}
