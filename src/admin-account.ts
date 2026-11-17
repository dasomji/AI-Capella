import { lang } from './i18n';
import { createAccountPart } from './design-system/dom';
/** Fetch the current server decision; an offline account sheet remains usable. */
export async function appendAdminAccountLink(body:HTMLElement){
 try{
  const response=await fetch('/api/me',{cache:'no-store'});
  if(!response.ok)return;
  const me=await response.json();
  if(!me.user.sysadmin)return;
  const link=createAccountPart('a','admin-link',{text:lang==='de'?'Verwaltung':'Administration',attrs:{href:'/admin'}});body.prepend(link);
 }catch{/* This optional online entry does not block account/device controls. */}
}
