// 网络环境探测与自适应策略：根据浏览器上报的连接类型、省流开关与实测延迟/吞吐，
// 决定缩略图、预取、视频预载、大图加载、PDF 渲染精度等行为。全部是渐进增强，失败时退回默认值。
const CHOICE_KEY='net';
const MEASURE_KEY='class-hub-net';
export const profileLabels={lite:'省流',balanced:'标准',quality:'高清'};
export const profiles={
 lite:{thumbs:true,prefetch:false,videoPreload:'none',autoFullImage:1200000,visualizer:false,density:1.25,parallelFetch:2},
 balanced:{thumbs:true,prefetch:true,videoPreload:'metadata',autoFullImage:6000000,visualizer:true,density:2,parallelFetch:4},
 quality:{thumbs:true,prefetch:true,videoPreload:'metadata',autoFullImage:0,visualizer:true,density:2.5,parallelFetch:6}
};
export function connectionInfo(){
 const nav=navigator.connection||navigator.mozConnection||navigator.webkitConnection||{};
 return {saveData:!!nav.saveData,effectiveType:String(nav.effectiveType||''),downlink:Number(nav.downlink)||0,rtt:Number(nav.rtt)||0,online:navigator.onLine!==false};
}
const median=list=>{if(!list.length)return 0;const sorted=[...list].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)/2)]};
// 用真实资源计时的中位数估计延迟与吞吐（KB/ms）
export function measure(){
 let entries=[];
 try{entries=performance.getEntriesByType?performance.getEntriesByType('resource'):[]}catch(error){entries=[]}
 const latencies=[],rates=[];
 for(const entry of entries){
  if(!entry.name||entry.name.indexOf(location.origin)!==0)continue;
  const size=entry.encodedBodySize||entry.transferSize||0,duration=entry.duration||0;
  if(duration<=0||size<=0)continue;
  if(size<=4096&&duration<5000)latencies.push(duration);
  if(size>=16384)rates.push(size/duration);
 }
 return {rtt:Math.round(median(latencies)),kbps:Math.round(median(rates)*1000),samples:latencies.length+rates.length};
}
function savedMeasure(){try{const raw=JSON.parse(localStorage.getItem(MEASURE_KEY)||'{}');return raw&&typeof raw==='object'?raw:{}}catch(error){return {}}}
function saveMeasure(value){try{localStorage.setItem(MEASURE_KEY,JSON.stringify(value))}catch(error){}}
export function decide(info,measured){
 if(!info.online)return 'lite';
 if(info.saveData)return 'lite';
 const type=info.effectiveType;
 if(type==='slow-2g'||type==='2g')return 'lite';
 const mbps=info.downlink||measured.mbps||0;
 const rtt=info.rtt||measured.rtt||0;
 if(type==='3g')return mbps>=1.5&&rtt&&rtt<300?'balanced':'lite';
 if(rtt>700&&rtt!==0)return 'lite';
 if(rtt>350&&rtt!==0)return 'balanced';
 if(mbps&&mbps<1.2)return 'lite';
 if(mbps&&mbps<4)return 'balanced';
 if(type==='4g'&&(!mbps||mbps>=4))return 'quality';
 return 'balanced';
}
export function choice(){try{const value=window.__classHubPrefs&&window.__classHubPrefs.get?window.__classHubPrefs.get(CHOICE_KEY):'auto';return ['auto','lite','balanced','quality'].includes(value)?value:'auto'}catch(error){return 'auto'}}
export function resolve(){
 const info=connectionInfo(),saved=savedMeasure();
 const measured={rtt:saved.rtt||0,mbps:saved.mbps||0};
 const picked=choice();
 const profile=picked==='auto'?decide(info,measured):picked;
 return {profile,choice:picked,info,measured,at:Number(saved.at)||0,source:picked==='auto'?'auto':'manual'};
}
let state=null;
export function net(){return state||(state=resolve())}
export function settings(){return profiles[net().profile]||profiles.balanced}
export function apply(){
 const current=resolve(),settings=profiles[current.profile]||profiles.balanced;
 state=current;
 try{document.documentElement.dataset.net=current.profile;document.documentElement.dataset.netSource=current.source}catch(error){}
 window.dispatchEvent(new CustomEvent('classhub:net',{detail:current}));
 return current;
}
export function observe(){
 try{
  const nav=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  if(nav&&nav.addEventListener)nav.addEventListener('change',()=>apply());
 }catch(error){}
 window.addEventListener('online',()=>apply());
 window.addEventListener('offline',()=>apply());
 // 页面加载完成后用真实数据复核一次：只有明显更快/更慢时才改变档位，避免来回跳
 window.addEventListener('load',()=>{setTimeout(()=>{
  const measured=measure();
  if(!measured.samples)return;
  const saved=savedMeasure(),previous={rtt:saved.rtt||0,mbps:saved.mbps||0};
  const next={rtt:measured.rtt,mbps:Math.round(measured.kbps/1000*10)/10,at:Date.now(),effectiveType:connectionInfo().effectiveType};
  saveMeasure(next);
  const before=decide(connectionInfo(),previous),after=decide(connectionInfo(),next);
  if(before!==after)apply();
 },1200)});
 return true;
}
export function describe(){
 const current=net(),info=current.info,measured=current.measured;
 const parts=[];
 parts.push(current.choice==='auto'?'自动判定：'+profileLabels[current.profile]:'手动选择：'+profileLabels[current.profile]);
 if(info.effectiveType)parts.push(info.effectiveType.toUpperCase());
 if(info.downlink)parts.push('下行 '+info.downlink+' Mb/s');
 if(info.rtt)parts.push('延迟 '+info.rtt+' ms');
 if(measured.rtt)parts.push('实测 '+measured.rtt+' ms');
 if(info.saveData)parts.push('系统省流已开');
 return parts.join(' · ');
}
if(typeof window!=='undefined')window.__classHubNet={get:()=>net(),settings,apply,describe,measure,decide,profiles};
