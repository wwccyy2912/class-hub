import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {request as call,raw,base,loginAdmin,adminUser,adminPassword} from './helpers.mjs';
import {addDays as addDaysSafe} from '../src/shared/schedule.mjs';
import {pdf,png,zip,wav} from './fixtures.mjs';

assert.equal((await call('/documents')).status,401);
assert.equal((await call('/documents/not-a-real-file/file')).status,401);
assert.equal((await call('/login',{method:'POST',origin:'https://bad.example',body:{username:'admin',password:'bad'}})).status,403);
let r=await loginAdmin();let admin=r.cookie;
assert.equal(r.user.role,'admin');
if(r.user.mustChange){
 assert.equal((await call('/documents',{cookie:admin})).status,403,'未修改初始密码时必须拒绝资料访问');
 const changed=await call('/password',{method:'POST',cookie:admin,body:{oldPassword:adminPassword,password:adminPassword}});
 assert.equal(changed.status,200,JSON.stringify(changed.data));admin=changed.cookie;
}
const documents=await call('/documents',{cookie:admin});assert.equal(documents.status,200);assert.ok(Array.isArray(documents.data.documents));
const hop=await fetch(base+'/sports/',{redirect:'manual'});assert.ok(hop.status===301||hop.type==='opaqueredirect','旧的 /sports/ 地址应跳回首页');
const username='test'+Date.now();r=await call('/users',{method:'POST',cookie:admin,body:{username,name:'测试成员',password:'Member-Test-Password-1!',role:'member'}});assert.equal(r.status,201);
r=await call('/login',{method:'POST',body:{username,password:'Member-Test-Password-1!'}});let member=r.cookie;assert.equal(r.status,200,JSON.stringify(r.data));
assert.equal((await call('/documents',{cookie:member})).status,403,'首次登录必须要求修改初始密码');
r=await call('/password',{method:'POST',cookie:member,body:{oldPassword:'Member-Test-Password-1!',password:'Member-New-Password-1!'}});assert.equal(r.status,200,JSON.stringify(r.data));member=r.cookie;
assert.equal((await call('/users',{cookie:member})).status,403);assert.equal((await call('/upload',{cookie:member,method:'POST',body:{}})).status,403);

// 专题站点：列出、创建、权限、路径校验
const sites=await call('/sites',{cookie:member});assert.equal(sites.status,200);assert.ok(!sites.data.sites.some(s=>s.slug==='sports'),'内置的“运动会资料”站点不应该再存在');
assert.equal((await call('/sites')).status,401,'未登录不能读取站点列表');
assert.equal((await call('/documents?site=not-exist',{cookie:member})).status,400);
const slug='t'+Date.now().toString(36);
r=await call('/sites',{cookie:admin,method:'POST',body:{name:'测试站点',slug,description:'临时站点'}});assert.equal(r.status,201,JSON.stringify(r.data));const siteId=r.data.site.id;
assert.equal((await call('/sites',{cookie:admin,method:'POST',body:{name:'重复路径',slug,description:''}})).status,409);
assert.equal((await call('/sites',{cookie:admin,method:'POST',body:{name:'坏路径',slug:'Bad Slug',description:''}})).status,400);
assert.equal((await call('/sites',{cookie:member,method:'POST',body:{name:'无权限',slug:'nope',description:''}})).status,403);
r=await call('/sites/'+siteId,{cookie:admin,method:'PATCH',body:{name:'测试站点改名',description:'改过的说明'}});assert.equal(r.status,200,JSON.stringify(r.data));
const before=pdf(62);assert.equal((await call('/documents/original/file',{cookie:member})).status,404,'内置秩序册已经移除');

