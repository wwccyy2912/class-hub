export async function extractOutline(pdf,onProgress=()=>{}){
 const native=await pdf.getOutline();const items=[];
 async function walk(nodes,depth=0){for(const n of nodes||[]){let dest=n.dest;if(typeof dest==='string')dest=await pdf.getDestination(dest);let page=null;try{if(dest)page=typeof dest[0]==='number'?dest[0]+1:(await pdf.getPageIndex(dest[0]))+1}catch{}if(page&&n.title)items.push({title:n.title.trim().slice(0,160),page,level:Math.min(depth,2)});await walk(n.items,depth+1)}}
 if(native?.length){await walk(native);const pages=items.map(i=>i.page);if(items.length&&Math.min(...pages)<=3&&Math.max(...pages)>=pdf.numPages*.6)return {items:items.slice(0,300),mode:'bookmarks',pages:pdf.numPages};items.length=0}
 let textPages=0;const seen=new Set();
 for(let page=1;page<=pdf.numPages;page++){
  onProgress(page,pdf.numPages);const p=await pdf.getPage(page);const tc=await p.getTextContent();const lines=[];
  for(const i of tc.items){if(!i.str?.trim())continue;let line=lines.find(l=>Math.abs(l.y-i.transform[5])<3);if(!line){line={y:i.transform[5],size:0,parts:[]};lines.push(line)}line.size=Math.max(line.size,Math.abs(i.height||i.transform[3]));line.parts.push({x:i.transform[4],s:i.str})}
  lines.sort((a,b)=>b.y-a.y);for(const l of lines)l.text=l.parts.sort((a,b)=>a.x-b.x).map(x=>x.s).join('').replace(/\s+/g,' ').trim();
  const useful=lines.filter(l=>l.text.length>2&&!/^\d+$/.test(l.text));if(!useful.length)continue;textPages++;
  const sizes=useful.map(l=>l.size).sort((a,b)=>a-b),median=sizes[Math.floor(sizes.length/2)]||12;
  let candidates=useful.filter((l,i)=>l.text.length<=45&&!/[，。；]|\d{10}|教练[:：]|裁判员[:：]|序\s*号/.test(l.text)&&(l.size>=median*1.18||(/^第.{1,8}[章节篇部分]|^[一二三四五六七八九十]+[、．.]|程序$|规程$|安排$|日程$/.test(l.text)&&i<12))).slice(0,5);
  if(!candidates.length)candidates=useful.slice(0,3).filter(l=>l.text.length<=28&&!/[，。；：:]|\d{10}|^第.{1,3}组/.test(l.text)).slice(0,1);
  for(const l of candidates){const key=l.text.replace(/\s/g,'');if(seen.has(key))continue;seen.add(key);items.push({title:l.text,page,level:0})}p.cleanup();
 }
 return {items:items.slice(0,300),mode:textPages?'headings':'scanned',pages:pdf.numPages};
}
