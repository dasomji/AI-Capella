import { lang } from './i18n';
/** Fetch the current server decision; an offline account sheet remains usable. */
export async function appendAdminAccountLink(body:HTMLElement){
 try{
  const response=await fetch('/api/me',{cache:'no-store'});
  if(!response.ok)return;
  const me=await response.json();
  if(!me.user.sysadmin)return;
  const link=document.createElement('a');link.href='/admin';link.textContent=lang==='de'?'Verwaltung':'Administration';body.prepend(link);
 }catch{/* This optional online entry does not block account/device controls. */}
}