// 上传到新建站点，并确认站点之间互相隔离
const siteForm=new FormData();siteForm.append('file',new File([before],'site.pdf',{type:'application/pdf'}));siteForm.append('title','站点内资料');siteForm.append('siteId',siteId);siteForm.append('metadata',JSON.stringify({pages:62,items:[],mode:'headings'}));
r=await call('/upload',{cookie:admin,method:'POST',body:siteForm});assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.site.slug,slug);
const badSite=new FormData();badSite.append('file',new File([before],'bad-site.pdf',{type:'application/pdf'}));badSite.append('title','错误站点');badSite.append('siteId','no-such-site');badSite.append('metadata',JSON.stringify({pages:62,items:[],mode:'headings'}));
assert.equal((await call('/upload',{cookie:admin,method:'POST',body:badSite})).status,400);
const siteDocs=(await call('/documents?site='+slug,{cookie:member})).data.documents;assert.equal(siteDocs.length,1);assert.equal(siteDocs[0].title,'站点内资料');assert.equal(siteDocs[0].site_slug,slug);assert.equal(siteDocs[0].pages,62);
assert.equal((await call('/documents?site=sports',{cookie:member})).status,400,'内置站点已移除，按 slug 查询应报站点不存在');
assert.equal((await call('/sites/'+siteId,{cookie:admin,method:'DELETE'})).status,409,'站点里还有资料时不能删除');
const renamed=(await call('/sites',{cookie:admin})).data.sites.find(s=>s.id===siteId);assert.equal(renamed.name,'测试站点改名');assert.equal(renamed.description,'改过的说明');assert.equal(renamed.count,1);
const empty=await call('/sites',{cookie:admin,method:'POST',body:{name:'空站点',slug:slug+'x',description:''}});assert.equal(empty.status,201);
assert.equal((await call('/sites/'+empty.data.site.id,{cookie:admin,method:'DELETE'})).status,200,'空站点可以删除');
assert.equal((await call('/sites/sports',{cookie:admin,method:'DELETE'})).status,404,'内置站点已移除');

// 三种站点类型：文件夹（ZIP）、图册（图片/视频）、文件（PDF/Office/文本）
assert.equal((await call('/sites',{cookie:admin,method:'POST',body:{name:'坏类型',slug:slug+'k',kind:'movie'}})).status,400);
const folderSite=await call('/sites',{cookie:admin,method:'POST',body:{name:'文件夹站点',slug:slug+'f',kind:'folder'}});
assert.equal(folderSite.status,201,JSON.stringify(folderSite.data));assert.equal(folderSite.data.site.kind,'folder');
const gallerySite=await call('/sites',{cookie:admin,method:'POST',body:{name:'图册站点',slug:slug+'g',kind:'gallery'}});
assert.equal(gallerySite.data.site.kind,'gallery');
const filesSite=await call('/sites',{cookie:admin,method:'POST',body:{name:'文件站点',slug:slug+'d',kind:'files'}});
assert.equal(filesSite.data.site.kind,'files');
const kinds=(await call('/sites',{cookie:member})).data.sites;
assert.equal(kinds.find(site=>site.id===folderSite.data.site.id).kind,'folder');

// 类型与资料格式必须匹配
const asForm=(file,name,siteId,metadata)=>{const form=new FormData();form.append('file',new File([file],name));form.append('title',name);form.append('siteId',siteId);form.append('metadata',JSON.stringify(metadata||{pages:0,items:[],mode:'original'}));return form};
assert.equal((await call('/upload',{cookie:admin,method:'POST',body:asForm(png(2,2),'照片.png',folderSite.data.site.id)})).status,400,'文件夹站点只收 ZIP');
assert.equal((await call('/upload',{cookie:admin,method:'POST',body:asForm(before,'资料.pdf',gallerySite.data.site.id)})).status,400,'图册站点不收 PDF');
assert.equal((await call('/upload',{cookie:admin,method:'POST',body:asForm(png(2,2),'图.png',filesSite.data.site.id)})).status,400,'文件站点不收图片');

