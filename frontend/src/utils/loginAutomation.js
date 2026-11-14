export const autoVerifyEmail = value => /^[^\s@]+@[^\s@]+\.(com|health)$/i.test(String(value||'').trim());
// Timers and attempt markers live only in this form instance; credentials are
// never persisted. A failed automatic attempt is not retried until input changes.
export function createLoginAutomation({read,verify,submit}) {
 let usernameTimer,passwordTimer,disposed=false,lastVerify='',lastSubmit='',passwordIntent=false;
 async function attemptPassword(){
  const s=read();
  if(disposed||!passwordIntent||s.loading||s.verifying||s.needsOrgChoice||!s.showPassword||!s.password||s.username.trim().toLowerCase()!==String(s.verifiedUsername||'').toLowerCase())return;
  const marker=`${s.username}\0${s.password}`;
  if(marker===lastSubmit)return;
  lastSubmit=marker;passwordIntent=false;await submit();
 }
 function usernameChanged(){
  clearTimeout(usernameTimer);const username=read().username.trim().toLowerCase();
  if(username!==lastVerify)lastVerify='';
  if(!autoVerifyEmail(username))return;
  usernameTimer=setTimeout(async()=>{
   const s=read();
   if(disposed||s.loading||s.verifying||s.needsOrgChoice||s.username.trim().toLowerCase()!==username||username===s.verifiedUsername?.toLowerCase()||lastVerify===username)return;
   lastVerify=username;await verify({reason:'input'});if(!disposed)await attemptPassword();
  },650);
 }
 function passwordInserted(){passwordIntent=true;clearTimeout(passwordTimer);passwordTimer=setTimeout(attemptPassword,180);}
 return {usernameChanged,passwordInserted,dispose(){disposed=true;clearTimeout(usernameTimer);clearTimeout(passwordTimer);lastSubmit='';lastVerify='';passwordIntent=false;}};
}
