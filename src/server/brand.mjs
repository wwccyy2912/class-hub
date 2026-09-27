// 网站品牌（学校 / 班级名称 / 副标题）：可被管理员修改，全站生效。
export const defaultBrand={school:'',name:'2028届1班',subtitle:'信息资源共享网站'};
const entities={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>entities[ch]);
const text=(value,fallback,max)=>{const out=String(value??'').trim().replace(/\s+/g,' ');return out?out.slice(0,max):fallback};
export function cleanBrand(map={}){
 return {school:text(map['brand:school'],defaultBrand.school,40),name:text(map['brand:name'],defaultBrand.name,30),subtitle:text(map['brand:subtitle'],defaultBrand.subtitle,30)};
}
export function brandView(brand){
 const sub=brand.school?brand.school+' · '+brand.subtitle:brand.subtitle;
 return {brand,title:(brand.school?brand.school+' ':'')+brand.name+brand.subtitle,name:brand.name,sub,footer:(brand.school?brand.school+' · ':'')+brand.name+' · '+brand.subtitle};
}
export function renderHtml(html,view,assets={}){
 const map={TITLE:view.title,NAME:view.brand.name,SUB:view.sub,FOOTER:view.footer,V_THEME:assets.theme||'',V_CSS:assets.css||'',V_JS:assets.app||'',V_ICON:assets.icons||'',ASSETS:JSON.stringify({pdf:assets.pdf||'',worker:assets.worker||''})};
 return html.replace(/\{\{(TITLE|NAME|SUB|FOOTER|V_THEME|V_CSS|V_JS|V_ICON|ASSETS)\}\}/g,(all,key)=>escapeHtml(map[key]||''));
}
let cache={value:null,expires:0};
export const cachedBrand=()=>cache.value&&cache.expires>Date.now()?cache.value:null;
export const putBrand=(brand,ttl=15000)=>{cache={value:brand,expires:Date.now()+ttl}};
export function brandFields(body,current){
 const pick=(value,fallback,label,max)=>{if(value===undefined)return fallback;const out=String(value).trim().replace(/\s+/g,' ');if(out.length>max)throw Object.assign(Error(label+'最多 '+max+' 个字符'),{status:400});return out};
 return {school:pick(body.school,current.school,'学校名称',40),name:pick(body.className,current.name,'班级名称',30),subtitle:pick(body.subtitle,current.subtitle,'网站副标题',30)};
}