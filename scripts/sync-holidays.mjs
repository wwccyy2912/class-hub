import fs from 'node:fs/promises';
// 法定节假日与调休数据同步：默认取 holiday-cn（依据国务院办公厅公告整理，按年一个 JSON）。
const template=process.env.HOLIDAY_SOURCE||'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/{year}.json';
const dataFile=process.argv[2]||'data/holidays.json';
const beijingNow=()=>new Date(Date.now()+8*3600000);
const year=Number(process.argv[3])||beijingNow().getUTCFullYear();
const from=Number(process.argv[4])||year-1,to=Number(process.argv[5])||year+2;
const compact=doc=>'{\n "version": 1,\n "source": '+JSON.stringify(doc.source)+',\n "syncedAt": '+JSON.stringify(doc.syncedAt)+',\n "days": [\n'+doc.days.map(d=>'  '+JSON.stringify(d)).join(',\n')+'\n ]\n}\n';

let existing={days:[]};
try{existing=JSON.parse(await fs.readFile(dataFile,'utf8'))}catch{}
const fetched=new Map();
for(let y=from;y<=to;y++){
 const url=template.replace('{year}',String(y));
 try{
  const response=await fetch(url);
  if(!response.ok){console.warn('跳过 '+y+'：HTTP '+response.status);continue}
  const json=await response.json();
  const days=Array.isArray(json.days)?json.days:[];
  if(!days.length){console.warn('跳过 '+y+'：官方公告尚未发布');continue}
  fetched.set(String(y),days.map(d=>({date:d.date,name:d.name,off:!!d.isOffDay})));
 }catch(error){console.warn('跳过 '+y+'：'+error.message)}
}
if(!fetched.size){console.error('没有获取到任何节假日数据（检查网络，或用 HOLIDAY_SOURCE 指定镜像）。');process.exit(1)}
const kept=(existing.days||[]).filter(d=>!fetched.has(d.date.slice(0,4)));
const days=[...kept,...[...fetched.values()].flat()].sort((a,b)=>a.date<b.date?-1:1);
const before=new Set((existing.days||[]).map(d=>d.date+(d.off?'':'-work')));
const after=new Set(days.map(d=>d.date+(d.off?'':'-work')));
const added=[...after].filter(d=>!before.has(d)),removed=[...before].filter(d=>!after.has(d));
const doc={version:1,source:'holiday-cn（github.com/NateScarlet/holiday-cn，依据国务院办公厅节假日安排公告）',syncedAt:beijingNow().toISOString().slice(0,10),days};
await fs.mkdir(dataFile.split('/').slice(0,-1).join('/')||'.',{recursive:true});
await fs.writeFile(dataFile,compact(doc));
const years=[...new Set(days.map(d=>d.date.slice(0,4)))];
console.log('已写入 '+dataFile+'：'+days.length+' 天（'+years.join('、')+'），放假 '+days.filter(d=>d.off).length+' 天，调休上班 '+days.filter(d=>!d.off).length+' 天。');
if(added.length)console.log('新增 '+added.length+' 天：'+added.slice(0,12).join(' ')+(added.length>12?' …':''));
if(removed.length)console.log('移除 '+removed.length+' 天：'+removed.slice(0,12).join(' ')+(removed.length>12?' …':''));
