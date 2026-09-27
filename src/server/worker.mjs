import html from '../../assets/app.html';
import themeJs from '../../assets/theme.js';
import {fileTypes,validateFile,siteKinds,kindOf,allowedExtensions,isImage,isVideo,isAudio,textExtensions,extension,uploadLimitFor,limitText,chunkSize} from '../shared/file-types.mjs';
import {zipEntries,zipSummary} from '../shared/zip.mjs';
import css from '../../generated/style.min.css';
import appJs from '../../generated/app.txt';
import pdfJs from 'pdfjs-dist/build/pdf.mjs';
import pdfWorker from './worker.mjs';
import pdfResourcesPacked from '../../generated/pdf-resources.gz.txt';
import assetVersions from '../../generated/versions.json';
import iconSvg from '../../generated/icons/icon.svg';
import faviconIco from '../../generated/icons/favicon.ico';
import icon16 from '../../generated/icons/icon-16.png';
import icon32 from '../../generated/icons/icon-32.png';
import icon48 from '../../generated/icons/icon-48.png';
import icon192 from '../../generated/icons/icon-192.png';
import icon512 from '../../generated/icons/icon-512.png';
import appleTouch from '../../generated/icons/apple-touch-icon.png';
import holidaySnapshot from '../../data/holidays.json';
import {beijingDate,addDays,planFor,buildMonth,monthHolidays,isDate,weekdayIndex,isoWeekNumber,weekInfo,upcoming} from '../shared/schedule.mjs';
import {cleanBrand,brandView,renderHtml,brandFields,cachedBrand,putBrand} from './brand.mjs';
import {permissionList,permissionKeys,cleanPermissions,parsePermissions,permissionsOf,can,needs} from '../shared/permissions.mjs';
import {random,digest,hashPassword,verifyPassword,validPassword,cleanOutline} from './security.mjs';
const cookieName='class_session';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
async function cachedJson(req,data,tag=''){const body=JSON.stringify(data),etag='W/"'+tag+'-'+(await digest(body)).slice(0,24)+'"';const cache='private,max-age=15';if(req.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers:{'Cache-Control':cache,'ETag':etag}});return new Response(body,{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':cache,'ETag':etag}})}
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const safeUser=u=>({id:u.id,username:u.username,name:u.name,role:u.role,groupId:u.group_id||'',permissions:permissionsOf(u),disabled:u.disabled,mustChange:!!u.must_change,muteGroup:!!u.mute_group,muteDirect:!!u.mute_direct});
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
async function limited(req,max){const reader=req.body?.getReader();if(!reader)return new Uint8Array();const parts=[];let total=0;while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();fail('请求过大',413)}parts.push(value)}const bytes=new Uint8Array(total);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length}return bytes}
async function body(req){const bytes=await limited(req,100000);try{return JSON.parse(new TextDecoder().decode(bytes))}catch{fail('请求格式无效')}}
async function current(req,env){const t=req.headers.get('cookie')?.match(/(?:^|;\s*)class_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!t)return null;return stmt(env,'SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.disabled=0',await digest(t),Date.now()).first()}
const attemptWindow=900000;
async function blocked(env,key,max){const row=await stmt(env,'SELECT count,expires FROM attempts WHERE key=?',key).first();return !!row&&row.expires>Date.now()&&row.count>=max}
async function countFailure(env,key){const now=Date.now();await stmt(env,'INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END',key,now+attemptWindow,now,now).run()}
async function setSession(env,u){const token=random();await env.DB.batch([stmt(env,'DELETE FROM sessions WHERE expires<?',Date.now()),stmt(env,'INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',await digest(token),u.id,Date.now()+8*3600000)]);return `${cookieName}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`}
function validateAccount(b){if(!/^[a-zA-Z0-9_.-]{3,32}$/.test(b.username||''))fail('账号需为 3–32 位字母、数字或 . _ -');if(!validPassword(b.password))fail('密码需为 12–128 个字符');if(b.role!==undefined&&!['admin','member'].includes(b.role))fail('权限无效');if(typeof b.name!=='string'||!b.name.trim()||b.name.length>50)fail('请输入 1–50 字的姓名')}
function info(d){return {...d,outline:JSON.parse(d.outline),entries:d.entries?JSON.parse(d.entries):[],meta:d.meta?JSON.parse(d.meta):{},kind:kindOf(d.site_kind||d.kind)}}
function brief(d){const full=info(d),entries=full.entries||[];return {...full,outline:[],entries:[],entryCount:entries.length}}
const slugPattern=/^[a-z0-9][a-z0-9-]{1,31}$/;
const safeSite=s=>({id:s.id,slug:s.slug,name:s.name,description:s.description,kind:kindOf(s.kind),count:s.count??0});
function validateSite(b){const name=String(b.name||'').trim(),slug=String(b.slug||'').trim().toLowerCase(),description=String(b.description||'').trim().replace(/\s+/g,' '),rawKind=String(b.kind||'files');if(!siteKinds[rawKind])fail('站点类型只能是 files（文件）、folder（文件夹）或 gallery（图册）');if(!name||name.length>50)fail('站点名称需为 1–50 个字符');if(!slugPattern.test(slug))fail('访问路径需为 2–32 位小写字母、数字或 -');if(description.length>120)fail('站点说明最多 120 个字符');return {id:crypto.randomUUID(),name,slug,description,kind:rawKind}}
async function findSite(env,value){if(!value)return null;return stmt(env,'SELECT * FROM sites WHERE id=? OR slug=?',value,value).first()}
async function siteList(env){const rows=await stmt(env,'SELECT s.*,(SELECT COUNT(*) FROM documents d WHERE d.site_id=s.id) AS count FROM sites s ORDER BY s.sort ASC,s.created ASC').all();return rows.results.map(s=>safeSite(s))}
const snapshotDays=Array.isArray(holidaySnapshot?.days)?holidaySnapshot.days:[];
const snapshotStamp=holidaySnapshot?.syncedAt||'';
const holidayFeed=year=>'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/'+year+'.json';
const defaultFollow=(date,off)=>{if(off)return 0;const weekday=weekdayIndex(date);return weekday===6?5:weekday===7?1:0};
const upsertHoliday=(env,day,source,now)=>{const follow=day.follow===undefined||day.follow===null?defaultFollow(day.date,day.off):Number(day.follow)||0;
 return stmt(env,'INSERT INTO holidays(date,name,off,follow,source,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET name=excluded.name,off=excluded.off,follow=excluded.follow,source=excluded.source,updated=excluded.updated WHERE holidays.source<>?',day.date,String(day.name||''),day.off?1:0,follow,source,now,'manual')};