// 文件夹站点：上传 ZIP 并解析目录
const zipBytes=zip([{name:'readme.txt',data:'文件夹站点说明\n第二行',deflate:true},{name:'images/logo.png',data:png(2,2),deflate:false},{name:'docs/',data:''}]);
const zipUpload=await call('/upload',{cookie:admin,method:'POST',body:asForm(zipBytes,'资料包.zip',folderSite.data.site.id)});
assert.equal(zipUpload.status,201,JSON.stringify(zipUpload.data));
const zipDoc=(await call('/documents?site='+folderSite.data.site.slug,{cookie:member})).data.documents.find(item=>item.id===zipUpload.data.id);
assert.equal(zipDoc.file_type,'zip');assert.equal(zipDoc.kind,'folder');
assert.equal(zipDoc.entries.length,3,'应解析出 3 个条目（含目录）');
assert.equal(zipDoc.meta.count,2,'目录不计入文件数');
assert.ok(zipDoc.entries.some(entry=>entry.name==='readme.txt'&&entry.method===8));
assert.equal((await call('/upload',{cookie:admin,method:'POST',body:asForm(Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),Buffer.alloc(64,7)]),'坏的.zip',folderSite.data.site.id)})).status,400,'无法解析的压缩包要拒绝');
let zipFile=await call('/documents/'+zipUpload.data.id+'/file',{cookie:member});
assert.equal(zipFile.status,200);assert.match(zipFile.headers.get('content-type'),/zip/);assert.match(zipFile.headers.get('content-disposition'),/^attachment/);
assert.equal(zipFile.headers.get('accept-ranges'),'bytes');
const ranged=await call('/documents/'+zipUpload.data.id+'/file',{cookie:member,headers:{Range:'bytes=0-9'}});
assert.equal(ranged.status,206,'支持 Range 请求');assert.equal(ranged.data.length,10);assert.match(ranged.headers.get('content-range'),/^bytes 0-9\//);

// 图册站点：图片记录尺寸与原格式，内联预览
const imageUpload=await call('/upload',{cookie:admin,method:'POST',body:asForm(png(3,5),'风景.png',gallerySite.data.site.id,{pages:0,items:[],mode:'original',width:3,height:5,converted:true,original:{name:'风景.png',type:'png',size:1234}})});
assert.equal(imageUpload.status,201,JSON.stringify(imageUpload.data));
const imageDoc=(await call('/documents?site='+gallerySite.data.site.slug,{cookie:member})).data.documents.find(item=>item.id===imageUpload.data.id);
assert.equal(imageDoc.kind,'gallery');assert.equal(imageDoc.file_type,'png');
assert.equal(imageDoc.meta.width,3);assert.equal(imageDoc.meta.height,5);assert.equal(imageDoc.meta.converted,true);assert.equal(imageDoc.meta.original.type,'png');
assert.equal((await call('/upload',{cookie:admin,method:'POST',body:asForm(png(3,3),'坏尺寸.png',gallerySite.data.site.id,{pages:0,items:[],mode:'original'})})).status,400,'图片必须带尺寸信息');
// 图册站点：音频文件（播放器用）
const audio=wav(0.5);
const audioUpload=await call('/upload',{cookie:admin,method:'POST',body:asForm(audio,'提示音.wav',gallerySite.data.site.id,{pages:0,items:[],mode:'original',duration:2.5,original:{name:'提示音.wav',type:'wav',size:audio.length}})});
assert.equal(audioUpload.status,201,JSON.stringify(audioUpload.data));
const audioDoc=(await call('/documents?site='+gallerySite.data.site.slug,{cookie:member})).data.documents.find(item=>item.id===audioUpload.data.id);
assert.equal(audioDoc.file_type,'wav');assert.equal(audioDoc.meta.duration,2.5);
assert.equal(audioDoc.kind,'gallery');
const audioFile=await call('/documents/'+audioUpload.data.id+'/file',{cookie:member});
assert.match(audioFile.headers.get('content-type'),/audio\/wav/,'音频按 audio/wav 返回');assert.match(audioFile.headers.get('content-disposition'),/^inline/,'音频内联播放');
const audioRange=await call('/documents/'+audioUpload.data.id+'/file',{cookie:member,headers:{Range:'bytes=0-43'}});
assert.equal(audioRange.status,206,'音频支持 Range');assert.equal(audioRange.data.length,44);
assert.equal((await call('/upload',{cookie:admin,method:'POST',body:asForm(audio,'提示音.wav',filesSite.data.site.id)})).status,400,'文件站点不收音频');
const imageFile=await call('/documents/'+imageUpload.data.id+'/file',{cookie:member});
assert.match(imageFile.headers.get('content-type'),/image\/png/);assert.match(imageFile.headers.get('content-disposition'),/^inline/);

// 文件站点：Markdown / TXT 可预览，Office 仍为下载
const markdown='# 班级通知\n\n- 第一条\n- **第二条**\n';
const mdUpload=await call('/upload',{cookie:admin,method:'POST',body:asForm(Buffer.from(markdown,'utf8'),'通知.md',filesSite.data.site.id)});
assert.equal(mdUpload.status,201,JSON.stringify(mdUpload.data));
const mdDoc=(await call('/documents?site='+filesSite.data.site.slug,{cookie:member})).data.documents.find(item=>item.id===mdUpload.data.id);
assert.equal(mdDoc.file_type,'md');assert.equal(mdDoc.kind,'files');
const mdFile=await call('/documents/'+mdUpload.data.id+'/file',{cookie:member});
assert.match(mdFile.headers.get('content-type'),/text\/markdown/);assert.match(mdFile.headers.get('content-disposition'),/^inline/);
assert.equal(Buffer.from(mdFile.data).toString('utf8'),markdown);
const txtUpload=await call('/upload',{cookie:admin,method:'POST',body:asForm(Buffer.from('纯文本内容','utf8'),'说明.txt',filesSite.data.site.id)});
assert.equal(txtUpload.status,201);
const officeUpload=await call('/upload',{cookie:admin,method:'POST',body:asForm(await fs.readFile('tests/fixtures/class-note.docx'),'班级资料.docx',filesSite.data.site.id)});
assert.equal(officeUpload.status,201);
const officeFile=await call('/documents/'+officeUpload.data.id+'/file',{cookie:member});
assert.match(officeFile.headers.get('content-disposition'),/^attachment/,'Office 仍然下载');

// 站点类型只有空站点能改
assert.equal((await call('/sites/'+folderSite.data.site.id,{cookie:admin,method:'PATCH',body:{kind:'gallery'}})).status,409,'已有资料的站点不能改类型');
assert.equal((await call('/sites/'+filesSite.data.site.id,{cookie:admin,method:'PATCH',body:{kind:'archive'}})).status,400);
const emptySite=await call('/sites',{cookie:admin,method:'POST',body:{name:'空的可改类型',slug:slug+'e',kind:'files'}});
const changed=await call('/sites/'+emptySite.data.site.id,{cookie:admin,method:'PATCH',body:{kind:'gallery'}});
assert.equal(changed.status,200);assert.equal(changed.data.site.kind,'gallery');

// 日历（法定节假日与调休）与课程表（明天提醒）
const calendar=await call('/calendar?year=2026&month=10',{cookie:member});assert.equal(calendar.status,200,JSON.stringify(calendar.data));
assert.match(calendar.data.tomorrow.dateText,/^\d{4}年\d{1,2}月\d{1,2}日$/,'明天提醒必须带日期');
const oct1=calendar.data.month.days.find(d=>d.day===1);assert.equal(oct1.kind,'holiday');assert.equal(oct1.name,'国庆节');
assert.ok(calendar.data.holidays.some(g=>g.kind==='makeup'),'本月应包含调休上班日');
assert.equal(calendar.data.month.days.length,31);
assert.equal((await call('/calendar?year=2026&month=13',{cookie:member})).status,400);
const timetable=await call('/timetable',{cookie:member});assert.equal(timetable.status,200);
assert.equal(timetable.data.days.length,7);
// 先清掉上次运行可能残留的手动调休与课程，保证结果与人工操作互不影响
await call('/holidays/'+timetable.data.tomorrow.date,{cookie:admin,method:'DELETE'});
// 把明天固定成“调休上课日（按当天课表）”，这样即使真实日期正好是法定假期，断言依然成立
const forced=await call('/holidays',{cookie:admin,method:'POST',body:{date:timetable.data.tomorrow.date,name:'测试调休',off:false,follow:timetable.data.tomorrow.weekday}});
assert.equal(forced.status,200,JSON.stringify(forced.data));
// 清空已有课程
for(const course of timetable.data.courses)assert.equal((await call('/timetable/'+course.id,{cookie:admin,method:'DELETE'})).status,200);
assert.equal((await call('/timetable',{cookie:admin})).data.courses.length,0);
assert.equal((await call('/timetable',{cookie:member,method:'POST',body:{weekday:1,period:1,name:'语文'}})).status,403,'成员不能修改课程表');
r=await call('/timetable',{cookie:admin,method:'POST',body:{weekday:timetable.data.tomorrow.weekday,period:3,name:'数学',teacher:'王老师',room:'高一(1)班',start:'9:00',end:'9:45'}});
assert.equal(r.status,201,JSON.stringify(r.data));
const lesson=r.data.tomorrow.courses.find(c=>c.name==='数学');assert.ok(lesson,'明天课程应包含新加的课');assert.equal(lesson.start,'09:00','时间会被规范为 HH:MM');
assert.equal((await call('/timetable',{cookie:admin,method:'POST',body:{weekday:9,period:1,name:'错误'}})).status,400);
assert.equal((await call('/timetable',{cookie:admin,method:'POST',body:{weekday:1,period:0,name:'错误'}})).status,400);
r=await call('/timetable/'+lesson.id,{cookie:admin,method:'PATCH',body:{name:'数学（连堂）',period:2}});assert.equal(r.status,200);
assert.equal(r.data.tomorrow.courses.find(c=>c.id===lesson.id).name,'数学（连堂）');
assert.equal((await call('/timetable/'+lesson.id,{cookie:admin,method:'DELETE'})).status,200);
assert.equal((await call('/timetable/'+lesson.id,{cookie:admin,method:'PATCH',body:{name:'x'}})).status,404);
assert.equal((await call('/holidays',{cookie:member,method:'POST',body:{date:'2026-11-02',name:'校运会',off:true}})).status,403,'成员不能改节假日');
assert.equal((await call('/holidays',{cookie:admin,method:'POST',body:{date:'2026-11-02',name:'校运会',off:true}})).status,200);
assert.equal((await call('/holidays',{cookie:admin,method:'POST',body:{date:'2026-11-02',name:'校运会',off:'yes'}})).status,400);
const november=await call('/calendar?year=2026&month=11',{cookie:member});assert.equal(november.data.month.days.find(d=>d.day===2).kind,'holiday','手动覆盖的校运会应生效');
assert.equal((await call('/holidays/2026-10-01',{cookie:admin,method:'DELETE'})).status,400,'官方数据不能删除');
assert.equal((await call('/holidays/2026-11-02',{cookie:admin,method:'DELETE'})).status,200);

// 连堂、单双周、批量导入、调休按指定星期上课
let today=await call('/timetable',{cookie:admin});
let tomorrow=today.data.tomorrow,parity=tomorrow.weekParity,otherParity=parity==='odd'?'even':'odd';
assert.ok(['odd','even'].includes(parity),'周次奇偶应为 odd/even');
assert.ok(today.data.week&&today.data.week.number>0&&/单周|双周/.test(today.data.week.parityText||''),'应返回本周是第几周');
// 教学周设置：管理员可改，改后单双周按教学周计算
assert.equal((await call('/settings')).status,401,'未登录不能读设置');
await call('/settings',{cookie:admin,method:'PATCH',body:{termStart:'',countdownDays:14,countdownLimit:3}});
const initialSettings=await call('/settings',{cookie:member});assert.equal(initialSettings.status,200);assert.equal(initialSettings.data.settings.countdownDays,14);assert.equal(initialSettings.data.settings.countdownLimit,3);
assert.equal((await call('/settings',{cookie:member,method:'PATCH',body:{countdownDays:7}})).status,403,'成员不能改设置');
assert.equal((await call('/settings',{cookie:admin,method:'PATCH',body:{countdownDays:99}})).status,400);
assert.equal((await call('/settings',{cookie:admin,method:'PATCH',body:{termStart:'2026/09/01'}})).status,400);
const saved=await call('/settings',{cookie:admin,method:'PATCH',body:{termStart:'2026-09-01',countdownDays:20,countdownLimit:4}});
assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.settings.termStart,'2026-09-01');
const withTerm=await call('/timetable',{cookie:member});
assert.equal(withTerm.data.week.source,'term','设置学期开始后按教学周');
assert.equal(withTerm.data.week.number,Math.floor((new Date(withTerm.data.today.date+'T00:00:00Z')-new Date('2026-09-01T00:00:00Z'))/86400000/7)+1);
assert.equal(withTerm.data.week.parityText,(withTerm.data.week.parity==='odd'?'单周':'双周'));
// 自定义事件进入倒计时
const event=await call('/events',{cookie:admin,method:'POST',body:{date:addDaysSafe(withTerm.data.today.date,3),name:'运动会',note:'校运会'}});
assert.equal(event.status,201,JSON.stringify(event.data));
assert.equal((await call('/events',{cookie:member,method:'POST',body:{date:'2026-10-20',name:'无权限'}})).status,403);
assert.equal((await call('/events',{cookie:admin,method:'POST',body:{date:'bad',name:'x'}})).status,400);
const after=await call('/timetable',{cookie:member});
assert.ok(after.data.upcoming.some(item=>item.kind==='event'&&item.name==='运动会'),'倒计时应包含自定义事件');
assert.ok(after.data.events.some(item=>item.name==='运动会'));
const patched=await call('/events/'+event.data.event.id,{cookie:admin,method:'PATCH',body:{name:'秋季运动会'}});
assert.equal(patched.status,200);assert.equal(patched.data.event.name,'秋季运动会');
const eventDate=addDaysSafe(withTerm.data.today.date,3);
const eventMonth=await call('/calendar?year='+eventDate.slice(0,4)+'&month='+Number(eventDate.slice(5,7)),{cookie:member});
assert.ok(eventMonth.data.month.days.some(day=>day.events.some(item=>item.name==='秋季运动会')),'月历应标出自定义事件');
assert.equal((await call('/events/'+event.data.event.id,{cookie:admin,method:'DELETE'})).status,200);
assert.equal((await call('/settings',{cookie:admin,method:'PATCH',body:{termStart:'',countdownDays:14,countdownLimit:3}})).status,200);
// 设置复位后重新取一次周次，保证下面的单双周判断基于自然周
today=await call('/timetable',{cookie:admin});tomorrow=today.data.tomorrow;parity=tomorrow.weekParity;otherParity=parity==='odd'?'even':'odd';
assert.equal((await call('/timetable',{cookie:admin,method:'POST',body:{weekday:1,period:1,span:5,name:'太长'}})).status,400);
assert.equal((await call('/timetable',{cookie:admin,method:'POST',body:{weekday:1,period:19,span:3,name:'越界'}})).status,400);
assert.equal((await call('/timetable',{cookie:admin,method:'POST',body:{weekday:1,period:1,name:'坏周次',weeks:'sometimes'}})).status,400);
// 把明天手动设为调休上班日（按周一课表），保证这天的判断与真实日期无关
await call('/holidays/'+tomorrow.date,{cookie:admin,method:'DELETE'});
r=await call('/holidays',{cookie:admin,method:'POST',body:{date:tomorrow.date,name:'调休测试',off:false,follow:1}});
assert.equal(r.status,200,JSON.stringify(r.data));
assert.equal((await call('/holidays',{cookie:admin,method:'POST',body:{date:tomorrow.date,name:'调休测试',off:false,follow:9}})).status,400);
r=await call('/timetable',{cookie:admin,method:'POST',body:{weekday:1,period:5,span:2,name:'连堂课',weeks:'all'}});
assert.equal(r.status,201,JSON.stringify(r.data));
const spanner=r.data.tomorrow.courses.find(c=>c.name==='连堂课');
assert.equal(spanner.span,2);assert.equal(r.data.tomorrow.periodCount,2,'连堂按两节统计');
r=await call('/timetable',{cookie:admin,method:'POST',body:{weekday:1,period:7,name:'别的单双周',weeks:otherParity}});
assert.equal(r.status,201);
assert.ok(!r.data.tomorrow.courses.some(c=>c.name==='别的单双周'),'不同单双周的课不应出现在明天');
r=await call('/timetable',{cookie:admin,method:'POST',body:{weekday:1,period:8,name:'本周的课',weeks:parity}});
assert.ok(r.data.tomorrow.courses.some(c=>c.name==='本周的课'),'相同单双周的课应出现在明天');
// 批量导入（清空后导入）
r=await call('/timetable/import',{cookie:admin,method:'POST',body:{replace:true,courses:[{weekday:1,period:1,name:'语文',teacher:'李老师',start:'8:00',end:'8:45'},{weekday:1,period:2,name:'数学',span:2,weeks:'all'}]}});
assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.imported,2);assert.equal(r.data.courses.length,2);
r=await call('/timetable/import',{cookie:admin,method:'POST',body:{courses:[{weekday:1,period:1,name:'语文'},{weekday:9,period:1,name:'坏行'}]}});
assert.equal(r.status,400);assert.match(r.data.error,/第 2 行/);
const makeup=await call('/timetable',{cookie:member});
assert.equal(makeup.data.tomorrow.kind,'makeup');assert.equal(makeup.data.tomorrow.follow,1);assert.equal(makeup.data.tomorrow.followText,'周一');
assert.deepEqual(makeup.data.tomorrow.courses.map(c=>c.name),['语文','数学'],'调休日应显示周一的课表');
assert.equal(makeup.data.tomorrow.periodCount,3);
assert.equal(makeup.data.tomorrow.courses[0].start,'08:00');
assert.ok(Array.isArray(makeup.data.upcoming),'应返回临近节假日');
assert.ok(makeup.data.upcoming.some(item=>item.kind==='makeup'),'临近提醒应包含调休上班');
assert.ok(makeup.data.days.length===7&&makeup.data.days[0].date===makeup.data.today.date);
assert.equal((await call('/holidays/'+tomorrow.date,{cookie:admin,method:'DELETE'})).status,200);
const form=new FormData();form.append('file',new File([before],'test.pdf',{type:'application/pdf'}));form.append('title','上传测试');form.append('siteId',filesSite.data.site.id);form.append('metadata',JSON.stringify({pages:62,items:[{title:'开幕式程序',page:1,level:0}],mode:'headings'}));r=await call('/upload',{cookie:admin,method:'POST',body:form});assert.equal(r.status,201,JSON.stringify(r.data));const uploaded=r.data.id;
r=await call('/documents/'+uploaded+'/file',{cookie:member});assert.equal(r.status,200);assert.deepEqual(Buffer.from(r.data),before);
r=await call('/documents/'+uploaded+'/file?download',{cookie:member});assert.match(r.headers.get('content-disposition'),/^attachment/);
r=await call('/upload',{cookie:admin,method:'POST',body:(()=>{const bad=new FormData();bad.append('file',new File([new TextEncoder().encode('<html>bad')],'bad.docx'));bad.append('title','伪造文件');bad.append('siteId',filesSite.data.site.id);bad.append('metadata',JSON.stringify({pages:0,items:[],mode:'original'}));return bad})()});
assert.equal(r.status,400,'扩展名与文件内容不符时必须拒绝');assert.match(r.data.error,/不匹配/);
r=await call('/upload',{cookie:admin,method:'POST',body:(()=>{const long=new FormData();long.append('file',new File([before],'too-many-pages.pdf',{type:'application/pdf'}));long.append('title','页数超限');long.append('siteId',filesSite.data.site.id);long.append('metadata',JSON.stringify({pages:501,items:[],mode:'headings'}));return long})()});
assert.equal(r.status,400,'超过 500 页时必须拒绝');assert.match(r.data.error,/500 页/);
const list=(await call('/users',{cookie:admin})).data.users;const target=list.find(u=>u.username===username);assert.equal((await call('/users/'+target.id,{cookie:admin,method:'PATCH',body:{role:'member',disabled:true}})).status,200);assert.equal((await call('/documents',{cookie:member})).status,401);
assert.equal((await call('/users/'+list.find(u=>u.username===adminUser).id,{cookie:admin,method:'PATCH',body:{role:'member',disabled:true}})).status,400);
assert.equal((await call('/logout',{cookie:admin,method:'POST'})).status,200);assert.equal((await call('/documents',{cookie:admin})).status,401);
console.log('PASS: login, forced password change, CSRF, member restrictions, PDF integrity, upload validation, R2 storage, account disabling, protected admin and logout.');
