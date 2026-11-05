// Push-only service worker. Never cache account data, API responses or app pages.
self.addEventListener('push',event=>{
  let payload;try{payload=event.data.json();}catch{return;}
  const url=new URL(payload.url || '/mobile/',self.location.origin);
  if(url.origin!==self.location.origin || !url.pathname.startsWith('/mobile/'))return;
  event.waitUntil(self.registration.showNotification('Auricwell',{body:'New message',icon:'/auricwell/mark.png',tag:payload.tag,data:{url:url.href}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=event.notification.data?.url || '/mobile/';
  event.waitUntil(clients.openWindow(url));
});