async function ensureSnapshot(env){
 if(!snapshotDays.length||!snapshotStamp)return;
 const row=await stmt(env,'SELECT value FROM meta WHERE key=?','holidays:snapshot').first();if(row&&row.value===snapshotStamp)return;
 const now=Date.now();await env.DB.batch([...snapshotDays.map(d=>upsertHoliday(env,{date:d.date,name:d.name,off:!!d.off},'snapshot',now)),stmt(env,'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','holidays:snapshot',snapshotStamp)]);
}
const defaultSettings={termStart:'',countdownDays:14,countdownLimit:3,chatRecall:10,chatRetention:90};
// —— 聊天（班级大群 + 一对一私聊）——
const groupRoom='class';
const directRoom=(a,b)=>'dm:'+[String(a),String(b)].sort().join(':');
function roomInfo(value,userId){
 const room=String(value||'').trim();
 if(room===groupRoom)return {room,kind:'group',members:'all'};
 const parts=room.split(':');
 if(parts.length===3&&parts[0]==='dm'&&(parts[1]===userId||parts[2]===userId)){const other=parts[1]===userId?parts[2]:parts[1];if(!/^[\w-]{6,64}$/.test(other))fail('会话不存在',404);return {room,kind:'direct',other}}
 fail('会话不存在',404)
}
function messageBody(value,allowEmpty){const text=String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/\s+/g,' ').trim();if(!text){if(allowEmpty)return '';return fail('消息不能为空')}if(text.length>500)fail('消息最多 500 个字');return text}
function mentionIds(body,people){const text=String(body||''),found=[];for(const person of people){if(!person.name||found.includes(person.id))continue;if(text.indexOf('@'+person.name)>=0)found.push(person.id)}return found;}
const attachmentInfo=value=>{if(!value)return null;try{const parsed=JSON.parse(value);return parsed&&parsed.key?parsed:null}catch(error){return null}}
async function chatPeople(env){return (await stmt(env,'SELECT id,name,username FROM users WHERE disabled=0').all()).results}
async function cleanupChat(env,force,hours){
 const config=await settings(env);if(!hours&&!config.chatRetention)return {removed:0,kept:true};
 const marker=await stmt(env,"SELECT value FROM meta WHERE key='chat:cleaned'").first(),last=Number(marker&&marker.value)||0;
 if(!force&&Date.now()-last<3600000)return {removed:0,throttled:true};
 const cutoff=hours?Date.now()-Math.max(1000,Number(hours)*3600000):Date.now()-config.chatRetention*86400000;let removed=0;
 for(let round=0;round<6;round++){
  const rows=(await stmt(env,'SELECT id,attachment FROM messages WHERE created<? ORDER BY created ASC LIMIT 200',cutoff).all()).results;
  if(!rows.length)break;
  for(const row of rows){const attachment=attachmentInfo(row.attachment);if(attachment&&attachment.key){try{await env.BUCKET.delete(attachment.key)}catch(error){}}}
  for(let start=0;start<rows.length;start+=50){const chunk=rows.slice(start,start+50);await stmt(env,'DELETE FROM messages WHERE id IN ('+chunk.map(()=>'?').join(',')+')',...chunk.map(row=>row.id)).run()}
  removed+=rows.length;if(rows.length<200)break;
 }
 await saveSetting(env,'chat:cleaned',Date.now()).run();
 return {removed,cutoff};
}
async function throttle(env,key,max,windowMs){const now=Date.now(),row=await stmt(env,'SELECT count,expires FROM attempts WHERE key=?',key).first();if(row&&row.expires>now&&row.count>=max)fail('发送太频繁，请稍后再试',429);await stmt(env,'INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END',key,now+windowMs,now,now).run()}
async function chatRooms(env,user){
 const stats=(await stmt(env,"SELECT m.room AS room,COUNT(*) AS total,SUM(CASE WHEN m.sender_id<>? AND m.created>COALESCE(r.seen,0) THEN 1 ELSE 0 END) AS unread,SUM(CASE WHEN m.sender_id<>? AND m.created>COALESCE(r.seen,0) AND m.mentions LIKE '%'||?||'%' THEN 1 ELSE 0 END) AS mentions FROM messages m LEFT JOIN chat_reads r ON r.user_id=? AND r.room=m.room WHERE m.room=? OR instr(m.room,?)>0 GROUP BY m.room",user.id,user.id,user.id,user.id,groupRoom,user.id).all()).results;
 const byRoom=Object.fromEntries(stats.map(row=>[row.room,{total:row.total||0,unread:row.unread||0,mentions:row.mentions||0}]));
 const latest=(await stmt(env,"SELECT m.room AS room,m.body AS body,m.created AS created,m.sender_id AS sender,u.name AS sender_name FROM messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.room=? OR instr(m.room,?)>0 ORDER BY m.created DESC LIMIT 500",groupRoom,user.id).all()).results;
 const last={};for(const row of latest){if(!last[row.room])last[row.room]=row}
 const people=(await stmt(env,'SELECT id,name,username,role FROM users WHERE disabled=0 ORDER BY name ASC,created ASC').all()).results;
 const brief=row=>row?{body:row.body,created:row.created,senderName:row.sender_name||'',mine:row.sender===user.id}:null;
 const groupStat=byRoom[groupRoom]||{total:0,unread:0,mentions:0};
 const rooms=[{room:groupRoom,kind:'group',title:'班级大群',note:people.length+' 位成员',members:people.length,total:groupStat.total,unread:groupStat.unread,mentions:groupStat.mentions,last:brief(last[groupRoom])}];
 for(const person of people){if(person.id===user.id)continue;const room=directRoom(user.id,person.id),stat=byRoom[room]||{total:0,unread:0,mentions:0};
  rooms.push({room,kind:'direct',title:person.name,note:'@'+person.username+(person.role==='admin'?' · 管理员':''),userId:person.id,members:2,total:stat.total,unread:stat.unread,mentions:stat.mentions,last:brief(last[room])})}
 return rooms;}
