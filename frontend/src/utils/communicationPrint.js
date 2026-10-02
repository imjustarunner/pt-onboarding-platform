export async function openCommunicationPrint(load, filename='communication-record.html') {
  const preview=window.open('','_blank');
  if(preview) preview.opener=null;
  try{
    const {data}=await load();
    const url=URL.createObjectURL(new Blob([data],{type:'text/html;charset=utf-8'}));
    if(preview)preview.location.href=url;
    else{const a=document.createElement('a');a.href=url;a.download=filename;a.click();}
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(error){preview?.close();throw error;}
}
