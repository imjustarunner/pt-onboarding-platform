export async function api(path,{method='GET',body}={}) {
 const response=await fetch(`/api/auricwell-records${path}`,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Records-Request':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();
 if(!response.ok)throw Object.assign(new Error(data.error?.message||'Request failed.'),{status:response.status});
 return data;
}