async function setupDone(env){const row=await stmt(env,"SELECT value FROM meta WHERE key='setup:complete'").first();if(row&&row.value==='1')return true;return !!(await stmt(env,"SELECT id FROM users WHERE role='admin' LIMIT 1").first())}
const groupList=async env=>{const rows=await stmt(env,'SELECT g.*,(SELECT COUNT(*) FROM users u WHERE u.group_id=g.id) AS members FROM groups g ORDER BY g.created ASC').all();return rows.results.map(g=>({id:g.id,name:g.name,permissions:parsePermissions(g.permissions),note:g.note||'',members:g.members||0}))};
function groupFields(b,base={}){const name=String(b.name===undefined?base.name||'':b.name).trim();if(!name||name.length>30)fail('用户组名称需为 1–30 个字符');const note=String(b.note===undefined?base.note||'':b.note).trim().slice(0,80);const permissions=b.permissions===undefined?parsePermissions(base.permissions):cleanPermissions(b.permissions);return {name,note,permissions}}
async function assignGroup(env,groupId){if(!groupId)return null;const group=await stmt(env,'SELECT * FROM groups WHERE id=?',String(groupId)).first();if(!group)fail('用户组不存在',404);return group}
let pdfResourceCache=null;
async function pdfResourceMap(){if(pdfResourceCache)return pdfResourceCache;const bytes=Uint8Array.from(atob(pdfResourcesPacked),c=>c.charCodeAt(0));const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));pdfResourceCache=JSON.parse(await new Response(stream).text());return pdfResourceCache}
async function brandOf(env){const hit=cachedBrand();if(hit)return hit;const rows=await stmt(env,'SELECT key,value FROM meta WHERE key IN (?,?,?)','brand:school','brand:name','brand:subtitle').all();const brand=cleanBrand(Object.fromEntries(rows.results.map(row=>[row.key,row.value])));putBrand(brand);return brand}
const weekPayload=(date,termStart)=>{const info=weekInfo(date,termStart);return {...info,parityText:info.parity==='odd'?'单周':'双周'}};
async function settings(env){
 const rows=await stmt(env,'SELECT key,value FROM meta WHERE key IN (?,?,?,?,?)','term:start','countdown:days','countdown:limit','chat:recall','chat:retention').all();
 const map=Object.fromEntries(rows.results.map(row=>[row.key,row.value]));
 const days=Number(map['countdown:days']),limit=Number(map['countdown:limit']),recall=Number(map['chat:recall']),retention=Number(map['chat:retention']);
 return {termStart:isDate(map['term:start'])?map['term:start']:'',countdownDays:Number.isInteger(days)&&days>=1&&days<=60?days:defaultSettings.countdownDays,countdownLimit:Number.isInteger(limit)&&limit>=1&&limit<=8?limit:defaultSettings.countdownLimit,chatRecall:Number.isInteger(recall)&&recall>=0&&recall<=1440?recall:defaultSettings.chatRecall,chatRetention:Number.isInteger(retention)&&retention>=0&&retention<=3650?retention:defaultSettings.chatRetention};
}
const chunkUploadPrefix='upload:';
function pendingKey(value){const key=String(value||'');if(key.indexOf(chunkUploadPrefix)!==0||key.length>80)fail('上传会话无效',400);return key}
const saveSetting=(env,key,value)=>stmt(env,'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,String(value));
async function eventList(env){const rows=await stmt(env,'SELECT * FROM events ORDER BY date ASC,name ASC').all();return rows.results.map(e=>({id:e.id,date:e.date,name:e.name,note:e.note||''}))}
function eventFields(b,base={}){const date=String(b.date??base.date??'').trim(),name=String(b.name??base.name??'').trim(),note=String(b.note??base.note??'').trim();
 if(!isDate(date))fail('日期格式应为 YYYY-MM-DD');if(!name||name.length>30)fail('事件名称需为 1–30 个字符');if(note.length>60)fail('备注最多 60 个字符');
 return {date,name,note};
}
async function holidayMap(env){const rows=await stmt(env,'SELECT date,name,off,follow FROM holidays').all();const map={};for(const r of rows.results)map[r.date]={name:r.name,off:!!r.off,follow:r.follow||0};return map}
async function courseList(env){const rows=await stmt(env,'SELECT * FROM courses ORDER BY weekday ASC,period ASC,start ASC').all();return rows.results.map(c=>({id:c.id,weekday:c.weekday,period:c.period,span:c.span||1,weeks:c.weeks||'all',name:c.name,teacher:c.teacher,room:c.room,start:c.start,end:c.end,note:c.note}))}
function courseFields(b,base={}){
 const weekday=Number(b.weekday??base.weekday),period=Number(b.period??base.period),name=String(b.name??base.name??'').trim(),teacher=String(b.teacher??base.teacher??'').trim(),room=String(b.room??base.room??'').trim(),note=String(b.note??base.note??'').trim();
 const clock=value=>{const raw=String(value??'').trim();if(!raw)return '';if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(raw))fail('时间格式应为 HH:MM');return raw.padStart(5,'0')};
 const start=clock(b.start??base.start),end=clock(b.end??base.end);
 const span=Number(b.span===undefined?base.span??1:b.span),weeksValue=String(b.weeks===undefined?base.weeks??'all':b.weeks);
 if(!Number.isInteger(weekday)||weekday<1||weekday>7)fail('星期无效');if(!Number.isInteger(period)||period<1||period>20)fail('节次需为 1–20');
 if(!Number.isInteger(span)||span<1||span>4)fail('连堂节数需为 1–4');if(period+span-1>20)fail('连堂超出节次范围');
 if(!['all','odd','even'].includes(weeksValue))fail('周次只能是 all、odd（单周）或 even（双周）');
 if(!name||name.length>40)fail('科目名称需为 1–40 个字符');if(teacher.length>20||room.length>20)fail('老师或教室名称最多 20 个字符');if(note.length>60)fail('备注最多 60 个字符');
 return {weekday,period,span,weeks:weeksValue,name,teacher,room,start,end,note};
}
async function timetablePayload(env){
 await ensureSnapshot(env);const map=await holidayMap(env),courses=await courseList(env),today=beijingDate(),config=await settings(env),events=await eventList(env),term={termStart:config.termStart};
 const synced=await stmt(env,'SELECT value FROM meta WHERE key=?','holidays:synced').first();
 return {today:planFor(today,map,courses,term),tomorrow:planFor(addDays(today,1),map,courses,term),dayAfter:planFor(addDays(today,2),map,courses,term),days:[0,1,2,3,4,5,6].map(offset=>planFor(addDays(today,offset),map,courses,term)),week:weekPayload(today,config.termStart),upcoming:upcoming(map,events,today,{range:config.countdownDays,limit:config.countdownLimit}),events,settings:config,courses,source:holidaySnapshot?.source||'',syncedAt:synced?.value||snapshotStamp};
}
async function handle(req,env){
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(!['GET','HEAD','POST','PATCH','DELETE'].includes(method))fail('不支持的操作',405);
 if(!['GET','HEAD'].includes(method)&&req.headers.get('origin')!==url.origin)fail('来源验证失败，请刷新页面重试',403);
 const pdfAsset=path.match(/^\/pdf-assets\/(?:([0-9a-f]{8})\/)?(.+)$/);
 if(pdfAsset){const key=pdfAsset[2],data=(await pdfResourceMap())[key];if(!data)fail('资源不存在',404);const fresh=pdfAsset[1]===assetVersions.pdf;return new Response(Uint8Array.from(atob(data),c=>c.charCodeAt(0)),{headers:{'Content-Type':key.endsWith('.wasm')?'application/wasm':key.endsWith('.js')?'text/javascript':'application/octet-stream','Cache-Control':fresh?'public,max-age=31536000,immutable':'public,max-age=86400'}})}
 const icons={'/icon.svg':[iconSvg,'image/svg+xml'],'/favicon.ico':[faviconIco,'image/x-icon'],'/icon-16.png':[icon16,'image/png'],'/icon-32.png':[icon32,'image/png'],'/icon-48.png':[icon48,'image/png'],'/icon-192.png':[icon192,'image/png'],'/icon-512.png':[icon512,'image/png'],'/apple-touch-icon.png':[appleTouch,'image/png']};
 if(icons[path]){const [encoded,type]=icons[path];const fresh=url.searchParams.get('v')===assetVersions.icons;const data=type==='image/svg+xml'?encoded:Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));return new Response(data,{headers:{'Content-Type':type+(type==='image/svg+xml'?'; charset=utf-8':''),'Cache-Control':fresh?'public,max-age=31536000,immutable':'public,max-age=300'}})}
 if(path==='/site.webmanifest'){const view=brandView(await brandOf(env)),stamp=assetVersions.icons||'';return new Response(JSON.stringify({name:view.title,short_name:view.brand.name,start_url:'/',display:'standalone',background_color:'#f6f9ff',theme_color:'#2453c0',icons:[{src:'/icon-192.png?v='+stamp,sizes:'192x192',type:'image/png'},{src:'/icon-512.png?v='+stamp,sizes:'512x512',type:'image/png'}]}),{headers:{'Content-Type':'application/manifest+json; charset=utf-8','Cache-Control':'public,max-age=600'}})}
 const assets={'/style.css':[css,'text/css','css'],'/theme.js':[themeJs,'text/javascript','theme'],'/app.js':[appJs,'text/javascript','app'],'/pdf.mjs':[pdfJs,'text/javascript','pdf'],'/pdf.worker.mjs':[pdfWorker,'text/javascript','worker']};
 if(assets[path]){const fresh=url.searchParams.get('v')===assetVersions[assets[path][2]];return new Response(assets[path][0],{headers:{'Content-Type':assets[path][1]+'; charset=utf-8','Cache-Control':fresh?'public,max-age=31536000,immutable':'public,max-age=300'}})}
 if(path==='/sports/')return Response.redirect(url.origin+'/',301);
 if(['/','/index.html','/admin/','/account/','/calendar/','/timetable/','/chat/'].includes(path)||/^\/sites\/[a-z0-9-]{2,32}\/$/.test(path)){
  const view=brandView(await brandOf(env)),markup=renderHtml(html,view,assetVersions),tag='"'+await digest(markup).then(h=>h.slice(0,32))+'"';
  const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','ETag':tag};
  if(req.headers.get('if-none-match')===tag)return new Response(null,{status:304,headers});
  return new Response(markup,{headers});
 }
 if(!path.startsWith('/api/'))fail('页面不存在',404);
 if(path==='/api/setup'&&method==='POST'){
  const ipKey='setup:'+await digest(req.headers.get('cf-connecting-ip')||'local');
  if(await blocked(env,ipKey,12))fail('尝试次数过多，请 15 分钟后再试',429);
  if(await setupDone(env))fail('网站已经完成初始化，请直接登录',403);
  try{
   const b=await body(req),username=String(b.username||'').trim().toLowerCase(),name=String(b.name||'').trim()||'班级管理员',password=String(b.password||'');
   if(!/^[a-zA-Z0-9_.-]{3,32}$/.test(username))fail('管理员账号需为 3–32 位字母、数字或 . _ -');
   if(!validPassword(password))fail('密码需为 12–128 个字符');
   if(b.password2!==undefined&&String(b.password2)!==password)fail('两次输入的密码不一致');
   const brand=cleanBrand({'brand:school':b.school,'brand:name':b.className,'brand:subtitle':b.subtitle});
   const id=crypto.randomUUID();
   await env.DB.batch([
    stmt(env,"INSERT INTO users(id,username,name,hash,role,group_id,permissions,disabled,must_change,created) VALUES(?,?,?,?,'admin',NULL,'[]',0,0,?)",id,username,name,await hashPassword(password),Date.now()),
    saveSetting(env,'brand:school',brand.school),saveSetting(env,'brand:name',brand.name),saveSetting(env,'brand:subtitle',brand.subtitle),
    saveSetting(env,'setup:complete','1')
   ]);
   putBrand(brand);
   await stmt(env,'DELETE FROM attempts WHERE key=?',ipKey).run();
   const created=await stmt(env,'SELECT * FROM users WHERE id=?',id).first();
   return json({user:safeUser(created),brand},201,{'Set-Cookie':await setSession(env,created)});
  }catch(error){await countFailure(env,ipKey);throw error}
 }
 if(path==='/api/login'&&method==='POST'){
  const b=await body(req);if(typeof b.username!=='string'||typeof b.password!=='string'||b.password.length>128)fail('账号或密码不正确',401);
  const username=b.username.toLowerCase().trim();if(username.length>32)fail('账号或密码不正确',401);await stmt(env,'DELETE FROM attempts WHERE expires<?',Date.now()).run();const ipKey='ip:'+await digest(req.headers.get('cf-connecting-ip')||'local'),userKey='user:'+username;if(await blocked(env,ipKey,40)||await blocked(env,userKey,12))fail('尝试次数过多，请 15 分钟后再试',429);
  let u=await stmt(env,'SELECT * FROM users WHERE username=?',username).first();
  const valid=await verifyPassword(b.password,u?.hash||'0'.repeat(64)+':'+'0'.repeat(64));if(!valid){await countFailure(env,userKey);await countFailure(env,ipKey);fail('账号或密码不正确',401)}
  if(u.disabled)fail('这个账号已被管理员停用，请联系班级管理员',403);
  await stmt(env,'DELETE FROM attempts WHERE key=? OR key=?',userKey,ipKey).run();return json({user:safeUser(u)},200,{'Set-Cookie':await setSession(env,u)});
 }
 const user=await current(req,env);
 if(path==='/api/me')return json({user:user?safeUser(user):null,brand:await brandOf(env),setup:!(await setupDone(env))});
 if(!user)fail('请先登录班级账户',401);
 if(path==='/api/logout'&&method==='POST'){const t=req.headers.get('cookie')?.match(/class_session=([a-f0-9]{64})/)?.[1];if(t)await stmt(env,'DELETE FROM sessions WHERE token=?',await digest(t)).run();return json({ok:true},200,{'Set-Cookie':`${cookieName}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`})}
 if(path==='/api/password'&&method==='POST'){
  const b=await body(req);const attemptKey='password:'+user.id;if(await blocked(env,attemptKey,12))fail('尝试次数过多，请 15 分钟后再试',429);if(!await verifyPassword(b.oldPassword,user.hash)){await countFailure(env,attemptKey);fail('当前密码不正确')}if(!validPassword(b.password))fail('新密码需为 12–128 个字符');if(b.password===b.oldPassword)fail('新密码不能与当前密码相同');
  await env.DB.batch([stmt(env,'UPDATE users SET hash=?,must_change=0 WHERE id=?',await hashPassword(b.password),user.id),stmt(env,'DELETE FROM sessions WHERE user_id=?',user.id),stmt(env,'DELETE FROM attempts WHERE key=?',attemptKey)]);return json({ok:true},200,{'Set-Cookie':await setSession(env,user)});
 }
 if(user.must_change)fail('请先修改初始密码',403);
 if(path==='/api/sites'&&method==='GET')return cachedJson(req,{sites:await siteList(env)},user.id);
 if(path==='/api/settings'&&method==='GET')return cachedJson(req,{settings:await settings(env),events:await eventList(env)},user.id);
 if(path==='/api/timetable'&&method==='GET')return cachedJson(req,await timetablePayload(env),user.id);
 if(path==='/api/calendar'&&method==='GET'){
  await ensureSnapshot(env);const today=beijingDate(),year=Number(url.searchParams.get('year'))||Number(today.slice(0,4)),month=Number(url.searchParams.get('month'))||Number(today.slice(5,7));
  if(!Number.isInteger(year)||year<2000||year>2100||!Number.isInteger(month)||month<1||month>12)fail('月份无效');
  const map=await holidayMap(env),courses=await courseList(env),synced=await stmt(env,'SELECT value FROM meta WHERE key=?','holidays:synced').first(),config=await settings(env),events=await eventList(env),term={termStart:config.termStart};
  return cachedJson(req,{today:planFor(today,map,courses,term),tomorrow:planFor(addDays(today,1),map,courses,term),dayAfter:planFor(addDays(today,2),map,courses,term),days:[0,1,2].map(offset=>planFor(addDays(today,offset),map,courses,term)),upcoming:upcoming(map,events,today,{range:config.countdownDays,limit:config.countdownLimit}),events,settings:config,week:weekPayload(today,config.termStart),month:buildMonth(year,month,map,events),holidays:monthHolidays(year,month,map),source:holidaySnapshot?.source||'',syncedAt:synced?.value||snapshotStamp,holidayCount:Object.keys(map).length},user.id+":"+year+"-"+month);
 }
 if(path==='/api/documents'&&method==='GET'){
  const requested=url.searchParams.get('site'),site=requested?await findSite(env,requested):null;if(requested&&!site)fail('站点不存在',400);
  const rows=site?await stmt(env,'SELECT d.*,s.slug AS site_slug,s.kind AS site_kind FROM documents d JOIN sites s ON s.id=d.site_id WHERE d.site_id=? ORDER BY d.created DESC',site.id).all():await stmt(env,'SELECT d.*,s.slug AS site_slug,s.kind AS site_kind FROM documents d JOIN sites s ON s.id=d.site_id ORDER BY d.created DESC').all();
  const documents=rows.results.map(site?info:brief);
  return cachedJson(req,{site:site?safeSite(site):null,documents},user.id+(site?":"+site.id:""));
 }
 const thumbMatch=path.match(/^\/api\/documents\/([\w-]+)\/thumb$/);
 if(thumbMatch&&method==='GET'){const row=await stmt(env,'SELECT id FROM documents WHERE id=?',thumbMatch[1]).first();if(!row)fail('文件不存在',404);const object=await env.BUCKET.get('thumb:'+row.id);if(!object)fail('缩略图不存在',404);return new Response(object.body,{headers:{'Content-Type':'image/webp','Cache-Control':'private,max-age=31536000,immutable'}})}
 const pdfMatch=path.match(/^\/api\/documents\/([\w-]+)\/file$/);
 if(pdfMatch&&method==='GET'){
  let bytes,filename,size,type='pdf';
  const row=await stmt(env,'SELECT d.*,s.kind AS site_kind FROM documents d LEFT JOIN sites s ON s.id=d.site_id WHERE d.id=?',pdfMatch[1]).first();
  if(!row)fail('文件不存在',404);
  filename=row.filename;size=row.size;type=row.file_type||'pdf';
  const parsed=/^bytes=(\d*)-(\d*)$/.exec(String(req.headers.get('range')||'').trim());
  if(parsed&&(parsed[1]||parsed[2])){
   const start=parsed[1]?Number(parsed[1]):Math.max(0,size-Number(parsed[2]||0)),end=parsed[1]&&parsed[2]?Math.min(Number(parsed[2]),size-1):size-1;
   if(start>=size||end<start)fail('请求范围无效',416);
   const part=await env.BUCKET.get(row.id,{range:{offset:start,length:end-start+1}});if(!part)fail('文件暂不可用',503);
   return new Response(part.body,{status:206,headers:{'Content-Type':fileTypes[type]?.mime||'application/octet-stream','Content-Length':String(end-start+1),'Content-Range':'bytes '+start+'-'+end+'/'+size,'Accept-Ranges':'bytes','Cache-Control':'private,no-store'}});
  }
  const object=await env.BUCKET.get(row.id);if(!object)fail('文件暂不可用',503);bytes=object.body;
  const inline=(type==='pdf'||textExtensions.includes(type)||isImage(type)||isVideo(type)||isAudio(type))&&!url.searchParams.has('download');
  return new Response(bytes,{headers:{'Content-Type':fileTypes[type]?.mime||'application/octet-stream','Content-Length':String(size),'Content-Disposition':(inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(filename),'Accept-Ranges':'bytes','Cache-Control':'private,no-store'}})
 }
 const guard=(key)=>needs(user,key);
if(path==='/api/sites'&&method==='POST'){needs(user,"sites");
  const site=validateSite(await body(req));if(await findSite(env,site.slug))fail('访问路径已被占用',409);
  const order=await stmt(env,'SELECT COALESCE(MAX(sort),-1)+1 AS next FROM sites').first();
  await stmt(env,'INSERT INTO sites(id,slug,name,description,kind,sort,created) VALUES(?,?,?,?,?,?,?)',site.id,site.slug,site.name,site.description,site.kind,order.next,Date.now()).run();
  return json({site:safeSite({...site,slug:site.slug,count:0})},201);
 }
 const siteMatch=path.match(/^\/api\/sites\/([\w-]+)$/);
 if(siteMatch&&method==='PATCH'){needs(user,'sites');
  const site=await findSite(env,siteMatch[1]);if(!site)fail('站点不存在',404);const b=await body(req);
  const name=String(b.name??site.name).trim(),description=String(b.description??site.description).trim().replace(/\s+/g,' ');
  let kind=kindOf(site.kind);
  if(!name||name.length>50)fail('站点名称需为 1–50 个字符');if(description.length>120)fail('站点说明最多 120 个字符');
  if(b.kind!==undefined){const requested=String(b.kind);if(!siteKinds[requested])fail('站点类型只能是 files（文件）、folder（文件夹）或 gallery（图册）');if(requested!==kind){const used=await stmt(env,'SELECT COUNT(*) AS count FROM documents WHERE site_id=?',site.id).first();if(used.count)fail('站点里已有 '+used.count+' 份资料，不能再改类型',409)}kind=requested}
  await stmt(env,'UPDATE sites SET name=?,description=?,kind=? WHERE id=?',name,description,kind,site.id).run();
  return json({site:safeSite({...site,name,description,kind})});
  }
  if(siteMatch&&method==='DELETE'){needs(user,'sites');
  const site=await findSite(env,siteMatch[1]);if(!site)fail('站点不存在',404);
  const used=await stmt(env,'SELECT COUNT(*) AS count FROM documents WHERE site_id=?',site.id).first();if(used.count)fail('站点里还有 '+used.count+' 份资料，请先处理后再删除',409);
  await stmt(env,'DELETE FROM sites WHERE id=?',site.id).run();return json({ok:true});
 }
if(path==='/api/timetable'&&method==='POST'){needs(user,"courses");
  const course=courseFields(await body(req)),now=Date.now();
  await stmt(env,'INSERT INTO courses(id,weekday,period,span,weeks,name,teacher,room,start,end,note,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),course.weekday,course.period,course.span,course.weeks,course.name,course.teacher,course.room,course.start,course.end,course.note,now,now).run();
  return json(await timetablePayload(env),201);
 }
 if(path==='/api/settings'&&method==='PATCH'){
  const b=await body(req),current=await settings(env),next={...current};
  if(b.school!==undefined||b.className!==undefined||b.subtitle!==undefined)needs(user,'brand');
  if(b.termStart!==undefined||b.countdownDays!==undefined||b.countdownLimit!==undefined)needs(user,'courses');
  if(b.termStart!==undefined){const value=String(b.termStart||'').trim();if(value&&!isDate(value))fail('学期开始日期格式应为 YYYY-MM-DD');next.termStart=value}
  if(b.countdownDays!==undefined){const value=Number(b.countdownDays);if(!Number.isInteger(value)||value<1||value>60)fail('倒计时天数需为 1–60');next.countdownDays=value}
  if(b.countdownLimit!==undefined){const value=Number(b.countdownLimit);if(!Number.isInteger(value)||value<1||value>8)fail('倒计时条数需为 1–8');next.countdownLimit=value}
  if(b.chatRecall!==undefined||b.chatRetention!==undefined)needs(user,'accounts');
  if(b.chatRecall!==undefined){const value=Number(b.chatRecall);if(!Number.isInteger(value)||value<0||value>1440)fail('撤回时限需为 0–1440 分钟（0 表示不允许撤回）');next.chatRecall=value}
  if(b.chatRetention!==undefined){const value=Number(b.chatRetention);if(!Number.isInteger(value)||value<0||value>3650)fail('自动清理需为 0–3650 天（0 表示永久保留）');next.chatRetention=value}
  const brand=b.school===undefined&&b.className===undefined&&b.subtitle===undefined?null:brandFields(b,await brandOf(env));
  if(brand)await env.DB.batch([saveSetting(env,'brand:school',brand.school),saveSetting(env,'brand:name',brand.name),saveSetting(env,'brand:subtitle',brand.subtitle)]);
  await env.DB.batch([saveSetting(env,'term:start',next.termStart),saveSetting(env,'countdown:days',next.countdownDays),saveSetting(env,'countdown:limit',next.countdownLimit),saveSetting(env,'chat:recall',next.chatRecall),saveSetting(env,'chat:retention',next.chatRetention)]);
  if(brand)putBrand(brand);
  return json({settings:next,...(brand?{brand}:{})});
 }
if(path==='/api/events'&&method==='POST'){needs(user,"calendar");
  const event=eventFields(await body(req));
  const id=crypto.randomUUID();
  await stmt(env,'INSERT INTO events(id,date,name,note,created) VALUES(?,?,?,?,?)',id,event.date,event.name,event.note,Date.now()).run();
  return json({event:{id,...event}},201);
 }
 const eventMatch=path.match(/^\/api\/events\/([\w-]+)$/);
 if(eventMatch&&(method==='PATCH'||method==='DELETE')){needs(user,'calendar');
  const current=await stmt(env,'SELECT * FROM events WHERE id=?',eventMatch[1]).first();if(!current)fail('事件不存在',404);
  if(method==='DELETE'){await stmt(env,'DELETE FROM events WHERE id=?',current.id).run();return json({ok:true})}
  const event=eventFields(await body(req),current);
  await stmt(env,'UPDATE events SET date=?,name=?,note=? WHERE id=?',event.date,event.name,event.note,current.id).run();
  return json({event:{id:current.id,...event}});
 }
if(path==='/api/timetable/import'&&method==='POST'){needs(user,"courses");
  const b=await body(req),list=Array.isArray(b.courses)?b.courses:null;
  if(!list||!list.length)fail('没有可导入的课程');if(list.length>400)fail('一次最多导入 400 条课程');
  const prepared=list.map((item,index)=>{try{return courseFields(item)}catch(error){error.message='第 '+(index+1)+' 行：'+error.message;throw error}});
  const now=Date.now(),statements=[];
  if(b.replace)statements.push(stmt(env,'DELETE FROM courses'));
  for(const course of prepared)statements.push(stmt(env,'INSERT INTO courses(id,weekday,period,span,weeks,name,teacher,room,start,end,note,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),course.weekday,course.period,course.span,course.weeks,course.name,course.teacher,course.room,course.start,course.end,course.note,now,now));
  await env.DB.batch(statements);
  return json({imported:prepared.length,...await timetablePayload(env)},201);
 }
 const courseMatch=path.match(/^\/api\/timetable\/([\w-]+)$/);
 if(courseMatch&&(method==='PATCH'||method==='DELETE')){needs(user,'courses');
  const current=await stmt(env,'SELECT * FROM courses WHERE id=?',courseMatch[1]).first();if(!current)fail('课程不存在',404);
  if(method==='DELETE'){await stmt(env,'DELETE FROM courses WHERE id=?',current.id).run();return json(await timetablePayload(env))}
  const course=courseFields(await body(req),current);
  await stmt(env,'UPDATE courses SET weekday=?,period=?,span=?,weeks=?,name=?,teacher=?,room=?,start=?,end=?,note=?,updated=? WHERE id=?',course.weekday,course.period,course.span,course.weeks,course.name,course.teacher,course.room,course.start,course.end,course.note,Date.now(),current.id).run();
  return json(await timetablePayload(env));
 }
if(path==='/api/holidays'&&method==='POST'){needs(user,"calendar");
  const b=await body(req),date=String(b.date||'').trim(),name=String(b.name||'').trim();
  if(!isDate(date))fail('日期格式应为 YYYY-MM-DD');if(!name||name.length>20)fail('名称需为 1–20 个字符');if(typeof b.off!=='boolean')fail('请选择放假或上班');
  if(b.follow!==undefined&&(!Number.isInteger(Number(b.follow))||Number(b.follow)<0||Number(b.follow)>7))fail('“按哪天课表上课”只能是 0–7（0 表示按当天）');
  const follow=b.follow===undefined?undefined:Number(b.follow);
  await upsertHoliday(env,{date,name,off:b.off,follow},'manual',Date.now()).run();
  return json({ok:true,date,name,off:b.off,follow});
 }
  const holidayMatch=path.match(/^\/api\/holidays\/(\d{4}-\d{2}-\d{2})$/);
 if(holidayMatch&&method==='DELETE'){needs(user,'calendar');
  const row=await stmt(env,'SELECT * FROM holidays WHERE date=?',holidayMatch[1]).first();if(!row)fail('没有这一天的记录',404);
  if(row.source!=='manual')fail('官方数据不能删除，请改用“更正这一天”覆盖');
  await stmt(env,'DELETE FROM holidays WHERE date=?',row.date).run();return json({ok:true});
 }
if(path==='/api/holidays/sync'&&method==='POST'){needs(user,"calendar");
  const base=Number(beijingDate().slice(0,4)),now=Date.now(),statements=[];
  let years=0,days=0;
  for(let year=base-1;year<=base+2;year++){
   let payload;try{const response=await fetch(holidayFeed(year),{headers:{Accept:'application/json'}});if(!response.ok)throw Error('HTTP '+response.status);payload=await response.json()}catch(error){continue}
   const list=Array.isArray(payload?.days)?payload.days:[];if(!list.length)continue;years++;
   for(const day of list){if(!isDate(day.date))continue;statements.push(upsertHoliday(env,{date:day.date,name:day.name,off:!!day.isOffDay},'sync',now));days++}
  }
  if(!statements.length)fail('暂时取不到节假日数据（网络不通或公告尚未发布），现有数据保持不变',503);
  await env.DB.batch(statements);
  await stmt(env,'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','holidays:synced',new Date(now).toISOString()).run();
  return json({ok:true,years,days});
 }
 // —— 大文件分片上传（视频最大 200 MB）——
 if(path==='/api/upload/large/init'&&method==='POST'){
  needs(user,'upload');
  const b=await body(req),site=await findSite(env,String(b.siteId||''));if(!site)fail('请选择要上传到的站点（站点可能已被删除）');
  const siteKind=kindOf(site.kind),ext=extension(String(b.filename||'')),size=Number(b.size)||0;
  if(!fileTypes[ext])fail('仅支持 '+allowedExtensions(siteKind).join('、')+' 格式');
  if(!allowedExtensions(siteKind).includes(ext))fail(siteKinds[siteKind].label+'不支持 '+ext.toUpperCase()+' 格式（可用：'+allowedExtensions(siteKind).join('、')+'）');
  const limit=uploadLimitFor(siteKind,ext);
  if(size<=0)fail('文件内容为空');
  if(size>limit)fail(ext.toUpperCase()+' 最大 '+limitText(limit)+'，当前 '+limitText(size),413);
  const key=chunkUploadPrefix+crypto.randomUUID();
  const multipart=await env.BUCKET.createMultipartUpload(key,{httpMetadata:{contentType:fileTypes[ext].mime}});
  return json({key,uploadId:multipart.uploadId,chunkSize,limit},201);
 }
 if(path==='/api/upload/large/part'&&method==='POST'){
  needs(user,'upload');
  const key=pendingKey(url.searchParams.get('key')),uploadId=String(url.searchParams.get('uploadId')||''),partNumber=Number(url.searchParams.get('part'));
  if(!uploadId)fail('上传会话无效',400);
  if(!Number.isInteger(partNumber)||partNumber<1||partNumber>1000)fail('分片编号无效',400);
  const bytes=await limited(req,chunkSize+1024*1024);
  if(!bytes.length)fail('分片内容为空');
  if(partNumber===1){const site=await findSite(env,String(url.searchParams.get('siteId')||''));try{validateFile(bytes,String(url.searchParams.get('filename')||''),kindOf(site&&site.kind))}catch(error){try{await env.BUCKET.resumeMultipartUpload(key,uploadId).abort()}catch(inner){}fail(error.message)}}
  const multipart=env.BUCKET.resumeMultipartUpload(key,uploadId);
  const part=await multipart.uploadPart(partNumber,bytes);
  return json({partNumber:part.partNumber,etag:part.etag,size:bytes.length});
 }
 if(path==='/api/upload/large/complete'&&method==='POST'){
  needs(user,'upload');
  const b=await body(req),key=pendingKey(b.key),uploadId=String(b.uploadId||''),parts=Array.isArray(b.parts)?b.parts:[];
  if(!uploadId||!parts.length)fail('上传会话无效',400);
  const site=await findSite(env,String(b.siteId||''));if(!site)fail('请选择要上传到的站点（站点可能已被删除）');
  const siteKind=kindOf(site.kind),filename=String(b.filename||'文件').slice(0,180),fileType=extension(filename),size=Number(b.size)||0;
  const limit=uploadLimitFor(siteKind,fileType);if(size>limit)fail(fileType.toUpperCase()+' 最大 '+limitText(limit),413);
  const multipart=env.BUCKET.resumeMultipartUpload(key,uploadId);
  await multipart.complete(parts.map(part=>({partNumber:Number(part.partNumber),etag:String(part.etag)})));
  const metadata=b.metadata&&typeof b.metadata==='object'?b.metadata:{};
  const id=crypto.randomUUID(),title=String(b.title||filename).trim().slice(0,150)||filename;
  let meta={};
  if(siteKind==='gallery'){
   if(isImage(fileType)){const width=Number(metadata.width),height=Number(metadata.height);if(!Number.isInteger(width)||width<1||height<1)fail('图片尺寸信息无效');meta={width,height,converted:metadata.converted!==false,original:metadata.original||null}}
   else meta={duration:Number(metadata.duration)||0,original:metadata.original||null};
  }
  try{await stmt(env,'INSERT INTO documents(id,site_id,title,filename,file_type,size,pages,outline,mode,entries,meta,uploader,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',id,site.id,title,filename,fileType,size,0,'[]','original','[]',JSON.stringify(meta),user.id,Date.now()).run()}catch(error){try{await env.BUCKET.delete(key)}catch(inner){}throw error}
  const stored=await env.BUCKET.get(key);
  if(stored){await env.BUCKET.put(id,stored.body,{httpMetadata:{contentType:fileTypes[fileType].mime}});await env.BUCKET.delete(key)}
  return json({id,size,site:{id:site.id,slug:site.slug,name:site.name}},201);
 }
 if(path==='/api/upload/large/abort'&&method==='POST'){
  needs(user,'upload');
  const b=await body(req),key=pendingKey(b.key),uploadId=String(b.uploadId||'');
  try{await env.BUCKET.resumeMultipartUpload(key,uploadId).abort()}catch(error){}
  return json({ok:true});
 }
if(path==='/api/upload'&&method==='POST'){needs(user,"upload");
  const max=20*1024*1024;if(Number(req.headers.get('content-length'))>max+200000)fail('文件最大为 20 MB',413);
  const payload=await limited(req,max+200000);const form=await new Response(payload,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData(),file=form.get('file');if(!file||typeof file.arrayBuffer!=='function'||file.size>max||file.size<5)fail('请选择不超过 20 MB 的文件');const bytes=await file.arrayBuffer();const site=await findSite(env,String(form.get('siteId')||''));if(!site)fail('请选择要上传到的站点（站点可能已被删除）');const siteKind=kindOf(site.kind);let fileType;try{fileType=validateFile(bytes,file.name,siteKind)}catch(e){fail(e.message)}
  let metadata;try{metadata=JSON.parse(String(form.get('metadata')))}catch{fail('文档信息无效')}
  if(fileType!=='pdf')metadata={...metadata,pages:0,items:[],mode:'original'};else if(!Number.isInteger(metadata.pages)||metadata.pages<1||metadata.pages>500)fail('每份 PDF 最多 500 页');
  const outline=cleanOutline(metadata.items,metadata.pages),title=String(form.get('title')||file.name).trim().slice(0,150);if(!title)fail('请输入文档标题');
  let entries=[],meta={};
  if(siteKind==='folder'){
   const list=zipEntries(bytes);if(!list)fail('这个 ZIP 无法解析（不支持加密或 ZIP64 压缩包）');
   if(list.filter(entry=>!entry.directory).length>2000)fail('压缩包内文件过多（最多 2000 个）');
   entries=list.slice(0,2000);meta={...zipSummary(list),compressed:bytes.length};
  }else if(siteKind==='gallery'){
   if(isImage(fileType)){const width=Number(metadata.width),height=Number(metadata.height);if(!Number.isInteger(width)||width<1||width>20000||!Number.isInteger(height)||height<1||height>20000)fail('图片尺寸信息无效（收到 '+String(metadata.width)+'×'+String(metadata.height)+'）');meta={width,height,converted:metadata.converted!==false,original:metadata.original&&typeof metadata.original==='object'?{name:String(metadata.original.name||'').slice(0,180),type:String(metadata.original.type||'').slice(0,40),size:Number(metadata.original.size)||0}:null}}
   else if(isAudio(fileType)){const duration=Number(metadata.duration);meta={duration:Number.isFinite(duration)&&duration>0?Math.round(duration*10)/10:0,original:metadata.original&&typeof metadata.original==='object'?{name:String(metadata.original.name||'').slice(0,180),type:String(metadata.original.type||'').slice(0,40),size:Number(metadata.original.size)||0}:null}}
   else if(isVideo(fileType)){const duration=Number(metadata.duration);meta={duration:Number.isFinite(duration)&&duration>0?Math.round(duration*10)/10:0,original:metadata.original&&typeof metadata.original==='object'?{name:String(metadata.original.name||'').slice(0,180),type:String(metadata.original.type||'').slice(0,40),size:Number(metadata.original.size)||0}:null}}
  }
  const id=crypto.randomUUID(),mode=fileType!=='pdf'?'original':['bookmarks','headings','scanned'].includes(metadata.mode)?metadata.mode:'headings';await env.BUCKET.put(id,bytes,{httpMetadata:{contentType:fileTypes[fileType].mime}});
  const thumb=siteKind==='gallery'?form.get('thumb'):null;
  if(thumb&&typeof thumb.arrayBuffer==='function'&&thumb.size>0&&thumb.size<=400000){try{const thumbBytes=await thumb.arrayBuffer();validateFile(thumbBytes,'thumb.webp','gallery');await env.BUCKET.put('thumb:'+id,thumbBytes,{httpMetadata:{contentType:'image/webp'}});meta={...meta,thumb:{size:thumb.size}}}catch(error){}}
  try{await stmt(env,'INSERT INTO documents(id,site_id,title,filename,file_type,size,pages,outline,mode,entries,meta,uploader,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',id,site.id,title,file.name.slice(0,180),fileType,file.size,metadata.pages,JSON.stringify(outline),mode,JSON.stringify(entries),JSON.stringify(meta),user.id,Date.now()).run()}catch(e){await env.BUCKET.delete(id);throw e}return json({id,site:{id:site.id,slug:site.slug,name:site.name}},201);
 }
if(path==='/api/users'&&method==='GET'){needs(user,"accounts");const rows=await stmt(env,'SELECT * FROM users ORDER BY created ASC').all();return cachedJson(req,{users:rows.results.map(safeUser)},user.id)}
if(path==='/api/users'&&method==='POST'){needs(user,"accounts");const b=await body(req);b.username=String(b.username||'').toLowerCase().trim();validateAccount(b);if(await stmt(env,'SELECT id FROM users WHERE username=?',b.username).first())fail('账号已存在',409);const role=b.role==='admin'?'admin':'member';const group=role==='admin'?null:await assignGroup(env,b.groupId);const permissions=role==='admin'?[]:(group?parsePermissions(group.permissions):cleanPermissions(b.permissions));await stmt(env,'INSERT INTO users(id,username,name,hash,role,group_id,permissions,created) VALUES(?,?,?,?,?,?,?,?)',crypto.randomUUID(),b.username,b.name.trim(),await hashPassword(b.password),role,group?group.id:null,JSON.stringify(permissions),Date.now()).run();return json({ok:true},201)}
 if(path==='/api/groups'&&method==='GET'){needs(user,'accounts');return cachedJson(req,{groups:await groupList(env)},user.id)}
 if(path==='/api/groups'&&method==='POST'){needs(user,'accounts');const fields=groupFields(await body(req));const id=crypto.randomUUID();await stmt(env,'INSERT INTO groups(id,name,permissions,note,created) VALUES(?,?,?,?,?)',id,fields.name,JSON.stringify(fields.permissions),fields.note,Date.now()).run();return json({group:{id,...fields,members:0}},201)}
 const groupMatch=path.match(/^\/api\/groups\/([\w-]+)$/);
 if(groupMatch&&(method==='PATCH'||method==='DELETE')){needs(user,'accounts');const target=await stmt(env,'SELECT * FROM groups WHERE id=?',groupMatch[1]).first();if(!target)fail('用户组不存在',404);
  if(method==='DELETE'){await env.DB.batch([stmt(env,'DELETE FROM groups WHERE id=?',target.id),stmt(env,'UPDATE users SET group_id=NULL WHERE group_id=?',target.id)]);return json({ok:true})}
  const fields=groupFields(await body(req),target);await env.DB.batch([stmt(env,'UPDATE groups SET name=?,permissions=?,note=? WHERE id=?',fields.name,JSON.stringify(fields.permissions),fields.note,target.id),stmt(env,'UPDATE users SET permissions=? WHERE group_id=?',JSON.stringify(fields.permissions),target.id)]);
  return json({group:{id:target.id,...fields}})}
 const umDelete=path.match(/^\/api\/users\/([\w-]+)$/);
 if(umDelete&&method==='DELETE'){
  needs(user,'accounts');
  if(umDelete[1]===user.id)fail('不能删除自己的账号',400);
  const target=await stmt(env,'SELECT * FROM users WHERE id=?',umDelete[1]).first();if(!target)fail('账号不存在',404);
  const rooms=await stmt(env,'SELECT room FROM chat_reads WHERE user_id=?',target.id).all();
  const own=await stmt(env,'SELECT id,attachment FROM messages WHERE sender_id=? LIMIT 500',target.id).all();
  for(const row of own.results){const attachment=attachmentInfo(row.attachment);if(attachment&&attachment.key){try{await env.BUCKET.delete(attachment.key)}catch(error){}}}
  await env.DB.batch([
   stmt(env,'DELETE FROM messages WHERE sender_id=?',target.id),
   stmt(env,'DELETE FROM chat_reads WHERE user_id=?',target.id),
   stmt(env,'DELETE FROM sessions WHERE user_id=?',target.id),
   stmt(env,'UPDATE users SET group_id=NULL WHERE id=?',target.id),
   stmt(env,'DELETE FROM users WHERE id=?',target.id)
  ]);
  return json({ok:true,removed:{user:target.username,messages:own.results.length,rooms:rooms.results.length}});
 }
 const um=path.match(/^\/api\/users\/([\w-]+)$/);
 if(um&&method==='PATCH'){needs(user,'accounts');
  const b=await body(req);if(um[1]===user.id)fail('不能修改自己的管理权限或停用自己');const target=await stmt(env,'SELECT * FROM users WHERE id=?',um[1]).first();if(!target)fail('账号不存在',404);
  if(b.password!==undefined){if(!validPassword(b.password))fail('密码需为 12–128 个字符');await env.DB.batch([stmt(env,'UPDATE users SET hash=?,must_change=1 WHERE id=?',await hashPassword(b.password),um[1]),stmt(env,'DELETE FROM sessions WHERE user_id=?',um[1])])}
  else{const role=['admin','member'].includes(b.role)?b.role:target.role;const disabled=typeof b.disabled==='boolean'?b.disabled:!!target.disabled;let groupId=target.group_id||null;if(b.groupId!==undefined)groupId=b.groupId?String(b.groupId):null;const group=role==='admin'?null:await assignGroup(env,groupId);if(!group)groupId=null;const permissions=role==='admin'?[]:(group?parsePermissions(group.permissions):(b.permissions===undefined?parsePermissions(target.permissions):cleanPermissions(b.permissions)));await env.DB.batch([stmt(env,'UPDATE users SET role=?,disabled=?,group_id=?,permissions=?,mute_group=COALESCE(?,mute_group),mute_direct=COALESCE(?,mute_direct) WHERE id=?',role,disabled?1:0,groupId,JSON.stringify(permissions),typeof b.muteGroup==='boolean'?(b.muteGroup?1:0):null,typeof b.muteDirect==='boolean'?(b.muteDirect?1:0):null,um[1]),stmt(env,'DELETE FROM sessions WHERE user_id=?',um[1])])}return json({ok:true})
 }
 // —— 聊天 ——
 if(path==='/api/chat/rooms'&&method==='GET'){const rooms=await chatRooms(env,user);return json({rooms,unread:rooms.reduce((total,room)=>total+room.unread,0)})}
 if(path==='/api/chat/unread'&&method==='GET'){const row=await stmt(env,"SELECT COUNT(*) AS unread,SUM(CASE WHEN m.mentions LIKE '%'||?||'%' THEN 1 ELSE 0 END) AS mentions FROM messages m WHERE m.sender_id<>? AND (m.room=? OR instr(m.room,?)>0) AND m.created>COALESCE((SELECT seen FROM chat_reads r WHERE r.user_id=? AND r.room=m.room),0)",user.id,user.id,groupRoom,user.id,user.id).first();return json({unread:row?.unread||0,mentions:row?.mentions||0,muted:{group:!!user.mute_group,direct:!!user.mute_direct}})}
 if(path==='/api/chat/messages'&&method==='GET'){
  const info=roomInfo(url.searchParams.get('room'),user.id),limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit'))||80));
  const after=Number(url.searchParams.get('after'))||0,before=Number(url.searchParams.get('before'))||0;
  let rows;
  if(before)rows=(await stmt(env,'SELECT m.*,u.name AS sender_name FROM messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.room=? AND m.created<? ORDER BY m.created DESC LIMIT ?',info.room,before,limit).all()).results.reverse();
  else if(after)rows=(await stmt(env,'SELECT m.*,u.name AS sender_name FROM messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.room=? AND m.created>? ORDER BY m.created ASC LIMIT ?',info.room,after,limit).all()).results;
  else rows=(await stmt(env,'SELECT m.*,u.name AS sender_name FROM messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.room=? ORDER BY m.created DESC LIMIT ?',info.room,limit).all()).results.reverse();
  const messages=rows.map(row=>{const attachment=attachmentInfo(row.attachment);let mentions=[];try{mentions=JSON.parse(row.mentions||'[]')}catch(error){mentions=[]}return {id:row.id,room:row.room,body:row.body,created:row.created,senderId:row.sender_id,senderName:row.sender_name||'',mine:row.sender_id===user.id,mentions,attachment:attachment?{name:attachment.name,size:attachment.size,type:attachment.type,inline:!!attachment.inline}:null}});
  return json({room:info.room,kind:info.kind,messages,hasMore:rows.length>=limit});
 }
 if(path==='/api/chat/messages'&&method==='POST'){
  const multipart=(req.headers.get('content-type')||'').indexOf('multipart/form-data')>=0;
  let payload={},file=null;
  if(multipart){const form=await new Response(await limited(req,12*1024*1024),{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();payload={room:form.get('room'),body:form.get('body')};file=form.get('file')}
  else payload=await body(req);
  const info=roomInfo(payload.room,user.id),text=messageBody(payload.body,!!file);
  await throttle(env,'chat:'+user.id,30,60000);
  if(info.kind==='group'&&user.mute_group)fail('你已被管理员禁言（班级大群）',403);
  if(info.kind==='direct'&&user.mute_direct)fail('你已被管理员禁言（私聊）',403);
  if(info.kind==='direct'){const target=await stmt(env,'SELECT id,disabled FROM users WHERE id=?',info.other).first();if(!target||target.disabled)fail('对方账号不可用',400)}
  const id=crypto.randomUUID(),created=Date.now();
  let attachment=null;
  if(file&&typeof file.arrayBuffer==='function'&&file.size>0){
   const bytes=await file.arrayBuffer(),name=String(file.name||'文件').slice(0,180);
   if(file.size>10*1024*1024)fail('附件最大 10 MB',413);
   const kind=(isImage(extension(name))||isVideo(extension(name))||isAudio(extension(name)))?'gallery':'files';
   let type;try{type=validateFile(bytes,name,kind)}catch(error){fail(error.message)}
   const key='chat:'+id;
   await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:fileTypes[type]?.mime||'application/octet-stream'}});
   attachment={key,type,name,size:file.size,inline:isImage(type)||isVideo(type)||isAudio(type)};
  }
  const people=await chatPeople(env),mentions=mentionIds(text,people).filter(person=>person!==user.id);
  await stmt(env,'INSERT INTO messages(id,room,sender_id,body,attachment,mentions,created) VALUES(?,?,?,?,?,?,?)',id,info.room,user.id,text,attachment?JSON.stringify(attachment):'',JSON.stringify(mentions),created).run();
  await stmt(env,'INSERT INTO chat_reads(user_id,room,seen) VALUES(?,?,?) ON CONFLICT(user_id,room) DO UPDATE SET seen=excluded.seen',user.id,info.room,created).run();
  cleanupChat(env,false).catch(()=>{});
  return json({message:{id,room:info.room,body:text,created,senderId:user.id,senderName:user.name,mine:true,mentions,attachment:attachment?{name:attachment.name,size:attachment.size,type:attachment.type,inline:attachment.inline}:null}},201);
 }
 if(path==='/api/chat/read'&&method==='POST'){
  const b=await body(req),info=roomInfo(b.room,user.id),at=Number(b.at)||Date.now();
  await stmt(env,'INSERT INTO chat_reads(user_id,room,seen) VALUES(?,?,?) ON CONFLICT(user_id,room) DO UPDATE SET seen=MAX(seen,excluded.seen)',user.id,info.room,at).run();
  return json({ok:true});
 }
 const chatFileMatch=path.match(/^\/api\/chat\/attachments\/([\w-]+)$/);
 if(chatFileMatch&&method==='GET'){const row=await stmt(env,'SELECT * FROM messages WHERE id=?',chatFileMatch[1]).first();if(!row)fail('附件不存在',404);roomInfo(row.room,user.id);const attachment=attachmentInfo(row.attachment);if(!attachment)fail('这条消息没有附件',404);const object=await env.BUCKET.get(attachment.key);if(!object)fail('附件暂不可用',503);return new Response(object.body,{headers:{'Content-Type':fileTypes[attachment.type]?.mime||'application/octet-stream','Cache-Control':'private,max-age=31536000,immutable','Content-Disposition':(attachment.inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(attachment.name)}})}
 if(path==='/api/chat/cleanup'&&method==='POST'){needs(user,'accounts');const b=await body(req);const hours=Number(b&&b.hours)||0;if(hours&&(!Number.isFinite(hours)||hours<=0||hours>8760))fail('清理时间窗需为 0–8760 小时');const result=await cleanupChat(env,true,hours||0);return json(result)}
 const chatMatch=path.match(/^\/api\/chat\/messages\/([\w-]+)$/);
 if(chatMatch&&method==='DELETE'){
  const row=await stmt(env,'SELECT * FROM messages WHERE id=?',chatMatch[1]).first();if(!row)fail('消息不存在',404);
  const config=await settings(env);
  if(row.sender_id!==user.id){if(!can(user,'accounts'))fail('只能删除自己发送的消息',403)}
  else if(!can(user,'accounts')){if(!(config.chatRecall>0))fail('管理员没有开放撤回功能，请联系管理员删除',403);if(Date.now()-row.created>config.chatRecall*60000)fail('超过撤回时间（'+config.chatRecall+' 分钟内可以撤回）',403)}
  const attachment=attachmentInfo(row.attachment);if(attachment&&attachment.key){try{await env.BUCKET.delete(attachment.key)}catch(error){}}
  await stmt(env,'DELETE FROM messages WHERE id=?',row.id).run();
  return json({ok:true});
 }
 fail('接口不存在',404);
}
export default {async fetch(req,env){let response;try{response=await handle(req,env)}catch(e){if(!e.status)console.error('request failed',e.message);response=json({error:e.status?e.message:'服务暂时不可用，请稍后重试'},e.status||503)}const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'");return new Response(req.method==='HEAD'?null:response.body,{status:response.status,headers})}};
