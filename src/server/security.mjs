export const hex=a=>Array.from(new Uint8Array(a),x=>x.toString(16).padStart(2,'0')).join('');
export const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(s){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))}
export async function hashPassword(password,salt=random()) {const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return salt+':'+hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256))}
export async function verifyPassword(password,hash){if(!hash||typeof password!=='string')return false;const actual=await hashPassword(password,hash.split(':')[0]);let diff=actual.length^hash.length;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^hash.charCodeAt(i);return diff===0}
export function validPassword(p){return typeof p==='string'&&p.length>=12&&p.length<=128}
export function cleanOutline(raw,pages){if(!Array.isArray(raw)||raw.length>300)throw Error('大纲格式无效');return raw.map(i=>{if(typeof i.title!=='string'||!i.title.trim()||i.title.length>160||!Number.isInteger(i.page)||i.page<1||i.page>pages)throw Error('大纲页码或标题无效');return {title:i.title.trim(),page:i.page,level:Math.min(2,Math.max(0,Number(i.level)||0))}})}
