import {extractOutline} from '../shared/outline.mjs';
import {fileTypes,extension,validateFile,siteKinds,allowedExtensions,kindOf,isImage,isVideo,isAudio,imageExtensions,videoExtensions,audioExtensions,mediaMime,uploadLimitFor,limitText,chunkSize} from '../shared/file-types.mjs';
import {zipEntries,readZipEntry} from '../shared/zip.mjs';
import {loadPdf,viewerMarkup,mountPdfViewer,setDensityCap} from './pdf-viewer.mjs';
import {beijingDate,weekdayNames,reminderTitle,reminderDetail,periodText,weeksText,upcomingText,termWeeks} from '../shared/schedule.mjs';
import {net,settings as netSettings,apply as applyNet,observe as observeNet,describe as describeNet} from './net.mjs';
import {permissionList,permissionKeys,permissionLabel,permissionText,can as canDo,cleanPermissions} from '../shared/permissions.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user,sites=[],docs=[],brand=null,setupPending=false,groups=[];
const can=key=>canDo(user,key);
const canAny=()=>permissionKeys.some(key=>can(key));
const groupById=id=>groups.find(group=>group.id===id)||null;
function permissionBoxes(name,checked,id){return permissionList.map(item=>`<label class="perm"><input type="checkbox" name="${name}" value="${item.key}"${checked.includes(item.key)?' checked':''}><span><strong>${item.label}</strong><small>${item.hint}</small></span></label>`).join('')}
const netPrefs=()=>netSettings();
const thumbUrl=item=>item&&item.meta&&item.meta.thumb?'/api/documents/'+item.id+'/thumb':mediaUrl(item);
function paintNetStatus(){const box=$('#netStatus');if(box)box.textContent=describeNet()}
const prefetched=new Set();
function prefetchLink(href){if(!href||!netPrefs().prefetch)return;if(href.indexOf('/account/')===0||href.indexOf('/admin/')===0)return;if(href.charAt(0)!=='/')return;if(prefetched.has(href))return;prefetched.add(href);const site=href.match(/^\/sites\/([a-z0-9-]+)\/$/);const fixed={'/':'/api/documents','/timetable/':'/api/timetable','/calendar/':'/api/calendar'};const url=site?'/api/documents?site='+encodeURIComponent(site[1]):fixed[href];if(!url)return;fetch(url,{credentials:'same-origin'}).catch(()=>{})}
function installPrefetch(){const onOver=event=>{const link=event.target.closest?event.target.closest('a[href^="/"]'):null;if(link)prefetchLink(link.getAttribute('href'))};document.addEventListener('pointerover',onOver,{passive:true});document.addEventListener('touchstart',onOver,{passive:true});document.addEventListener('focusin',onOver);window.addEventListener('classhub:net',()=>{paintNetStatus();setDensityCap(netPrefs().density);prefetched.clear()});window.addEventListener('classhub:prefs',()=>{applyNet();paintNetStatus()})}
const brandInfo=()=>({school:(brand&&brand.school)||'',name:(brand&&brand.name)||'2028届1班',subtitle:(brand&&brand.subtitle)||'信息资源共享网站'});
function applyBrand(){const b=brandInfo(),sub=b.school?b.school+' · '+b.subtitle:b.subtitle;const name=$('#brandName'),small=$('#brandSub'),foot=$('#footerLine');if(name)name.textContent=b.name;if(small)small.textContent=sub;if(foot)foot.textContent=(b.school?b.school+' · ':'')+b.name+' · '+b.subtitle;document.title=(b.school?b.school+' ':'')+b.name+b.subtitle}
let apiEpoch=0;
async function api(path,options={}){const method=String(options.method||'GET').toUpperCase();const url='/api'+path+(method==='GET'&&apiEpoch?(path.indexOf('?')>=0?'&':'?')+'e='+apiEpoch:'');const res=await fetch(url,{...options,headers:options.body instanceof FormData?{}:{'Content-Type':'application/json',...options.headers}});const data=await res.json();if(!res.ok)throw Error(data.error||'操作失败');if(method!=='GET'){apiEpoch++}return data}
function toast(msg){$('#notice').textContent=msg;$('#notice').style.display='block';setTimeout(()=>$('#notice').style.display='none',4500)}
function error(form,e){form.querySelector('.error').textContent=e.message}
function wireForm(id,handler){const form=$(id);form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button[type=submit]');button.disabled=true;form.querySelector('.error').textContent='';try{await handler(new FormData(form),form)}catch(e){error(form,e)}finally{button.disabled=false}})}
function nav(){
 const path=location.pathname;
 const active=test=>test?' aria-current="page"':'';
 const siteLinks=sites.map(site=>`<a href="/sites/${site.slug}/"${path.indexOf('/sites/'+site.slug+'/')===0?' aria-current="page"':''}><span class="dot" data-kind="${esc(site.kind)}"></span><span>${esc(site.name)}</span><span class="muted">${esc(kindBadge(site.kind))}</span></a>`).join('');
 $('#nav').innerHTML=user?`
  <button class="menu-toggle" id="menuToggle" type="button" aria-expanded="false" aria-controls="navSheet" aria-label="打开菜单"><span></span><span></span><span></span></button>
  <div class="nav-sheet" id="navSheet">
   <div class="nav-primary">
    <a href="/"${active(path==='/')}>首页</a>
    <div class="nav-drop"><button type="button" class="nav-drop-btn" aria-expanded="false">资料站点 ▾</button><div class="nav-drop-panel">${siteLinks||'<span class="muted" style="padding:8px 11px">还没有站点</span>'}</div></div>
    <a href="/chat/"${active(path==='/chat/')}>聊天<span class="nav-badge" id="chatBadge" hidden></span></a>
    <a href="/calendar/"${active(path==='/calendar/')}>日历</a>
    <a href="/timetable/"${active(path==='/timetable/')}>课程表</a>
    ${canAny()?'<a href="/admin/"'+active(path==='/admin/')+'>管理后台</a>':''}
    ${canAny()?`
    <div class="nav-drop"><button type="button" class="nav-drop-btn" aria-expanded="false">＋ 新建</button><div class="nav-drop-panel">
     ${can('upload')?'<a href="/admin/?tab=data&focus=upload">上传资料<span class="muted">PDF/Office/文本</span></a>':''}
     ${can('sites')?'<a href="/admin/?tab=sites&focus=site">新建站点<span class="muted">文件/文件夹/媒体</span></a>':''}
     ${can('accounts')?'<a href="/admin/?tab=data&focus=user">创建班级账户<span class="muted">用户组/权限</span></a>':''}
     ${can('courses')?'<a href="/admin/?tab=courses">编辑课程表<span class="muted">连堂/单双周</span></a>':''}
     ${can('calendar')?'<a href="/admin/?tab=calendar">日历与事件<span class="muted">调休/自定义</span></a>':''}
    </div></div>`:''}
   </div>
   <div class="nav-account">
    <a href="/account/" class="nav-user"${active(path==='/account/')}><span class="avatar">${esc((user.name||'?').trim().slice(0,1)||'?')}</span><span>${esc(user.name)}</span></a>
    <button class="plain" id="logout" type="button">退出</button>
   </div>
  </div>`:'';
 wireNav();
}
function wireNav(){
 const toggle=$('#menuToggle');
 if(toggle)toggle.onclick=event=>{event.stopPropagation();const sheet=$('#navSheet');const open=sheet.classList.toggle('open');toggle.setAttribute('aria-expanded',open?'true':'false')};
 document.querySelectorAll('.nav-drop').forEach(drop=>{const button=drop.querySelector('.nav-drop-btn');if(!button)return;button.onclick=event=>{event.stopPropagation();const open=drop.classList.toggle('open');button.setAttribute('aria-expanded',open?'true':'false')}});
 document.addEventListener('click',()=>document.querySelectorAll('.nav-drop.open').forEach(drop=>drop.classList.remove('open')));
 document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;document.querySelectorAll('.nav-drop.open').forEach(drop=>drop.classList.remove('open'));const sheet=$('#navSheet');if(sheet)sheet.classList.remove('open')});
 const logout=$('#logout');
 if(logout)logout.onclick=async()=>{try{await api('/logout',{method:'POST'});location.href='/'}catch(error){toast(error.message)}};
}
function setupPage(){
 $('#app').innerHTML=`<section class="panel auth"><span class="tag">首次使用</span><h1>先完成网站初始化</h1><p>填写学校和班级名称，并设置一个管理员账号；设置完成后网站才会正式开放。</p>
 <form id="setup"><div class="formgrid"><div><label for="school">学校名称</label><input id="school" name="school" maxlength="40" placeholder="如：第三中学"></div><div><label for="className">班级名称</label><input id="className" name="className" maxlength="30" required placeholder="如：2028届1班"></div></div>
 <label for="subtitle">网站副标题（可选）</label><input id="subtitle" name="subtitle" maxlength="30" placeholder="信息资源共享网站">
 <div class="formgrid"><div><label for="setupUser">管理员账号</label><input id="setupUser" name="username" pattern="[a-zA-Z0-9_.-]{3,32}" required autocomplete="off" placeholder="如 classadmin"></div><div><label for="setupName">管理员姓名（可选）</label><input id="setupName" name="name" maxlength="50" placeholder="如：张老师"></div></div>
 <div class="formgrid"><div><label for="setupPassword">管理员密码（至少 12 个字符）</label><input id="setupPassword" name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></div><div><label for="setupPassword2">再输一次</label><input id="setupPassword2" name="password2" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></div></div>
 <div class="error" role="alert"></div><button class="button" type="submit">完成初始化并进入网站</button></form>
 <p class="hint">这些信息之后都可以在「管理后台 → 网站信息 / 账户与权限」里修改。请把管理员账号和密码妥善保存。</p></section>`;
 wireForm('#setup',async data=>{const body=Object.fromEntries(data);if(body.password!==body.password2)throw Error('两次输入的密码不一致');const result=await api('/setup',{method:'POST',body:JSON.stringify(body)});user=result.user;brand=result.brand||brand;setupPending=false;applyBrand();toast('初始化完成，欢迎使用');await main()});
}
function login(){ $('#app').innerHTML=`<section class="panel auth"><span class="tag">${esc(brandInfo().name)}</span><h1>登录${esc(brandInfo().subtitle)}</h1><p>使用管理员为你创建的班级账号。</p><form id="login"><label for="username">账号</label><input id="username" name="username" autocomplete="username" required maxlength="32"><label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="128"><div class="error" role="alert"></div><button class="button" type="submit">登录</button></form><p class="hint">忘记密码请联系班级管理员重置。</p><ul class="login-features" aria-label="站内功能"><li><b>🗓 课程表</b><span>今天 / 明天 / 后天的课程提醒</span></li><li><b>📅 日历</b><span>法定节假日与调休自动同步</span></li><li><b>📄 资料</b><span>在线预览与下载，支持手机浏览</span></li><li><b>🎬 相册</b><span>图片、视频、音频在线播放</span></li></ul></section>`;wireForm('#login',async data=>{const r=await api('/login',{method:'POST',body:JSON.stringify(Object.fromEntries(data))});user=r.user;await main()})}
function password(){ $('#app').innerHTML=`<section class="panel auth"><span class="tag">${user.role==='admin'?'管理员':'普通成员'}</span><h1>${user.mustChange?'设置你的新密码':'账户与密码'}</h1><p>${esc(user.name)} · ${esc(user.username)}</p>${user.mustChange?'<div class="hintbox">首次登录或密码被重置后，需要先更换初始密码。</div>':''}<form id="passwordForm"><label for="old">当前密码</label><input id="old" name="oldPassword" type="password" autocomplete="current-password" required><label for="new">新密码（至少 12 个字符）</label><input id="new" name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128"><label for="repeat">再次输入新密码</label><input id="repeat" name="repeat" type="password" autocomplete="new-password" required><div class="error" role="alert"></div><button class="button" type="submit">保存新密码</button></form></section>`;wireForm('#passwordForm',async data=>{if(data.get('password')!==data.get('repeat'))throw Error('两次输入的密码不一致');await api('/password',{method:'POST',body:JSON.stringify(Object.fromEntries(data))});location.href='/'})}

const imageNames=imageExtensions;
const videoNames=videoExtensions;
const kindLabel=kind=>kind==='gallery'?'媒体库':kind==='folder'?'文件夹站点':'文件站点';
const kindBadge=kind=>kind==='gallery'?'媒体':kind==='folder'?'文件夹':'文件';
function siteOf(slug){return sites.find(s=>s.slug===slug)}
function siteById(id){return sites.find(s=>s.id===id)}
function currentSite(){const m=location.pathname.match(/^\/sites\/([a-z0-9-]+)\/$/);return m?m[1]:null}
function sitecard(s){return `<a class="panel sitecard" href="/sites/${s.slug}/"><span class="tag">${esc(kindLabel(s.kind))}</span><h2>${esc(s.name)}</h2><p>${esc(s.description||'暂无说明，可由管理员在后台补充。')}</p><span class="muted">${s.count} 份资料 · 进入站点 →</span></a>`}
function card(d){const type=d.file_type||'pdf',slug=d.site_slug||'',kind=d.kind||'files';
 const photo=imageNames.includes(type),text=type==='txt'||type==='md';
 const detail=kind==='gallery'?(photo?('图片'+((d.meta&&d.meta.width)?' '+d.meta.width+'×'+d.meta.height:'')+' · '+formatBytes(d.size)):('视频'+(d.meta&&d.meta.duration?' '+d.meta.duration+' 秒':'')+' · '+formatBytes(d.size)))
  :kind==='folder'?('压缩包'+(d.meta&&d.meta.count!==undefined?' · 内含 '+d.meta.count+' 个文件':'')+' · '+formatBytes(d.size))
  :(type==='pdf'?d.pages+' 页 · ':'')+formatBytes(d.size)+(type==='pdf'?' · '+d.outline.length+' 个大纲条目':text?' · 可在线预览':' · 下载查看');
 return `<a class="filecard" href="/sites/${slug}/?doc=${encodeURIComponent(d.id)}"><span class="format-badge" data-type="${type}">${type.toUpperCase()}</span><div><strong>${esc(d.title)}</strong><span class="meta">${esc(detail)}</span></div><span class="arrow" aria-hidden="true">→</span></a>`}
function lessonList(courses){return courses.length?`<ol class="lessonlist">${courses.map(c=>`<li><span class="period">${periodText(c)}</span><strong>${esc(c.name)}</strong>${weeksText(c)?'<span class="badge">'+weeksText(c)+'</span>':''}<span class="muted">${esc([c.teacher,c.room,c.start?(c.start+(c.end?'–'+c.end:'')):''].filter(Boolean).join(' · '))}</span></li>`).join('')}</ol>`:''}
function lessonBrief(courses){return courses.length?courses.map(c=>esc(c.name)+(weeksText(c)?'（'+weeksText(c)+'）':'')).join('、'):'没有排课'}
function reminderCard(plan,prefix,detailed){return `<section class="panel reminder${detailed?' primary':''}"><div><span class="tag">${prefix}</span><h2>${esc(reminderTitle(plan,prefix))}</h2><p>${esc(reminderDetail(plan))}</p></div>${detailed?lessonList(plan.courses):'<p class="smalltext">'+lessonBrief(plan.courses)+'</p>'}</section>`}
function reminderCards(plans){const labels=['今天','明天','后天'];return `<div class="reminder-row">${plans.slice(0,3).map((plan,index)=>reminderCard(plan,labels[index],index===1)).join('')}</div>`}
function upcomingBanner(upcoming,title){return upcoming&&upcoming.length?`<section class="panel upcoming"><span class="tag">${title||'临近安排'}</span><ul>${upcoming.map(item=>`<li><strong>${esc(item.name+item.label)}</strong><span class="muted">${esc(upcomingText(item))}</span></li>`).join('')}</ul></section>`:''}
let calendarCursor=null;
async function calendarPage(){const today=beijingDate(),params=new URLSearchParams(location.search),year=Number(params.get('year')),month=Number(params.get('month'));calendarCursor=(year>=2000&&year<=2100&&month>=1&&month<=12)?{year,month}:{year:Number(today.slice(0,4)),month:Number(today.slice(5,7))};await loadCalendar()}
async function loadCalendar(){
 const data=await api('/calendar?year='+calendarCursor.year+'&month='+calendarCursor.month);
 const cells=[];
 for(let i=1;i<data.month.firstWeekday;i++)cells.push('<div class="calcell blank"></div>');
 for(const day of data.month.days){
  const mark=day.kind==='holiday'?'休':day.kind==='makeup'?'班':'';
  cells.push(`<div class="calcell ${day.kind}${day.date===data.today.date?' today':''}"><span class="daynum">${day.day}</span>${mark?'<span class="calmark">'+mark+'</span>':''}${day.name?'<span class="calname">'+esc(day.name)+'</span>':''}${day.events&&day.events.length?'<span class="calevent">'+day.events.map(event=>esc(event.name)).join('、')+'</span>':''}</div>`);
 }
 const groups=data.holidays.length?`<ul class="holidaylist">${data.holidays.map(g=>`<li><span class="tag">${g.kind==='holiday'?'放假':'调休上班'}</span><strong>${esc(g.name)}</strong><span class="muted">${esc(g.label)}</span></li>`).join('')}</ul>`:'<p class="muted">本月没有法定节假日或调休安排。</p>';
 $('#app').innerHTML=`<div class="crumb"><a href="/">主站首页</a> / 日历</div><div class="page-head"><div><h1>${calendarCursor.year} 年 ${calendarCursor.month} 月</h1><p class="smalltext">法定节假日与调休自动同步（${esc(String(data.source||'官方公告').slice(0,18))}）${data.syncedAt?' · 最近同步 '+esc(String(data.syncedAt).slice(0,10)):''}</p></div><div class="page-actions"><button class="button secondary" data-month="-1">上一月</button><button class="button secondary" data-month="0">回到本月</button><button class="button secondary" data-month="1">下一月</button>${can('calendar')?'<a class="button secondary" href="/admin/?tab=calendar">编辑日历与事件</a>':''}</div></div>${reminderCards(data.days)}${upcomingBanner(data.upcoming,'近期假期')}<div class="calwrap"><div class="calhead">${weekdayNames.map(w=>'<span>'+w+'</span>').join('')}</div><div class="calgrid">${cells.join('')}</div></div><section class="panel spaced"><h2>本月节假日与调休</h2>${groups}</section>`;
 $('#app').querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{const delta=Number(b.dataset.month);if(delta){let year=calendarCursor.year,month=calendarCursor.month+delta;if(month<1){month=12;year--}if(month>12){month=1;year++}calendarCursor={year,month}}else{const today=beijingDate();calendarCursor={year:Number(today.slice(0,4)),month:Number(today.slice(5,7))}}loadCalendar()});
}
function adminCalendarTools(){const follows=weekdayNames.map((name,index)=>`<option value="${index+1}">按${name}课表</option>`).join('');
 return `<section class="panel spaced"><h2>节假日维护</h2><p class="smalltext">官方数据自动同步；学校自己的安排（如校运会）可以覆盖某一天。调休上班日可以指定“按哪一天的课表上课”，课程表与提醒会照此显示。</p><div class="buttons"><button class="button" id="syncHolidays">立即同步官方数据</button></div><form id="holidayForm" class="spaced"><div class="formgrid"><div><label for="hdate">日期</label><input id="hdate" name="date" type="date" required></div><div><label for="hname">名称</label><input id="hname" name="name" required maxlength="20" placeholder="如 校运会"></div><div><label for="hoff">类型</label><select id="hoff" name="off"><option value="true">放假</option><option value="false">正常上课（调休上班）</option></select></div><div><label for="hfollow">调休按哪天课表</label><select id="hfollow" name="follow"><option value="0">按当天</option>${follows}</select></div></div><div class="error" role="alert"></div><button class="button" type="submit">保存这一天</button></form></section><section class="panel spaced"><h2>自定义事件</h2><p class="smalltext">开学、考试、运动会、家长会等都可以加进来，会出现在“近期假期”倒计时里，也会在月历上标出。</p><form id="eventForm"><div class="formgrid"><div><label for="eventDate">日期</label><input id="eventDate" name="date" type="date" required></div><div><label for="eventName">事件</label><input id="eventName" name="name" required maxlength="30" placeholder="如 期中考试"></div></div><label for="eventNote">备注（可选）</label><input id="eventNote" name="note" maxlength="60"><div class="error" role="alert"></div><div class="buttons"><button class="button" type="submit">保存事件</button><button class="button secondary" type="button" id="cancelEvent">取消编辑</button></div></form><div id="events" class="tablewrap"></div></section>`}
function wireCalendarTools(){
 $('#syncHolidays').onclick=async()=>{const button=$('#syncHolidays');button.disabled=true;try{const result=await api('/holidays/sync',{method:'POST'});toast('已同步 '+result.years+' 年、'+result.days+' 天节假日数据');await reloadAdminCalendar()}catch(e){toast(e.message)}finally{button.disabled=false}};
 wireForm('#holidayForm',async(data,form)=>{const body=Object.fromEntries(data);body.off=body.off==='true';body.follow=Number(body.follow)||0;await api('/holidays',{method:'POST',body:JSON.stringify(body)});form.reset();toast('已保存这一天的安排');await reloadAdminCalendar()});
 $("#cancelEvent").onclick=()=>{editingEvent=null;$("#eventForm").reset();toast('已退出编辑')};
 wireForm('#eventForm',async(data,form)=>{const body=Object.fromEntries(data);if(editingEvent){await api('/events/'+editingEvent,{method:'PATCH',body:JSON.stringify(body)});editingEvent=null;toast('事件已更新')}else{await api('/events',{method:'POST',body:JSON.stringify(body)});toast('事件已添加，倒计时里会显示')}form.reset();await reloadAdminCalendar()});
}
let timetableData=null,importRows=[];
async function timetablePage(){timetableData=await api('/timetable');renderTimetable()}
function renderTimetable(){
 const data=timetableData;
 const weekTip=data.settings&&data.settings.termStart?('学期开始 '+esc(data.settings.termStart)+'，按教学周计算'):'未设置学期开始日期，暂按自然周计算';
 const strip=data.days.map((day,index)=>`<div class="daychip${index===1?' tomorrow':''}${day.school?'':' rest'}"><span class="muted">${index===0?'今天':index===1?'明天':index===2?'后天':day.weekdayText}</span><strong>${esc(day.shortText)}</strong><span>${esc(day.school?(day.periodCount?day.periodCount+' 节课':'没有排课'):day.label)}</span></div>`).join('');
 const span=c=>Math.max(1,Number(c.span)||1);
 const maxPeriod=Math.max(8,...data.courses.map(c=>c.period+span(c)-1));
 const rows=[];
 for(let period=1;period<=maxPeriod;period++){
  const cells=[];
  weekdayNames.forEach((name,index)=>{
   const weekday=index+1,starting=data.courses.filter(c=>c.weekday===weekday&&c.period===period);
   if(!starting.length){
    const covered=data.courses.some(c=>c.weekday===weekday&&c.period<period&&c.period+span(c)>period);
    if(!covered)cells.push('<td><span class="muted">—</span></td>');
    return;
   }
   const rowSpan=Math.max(...starting.map(span));
   cells.push(`<td${rowSpan>1?' rowspan="'+rowSpan+'"':''}>${starting.map(c=>`<div class="lesson"${span(c)>1?' style="min-height:'+(46*span(c))+'px"':''}><strong>${esc(c.name)}</strong>${weeksText(c)?'<span class="badge">'+weeksText(c)+'</span>':''}${span(c)>1?'<span class="badge">连堂 '+span(c)+' 节</span>':''}${c.teacher||c.room?'<span class="muted">'+esc([c.teacher,c.room].filter(Boolean).join(' · '))+'</span>':''}${c.start?'<span class="muted">'+esc(c.start)+(c.end?'–'+esc(c.end):'')+'</span>':''}</div>`).join('')}</td>`);
  });
  rows.push(`<tr><th>第 ${period} 节</th>${cells.join('')}</tr>`);
 }
 $('#app').innerHTML=`<div class="crumb"><a href="/">主站首页</a> / 课程表</div><div class="page-head"><div><h1>课程表</h1><p class="smalltext">本周是第 ${data.week.number} 周（${esc(data.week.parityText||data.week.parity)}）· ${weekTip}</p></div><div class="page-actions"><a class="button secondary" href="/calendar/">查看日历</a>${can('courses')?'<a class="button secondary" href="/admin/?tab=courses">编辑课程表</a>':''}</div></div>${reminderCards([data.today,data.tomorrow,data.dayAfter])}${upcomingBanner(data.upcoming,'近期假期')}<div class="daystrip">${strip}</div><section class="panel spaced"><h2>一周课程</h2><div class="tablewrap"><table class="timetable"><thead><tr><th>节次</th>${weekdayNames.map(w=>'<th>'+w+'</th>').join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></section>`;
}
function adminCourseTools(){const options=weekdayNames.map((name,index)=>`<option value="${index+1}">${name}</option>`).join('');
 return `<section class="panel spaced"><h2>课程维护</h2><p class="smalltext">保存后首页与课程表页的提醒会立即更新；连堂课在“连堂节数”里填 2–4，单双周课在“周次”里选择。</p><form id="courseForm"><div class="formgrid"><div><label for="cweekday">星期</label><select id="cweekday" name="weekday">${options}</select></div><div><label for="cperiod">开始节次</label><input id="cperiod" name="period" type="number" min="1" max="20" value="1" required></div><div><label for="cspan">连堂节数</label><input id="cspan" name="span" type="number" min="1" max="4" value="1"></div><div><label for="cweeks">周次</label><select id="cweeks" name="weeks"><option value="all">每周</option><option value="odd">单周</option><option value="even">双周</option></select></div><div><label for="cname">科目</label><input id="cname" name="name" required maxlength="40" placeholder="如 数学"></div><div><label for="cteacher">老师（可选）</label><input id="cteacher" name="teacher" maxlength="20"></div><div><label for="croom">教室（可选）</label><input id="croom" name="room" maxlength="20"></div><div><label for="cstart">开始时间（可选）</label><input id="cstart" name="start" placeholder="08:00"></div><div><label for="cend">结束时间（可选）</label><input id="cend" name="end" placeholder="08:45"></div></div><label for="cnote">备注（可选）</label><input id="cnote" name="note" maxlength="60"><div class="error" role="alert"></div><button class="button" type="submit">添加课程</button></form><div id="courses" class="tablewrap"></div></section><section class="panel spaced"><h2>批量导入课程表</h2><p class="smalltext">每行一节课，用 Tab、逗号或竖线分隔：星期, 开始节次, 科目, 老师, 教室, 开始时间, 结束时间, 周次, 连堂节数（后几项可省略）。可以直接从 Excel 复制粘贴。</p><textarea id="importText" rows="6" placeholder="周一,1,语文,李老师,高一(1)班,08:00,08:45,每周,1&#10;周二,1,数学,王老师,高一(1)班,08:00,08:45,每周,1"></textarea><label class="confirm-layout"><input type="checkbox" id="importReplace">导入前清空现有课程表</label><div class="buttons"><button class="button secondary" type="button" id="parseImport">解析预览</button><button class="button" type="button" id="runImport" disabled>导入课程表</button></div><div id="importPreview" class="tablewrap"></div></section><section class="panel spaced"><h2>学期与提醒设置</h2><p class="smalltext">设置学期开始日期后，单双周按教学周（第 1 周起）计算；倒计时窗口与条数也可以调整。</p><form id="settingsForm"><div class="formgrid"><div><label for="termStart">学期开始日期（第 1 周第一天）</label><input id="termStart" name="termStart" type="date"></div><div><label for="countdownDays">倒计时窗口（天）</label><input id="countdownDays" name="countdownDays" type="number" min="1" max="60" value="14"></div><div><label for="countdownLimit">最多显示几条</label><input id="countdownLimit" name="countdownLimit" type="number" min="1" max="8" value="3"></div></div><div class="error" role="alert"></div><button class="button" type="submit">保存设置</button></form><div id="termPreview" class="smalltext"></div></section><dialog id="courseDialog"><h2>编辑课程</h2><form id="courseEditForm"><div class="formgrid"><div><label for="eweekday">星期</label><select id="eweekday" name="weekday">${options}</select></div><div><label for="eperiod">开始节次</label><input id="eperiod" name="period" type="number" min="1" max="20" required></div><div><label for="espan">连堂节数</label><input id="espan" name="span" type="number" min="1" max="4"></div><div><label for="eweeks">周次</label><select id="eweeks" name="weeks"><option value="all">每周</option><option value="odd">单周</option><option value="even">双周</option></select></div></div><label for="ename">科目</label><input id="ename" name="name" required maxlength="40"><div class="formgrid"><div><label for="eteacher">老师</label><input id="eteacher" name="teacher" maxlength="20"></div><div><label for="eroom">教室</label><input id="eroom" name="room" maxlength="20"></div><div><label for="estart">开始时间</label><input id="estart" name="start" placeholder="08:00"></div><div><label for="eend">结束时间</label><input id="eend" name="end" placeholder="08:45"></div></div><label for="enote">备注</label><input id="enote" name="note" maxlength="60"><div class="error" role="alert"></div><div class="buttons"><button class="button" type="submit">保存</button><button class="button secondary" type="button" id="cancelCourse">取消</button></div></form></dialog>`}
function parseWeekday(value){const text=String(value||'').trim();if(/^[1-7]$/.test(text))return Number(text);const key=text.replace(/^(星期|周|礼拜)/,''),map={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,'天':7};return map[key]||0}
function parseWeeks(value){const text=String(value||'').trim();if(!text||/^(每周|全部|all)$/i.test(text))return 'all';if(/单|odd/i.test(text))return 'odd';if(/双|even/i.test(text))return 'even';return ''}
function parseIntroRows(text){
 const rows=[],errors=[];
 const clock=/^([01]?\d|2[0-3]):[0-5]\d$/;
 text.split(/\r?\n/).forEach((line,index)=>{const raw=line.trim();if(!raw||raw.charAt(0)==='#')return;
  let parts=raw.split(/\t|,|，|\|/).map(part=>part.trim());
  const weekAt=parts.findIndex((part,position)=>position>1&&/^(每周|单周|双周|all|odd|even)$/i.test(part));
  let weeks='all';
  if(weekAt>0){weeks=parseWeeks(parts[weekAt]);parts=parts.slice(0,weekAt).concat(parts.slice(weekAt+1))}
  const weekday=parseWeekday(parts[0]),period=Number(parts[1]),name=(parts[2]||'').trim();
  if(!weekday){errors.push('第 '+(index+1)+' 行：星期无法识别（用 周一…周日 或 1…7）');return}
  if(!Number.isInteger(period)||period<1||period>20){errors.push('第 '+(index+1)+' 行：开始节次应为 1–20');return}
  if(!name){errors.push('第 '+(index+1)+' 行：缺少科目');return}
  const rest=parts.slice(3),teacher=(rest[0]||'').trim(),room=(rest[1]||'').trim(),start=(rest[2]||'').trim(),end=(rest[3]||'').trim(),span=Number(rest[4])||1;
  if(start&&!clock.test(start)){errors.push('第 '+(index+1)+' 行：开始时间应为 HH:MM');return}
  if(end&&!clock.test(end)){errors.push('第 '+(index+1)+' 行：结束时间应为 HH:MM');return}
  if(!Number.isInteger(span)||span<1||span>4){errors.push('第 '+(index+1)+' 行：连堂节数应为 1–4');return}
  if(period+span-1>20){errors.push('第 '+(index+1)+' 行：连堂超出节次范围');return}
  rows.push({weekday,period,span,weeks,name,teacher,room,start,end,note:''});
 });
 return {rows,errors};
}
function wireCourseTools(){
 wireForm('#courseForm',async(data,form)=>{timetableData=await api('/timetable',{method:'POST',body:JSON.stringify(Object.fromEntries(data))});form.reset();refreshCourseArea();toast('课程已添加')});
 let editing=null;
 $('#cancelCourse').onclick=()=>$('#courseDialog').close();
 wireForm('#courseEditForm',async(data,form)=>{timetableData=await api('/timetable/'+editing,{method:'PATCH',body:JSON.stringify(Object.fromEntries(data))});$('#courseDialog').close();refreshCourseArea();toast('课程已更新')});
 $('#parseImport').onclick=()=>{const parsed=parseIntroRows($('#importText').value);importRows=parsed.rows;
  $('#importPreview').innerHTML=(parsed.errors.length?'<p class="error">'+parsed.errors.map(esc).join('<br>')+'</p>':'')+(parsed.rows.length?`<table><thead><tr><th>星期</th><th>节次</th><th>科目</th><th>老师</th><th>教室</th><th>时间</th><th>周次</th><th>连堂</th></tr></thead><tbody>${parsed.rows.map(r=>`<tr><td>${weekdayNames[r.weekday-1]}</td><td>第 ${r.period} 节</td><td>${esc(r.name)}</td><td>${esc(r.teacher||'—')}</td><td>${esc(r.room||'—')}</td><td>${esc([r.start,r.end].filter(Boolean).join('–')||'—')}</td><td>${r.weeks==='odd'?'单周':r.weeks==='even'?'双周':'每周'}</td><td>${r.span}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">没有解析到课程。</p>');
  $('#runImport').disabled=!parsed.rows.length||parsed.errors.length>0};
 $('#runImport').onclick=async()=>{const button=$('#runImport');button.disabled=true;
  try{timetableData=await api('/timetable/import',{method:'POST',body:JSON.stringify({replace:$('#importReplace').checked,courses:importRows})});$('#importText').value='';importRows=[];renderTimetable();toast('已导入 '+timetableData.imported+' 条课程')}catch(e){toast(e.message);button.disabled=false}};
 const config=timetableData.settings||{};
 $("#termStart").value=config.termStart||'';
 $("#countdownDays").value=config.countdownDays||14;
 $("#countdownLimit").value=config.countdownLimit||3;
 renderTermPreview();
 $("#termStart").onchange=renderTermPreview;
 wireForm('#settingsForm',async(data,form)=>{const result=await api('/settings',{method:'PATCH',body:JSON.stringify(Object.fromEntries(data))});toast(result.settings.termStart?('已保存：按教学周计算，学期开始 '+result.settings.termStart):'已保存设置');await timetablePage()});
 renderCourseList();
}
let editingEvent=null,editingGroup=null;
function renderEventList(events){
 const box=$("#events");if(!box)return;
 box.innerHTML=events&&events.length?`<table><thead><tr><th>日期</th><th>事件</th><th>备注</th><th>操作</th></tr></thead><tbody>${events.map(event=>`<tr><td>${esc(event.date)}</td><td>${esc(event.name)}</td><td>${esc(event.note||'—')}</td><td><button data-id="${event.id}" data-action="edit">编辑</button><button data-id="${event.id}" data-action="delete">删除</button></td></tr>`).join('')}</tbody></table>`:'<p class="muted">还没有自定义事件。</p>';
 box.querySelectorAll('button').forEach(button=>button.onclick=async()=>{const event=(events||[]).find(item=>item.id===button.dataset.id);if(!event)return;
  if(button.dataset.action==='edit'){editingEvent=event.id;$("#eventDate").value=event.date;$("#eventName").value=event.name;$("#eventNote").value=event.note||'';toast('修改后点“保存事件”即可');return}
  if(!confirm('删除事件「'+event.name+'」？'))return;
  try{await api('/events/'+event.id,{method:'DELETE'});await reloadAdminCalendar();toast('事件已删除')}catch(error){toast(error.message)}});
}
function renderTermPreview(){const box=$("#termPreview");if(!box)return;const list=termWeeks($("#termStart").value,4);box.textContent=list.length?('确认：'+list.map(week=>'第 '+week.number+' 周 '+week.start+'–'+week.end+'（'+(week.parity==='odd'?'单周':'双周')+'）').join('；')):'未设置学期开始日期时，按自然周（ISO 周次）计算单双周。';}
function renderCourseList(){
 const list=timetableData.courses;
 $('#courses').innerHTML=list.length?`<table><thead><tr><th>时间</th><th>科目</th><th>老师</th><th>教室</th><th>周次</th><th>操作</th></tr></thead><tbody>${list.map(c=>`<tr><td>${weekdayNames[c.weekday-1]} ${periodText(c)}${c.start?'<br><span class="muted">'+esc(c.start)+(c.end?'–'+esc(c.end):'')+'</span>':''}</td><td>${esc(c.name)}</td><td>${esc(c.teacher||'—')}</td><td>${esc(c.room||'—')}</td><td>${esc(weeksText(c)||'每周')}</td><td><button data-id="${c.id}" data-action="edit">编辑</button><button data-id="${c.id}" data-action="delete">删除</button></td></tr>`).join('')}</tbody></table>`:'<p class="muted">还没有课程，可以在上面的表单添加，或用批量导入。</p>';
 $('#courses').querySelectorAll('button').forEach(button=>button.onclick=async()=>{const course=list.find(c=>c.id===button.dataset.id);if(!course)return;
  if(button.dataset.action==='edit'){$('#eweekday').value=String(course.weekday);$('#eperiod').value=course.period;$('#espan').value=Number(course.span)||1;$('#eweeks').value=course.weeks||'all';$('#ename').value=course.name;$('#eteacher').value=course.teacher;$('#eroom').value=course.room;$('#estart').value=course.start;$('#eend').value=course.end;$('#enote').value=course.note;editing=course.id;$('#courseDialog').showModal();return}
  if(!confirm('删除「'+weekdayNames[course.weekday-1]+' '+periodText(course)+' '+course.name+'」？'))return;
  try{timetableData=await api('/timetable/'+course.id,{method:'DELETE'});refreshCourseArea();toast('课程已删除')}catch(e){toast(e.message)}});
}
async function home(){
 const data=await api('/timetable');
 const counts={files:0,folder:0,gallery:0};sites.forEach(site=>{if(counts[site.kind]!==undefined)counts[site.kind]+=1});
 const entries=[];
 entries.push({href:'/timetable/',icon:'🗓',label:'课程表',note:'第 '+data.week.number+' 周 · '+data.week.parityText});
 entries.push({href:'/calendar/',icon:'📅',label:'日历',note:(data.upcoming&&data.upcoming[0])?upcomingText(data.upcoming[0]).slice(0,20):'节假日与调休'});
 sites.forEach(site=>entries.push({href:'/sites/'+site.slug+'/',icon:site.kind==='gallery'?'🎬':site.kind==='folder'?'🗂':'📄',label:site.name,note:site.count+' 份资料'}));
 if(can('upload'))entries.push({href:'/admin/?tab=data&focus=upload',icon:'⬆',label:'上传资料',note:'管理员入口'});
 const quick=entries.slice(0,6).map(item=>`<a class="entry-tile" href="${item.href}"><span class="entry-icon" aria-hidden="true">${item.icon}</span><strong>${esc(item.label)}</strong><span>${esc(item.note)}</span></a>`).join('')+(entries.length>6?'<a class="entry-tile" href="#sites"><span class="entry-icon">…</span><strong>全部站点</strong><span>共 '+entries.length+' 个入口</span></a>':'');
 const recent=docs.length?`<section class="section"><div class="section-head"><h2>已收录资源</h2><span class="muted">${docs.length} 份文件</span></div><div class="grid-files">${docs.map(card).join('')}</div></section>`:'';
 $('#app').innerHTML=`
 <div class="layout-page">
  <section class="hero">
   <div>
    <div class="eyebrow">${esc(brandInfo().school||brandInfo().name)}</div>
    <h1>${esc(brandInfo().name+brandInfo().subtitle)}</h1>
    <p>查阅班级资料、查看今天的课程与近期安排；所有资料按专题站点分类，图片视频可以直接在线播放。</p>
    <div class="page-actions">${sites.length?'<a class="button" href="/sites/'+esc(sites[0].slug)+'/">进入'+esc(sites[0].name)+'</a>':''}<a class="button secondary" href="/timetable/">看课程表</a><a class="button secondary" href="/calendar/">看日历</a>${can('upload')?'<a class="button secondary" href="/admin/?tab=data&focus=upload">上传资料</a>':''}</div>
   </div>
   <div class="hero-side"><div class="entry-tiles">${quick}</div></div>
   <div class="year" aria-hidden="true">2028</div>
  </section>
  ${reminderCards([data.today,data.tomorrow,data.dayAfter])}
  ${upcomingBanner(data.upcoming,'近期假期')}
  <section class="section" id="sites">
   <div class="section-head"><h2>专题站点</h2><span class="muted">${String(sites.length).padStart(2,'0')} 个站点 · ${counts.files} 个文件站点 · ${counts.gallery} 个媒体库 · ${counts.folder} 个文件夹站点</span></div>
   <div class="grid-auto">${sites.map(sitecard).join('')||'<p class="muted">还没有站点，管理员可以在管理后台创建。</p>'}</div>
  </section>
  ${recent}
 </div>`;
}
function uploadProgress(text){const box=$('#progress');if(box)box.textContent=text}
async function chunkedUpload({file,title,siteId,metadata,onProgress}){
 const init=await api('/upload/large/init',{method:'POST',body:JSON.stringify({siteId,title,filename:file.name,size:file.size})});
 const size=Number(init.chunkSize)||chunkSize,parts=[];let offset=0,number=1;const started=Date.now();
 try{
  while(offset<file.size){
   const slice=file.slice(offset,Math.min(offset+size,file.size));
   const bytes=await slice.arrayBuffer();
   const query='key='+encodeURIComponent(init.key)+'&uploadId='+encodeURIComponent(init.uploadId)+'&part='+number+'&siteId='+encodeURIComponent(siteId)+'&filename='+encodeURIComponent(file.name);
   const response=await fetch('/api/upload/large/part?'+query,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'分片上传失败');
   parts.push({partNumber:data.partNumber,etag:data.etag});
   offset+=bytes.length;
   const done=Math.min(offset,file.size),elapsed=Math.max(0.2,(Date.now()-started)/1000),speed=done/1024/1024/elapsed;
   if(onProgress)onProgress(Math.round(done/file.size*100),done,file.size,speed);
   number++;
  }
  const result=await api('/upload/large/complete',{method:'POST',body:JSON.stringify({key:init.key,uploadId:init.uploadId,parts,siteId,title,filename:file.name,size:file.size,metadata})});
  return result;
 }catch(error){
  fetch('/api/upload/large/abort',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:init.key,uploadId:init.uploadId})}).catch(()=>{});
  throw error;
 }
}
async function sendUpload({file,title,siteId,metadata,siteKind}){
 const limit=uploadLimitFor(siteKind,extension(file.name));
 if(file.size>limit)throw Error(extension(file.name).toUpperCase()+' 最大 '+limitText(limit)+'，当前文件 '+limitText(file.size));
 if(file.size>chunkSize){uploadProgress('正在上传 0%（大文件会分片上传）');const result=await chunkedUpload({file,title,siteId,metadata,onProgress:(percent,done,total,speed)=>uploadProgress('正在上传 '+percent+'% · '+formatBytes(done)+'/'+formatBytes(total)+' · '+speed.toFixed(1)+' MB/s')});uploadProgress('');return result}
 const data=new FormData();data.set('title',title);data.set('file',file);data.set('siteId',siteId);data.set('metadata',JSON.stringify(metadata||{}));return api('/upload',{method:'POST',body:data});
}
function formatBytes(bytes){const value=Number(bytes)||0;if(value<1024)return value+' B';if(value<1024*1024)return (value/1024).toFixed(1)+' KB';if(value<1024*1024*1024)return (value/1024/1024).toFixed(2)+' MB';return (value/1024/1024/1024).toFixed(2)+' GB'}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();setTimeout(()=>{URL.revokeObjectURL(url);link.remove()},5000)}
const thumbWidth=720;
async function imageVariants(file){const bitmap=await createImageBitmap(file);const originalWidth=bitmap.width,originalHeight=bitmap.height;const draw=(maxWidth,quality)=>{const scale=maxWidth&&originalWidth>maxWidth?maxWidth/originalWidth:1;const width=Math.max(1,Math.round(originalWidth*scale)),height=Math.max(1,Math.round(originalHeight*scale));const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(bitmap,0,0,width,height);return new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality))};const full=await draw(0,0.92),thumb=originalWidth>thumbWidth?await draw(thumbWidth,0.7):null;if(bitmap.close)bitmap.close();if(!full)throw Error('浏览器无法把这张图片转换成 WEBP');return {full,thumb,width:originalWidth,height:originalHeight}}
async function toWebp(file,quality){const result=await imageVariants(file);return {blob:result.full,width:result.width,height:result.height}}
async function videoPoster(file,maxWidth){const url=URL.createObjectURL(file),video=document.createElement('video');video.preload='auto';video.muted=true;video.playsInline=true;video.src=url;try{await new Promise(resolve=>{video.onloadeddata=resolve;video.onerror=resolve;setTimeout(resolve,4000);video.load()});if(!video.videoWidth)await new Promise(resolve=>{video.oncanplay=resolve;setTimeout(resolve,2000)});try{video.currentTime=Math.min(0.2,(Number(video.duration)||1)/10)}catch(error){}await new Promise(resolve=>{video.onseeked=resolve;setTimeout(resolve,1500)});const width=video.videoWidth,height=video.videoHeight;if(!width||!height)return null;const scale=maxWidth&&width>maxWidth?maxWidth/width:1;const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.7));return blob||null}catch(error){return null}finally{URL.revokeObjectURL(url);try{video.removeAttribute('src');video.load()}catch(error){}}}
async function imageToPngBlob(url){const response=await fetch(url);if(!response.ok)throw Error('读取图片失败');const bitmap=await createImageBitmap(await response.blob());const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(bitmap.close)bitmap.close();return blob}
function baseName(name){return String(name||'').split('/').pop()}
function stripExtension(name){return String(name||'').replace(/\.[^.]+$/,'')}
function markdownToHtml(text){
 const lines=String(text).replace(/\r\n?/g,'\n').split('\n'),out=[],tick=String.fromCharCode(96);
 let list=null,inCode=false,code=[];
 const inline=value=>esc(value)
  .replace(new RegExp(tick+'([^'+tick+']+)'+tick,'g'),'<code>$1</code>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*]+)\*/g,'$1<em>$2</em>');
 for(const line of lines){
  if(/^```/.test(line)){if(inCode){out.push('<pre class="mdcode">'+esc(code.join('\n'))+'</pre>');code=[];inCode=false}else inCode=true;continue}
  if(inCode){code.push(line);continue}
  const heading=/^(#{1,4})\s+(.*)$/.exec(line),bullet=/^\s*[-*+]\s+(.*)$/.exec(line),ordered=/^\s*\d+[.)]\s+(.*)$/.exec(line);
  if(heading){if(list){out.push('</'+list+'>');list=null}const level=heading[1].length+1;out.push('<h'+level+'>'+inline(heading[2])+'</h'+level+'>');continue}
  if(bullet||ordered){const tag=bullet?'ul':'ol';if(list&&list!==tag){out.push('</'+list+'>');list=null}if(!list){out.push('<'+tag+'>');list=tag}out.push('<li>'+inline((bullet||ordered)[1])+'</li>');continue}
  if(list){out.push('</'+list+'>');list=null}
  if(/^\s*(-{3,}|\*{3,})\s*$/.test(line)){out.push('<hr>');continue}
  if(/^>\s?/.test(line)){out.push('<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>');continue}
  if(!line.trim())continue;
  out.push('<p>'+inline(line)+'</p>');
 }
 if(list)out.push('</'+list+'>');
 if(inCode&&code.length)out.push('<pre class="mdcode">'+esc(code.join('\n'))+'</pre>');
 return out.join('\n');
}
let zipCache={id:'',bytes:null};
async function zipData(item){if(zipCache.id!==item.id)zipCache={id:item.id,bytes:new Uint8Array(await (await fetch('/api/documents/'+item.id+'/file')).arrayBuffer())};return zipCache.bytes}
function textLikeEntry(name){return /\.(txt|md|markdown|json|csv|log|html?|css|js|mjs|ts|tsx|jsx|yml|yaml|xml|ini|cfg|conf|sh|py|java|c|h|cpp|sql)$/i.test(name)}
function imageEntry(name){return /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(name)}
let galleryQueue=[];
function videoDuration(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),video=document.createElement('video');video.preload='metadata';video.onloadedmetadata=()=>{const value=video.duration;URL.revokeObjectURL(url);resolve(Number.isFinite(value)?Math.round(value*10)/10:0)};video.onerror=()=>{URL.revokeObjectURL(url);reject(Error('无法读取视频信息'))};video.src=url})}
async function prepareGallery(files){
 const list=[...files].filter(file=>file&&file.size>0);galleryQueue=[];$('#outlinePreview').innerHTML='';$('#uploadReader').hidden=true;
 if(!list.length)return;
 const allowed=siteKinds.gallery.extensions,tiles=[];
 try{
  for(const [index,file] of list.entries()){
   const ext=extension(file.name);
   if(!allowed.includes(ext))throw Error(file.name+'：图册站点支持 '+allowed.join('、'));
   $('#progress').textContent='正在准备 '+file.name+'（'+(index+1)+'/'+list.length+'）…';
   const original={name:file.name.slice(0,180),type:ext,size:file.size};
   let upload=file,width=0,height=0,converted=false,duration=0,thumb=null;
   if(imageNames.includes(ext)&&ext!=='gif'){const result=await imageVariants(file);upload=new File([result.full],stripExtension(file.name)+'.webp',{type:'image/webp'});width=result.width;height=result.height;converted=true;thumb=result.thumb}
   else if(videoNames.includes(ext)||audioNames.includes(ext)){duration=await videoDuration(file).catch(()=>0);if(videoNames.includes(ext))thumb=await videoPoster(file,thumbWidth)}
   const previewUrl=URL.createObjectURL(thumb||upload);
   galleryQueue.push({file:upload,title:stripExtension(file.name).slice(0,150),meta:{pages:0,items:[],mode:'original',width,height,duration,converted,original},thumb,previewUrl,isVideo:videoNames.includes(ext),size:upload.size,type:extension(upload.name)});
   tiles.push(`<figure class="queueitem"><span class="tilemedia">${videoNames.includes(ext)?(decodable(ext)?'<video src="'+previewUrl+'" preload="metadata" muted playsinline></video>':'<span class="audiotile">🎬</span>'):'<img src="'+previewUrl+'" alt="" loading="lazy" decoding="async">'}</span><figcaption>${esc(file.name)}<br><span class="muted">${extension(upload.name).toUpperCase()} · ${formatBytes(upload.size)}${converted?'（已转 WEBP）':''}${duration?' · '+duration+' 秒':''}</span></figcaption></figure>`);
  }
  $('#progress').textContent='已准备 '+galleryQueue.length+' 个文件，检查后点“上传并保存”。';
  $('#outlinePreview').innerHTML='<details open><summary>待上传（'+galleryQueue.length+'）</summary><div class="queuegrid">'+tiles.join('')+'</div></details>';
  $('#confirmLabel').hidden=true;$('#upload button[type=submit]').disabled=false;
 }catch(err){galleryQueue=[];$('#upload button[type=submit]').disabled=true;$('#progress').textContent='';throw err}
}
async function uploadGallery(){
 const button=$('#upload button[type=submit]');button.disabled=true;$('#file').disabled=true;$('#title').disabled=true;$('#upload .error').textContent='';
 const target=sites.find(site=>site.id===$('#site').value);if(!target){toast('请先在“站点管理”里创建站点，再上传资料');button.disabled=false;$('#file').disabled=false;$('#title').disabled=false;return}const slug=target.slug;
 try{
  for(const [index,item] of galleryQueue.entries()){
   $('#progress').textContent='正在上传 '+(index+1)+' / '+galleryQueue.length+'：'+item.file.name;
   if(item.thumb){const data=new FormData();data.set('title',item.title);data.set('file',item.file);data.set('siteId',$('#site').value);data.set('metadata',JSON.stringify(item.meta));data.set('thumb',new File([item.thumb],'thumb.webp',{type:'image/webp'}));await api('/upload',{method:'POST',body:data})}else{await sendUpload({file:item.file,title:item.title,siteId:$('#site').value,metadata:item.meta,siteKind:'gallery'})}
  }
  location.href='/sites/'+slug+'/';
 }catch(err){
  error($('#upload'),err);$('#progress').textContent='上传未完成，可以重试。';$('#file').disabled=false;$('#title').disabled=false;button.disabled=false;
 }
}
async function reader(slug){
 const site=siteOf(slug);if(!site)throw Error('未找到这个专题站点，请返回首页');
 const kind=site.kind||'files';
 const id=new URLSearchParams(location.search).get('doc');
 const list=(await api('/documents?site='+encodeURIComponent(slug))).documents;
 if(kind==='gallery')return galleryPage(site,list,id);
 if(kind==='folder')return folderPage(site,list,id);
 return filesPage(site,list,id);
}
function siteCrumb(site,tail){return `<div class="crumb"><a href="/">主站首页</a> / <a href="/sites/${site.slug}/">${esc(site.name)}</a>${tail?' / '+esc(tail):''}</div>`}
function siteHeading(site,extra){return `<div class="page-head"><div><span class="tag">${esc(kindLabel(site.kind))}</span><h1>${esc(site.name)}</h1><p class="smalltext">${esc(site.description||'这个站点还没有填写说明。')}</p></div><div class="page-actions">${extra||''}${user.role==='admin'?'<a class="button secondary" href="/admin/?site='+site.slug+'">上传资料</a>':''}</div></div>`}
async function filesPage(site,list,id){
 if(!id){$('#app').innerHTML=siteCrumb(site)+siteHeading(site)+`<div class="filelist">${list.map(card).join('')||'<p class="muted">这个站点还没有资料。</p>'}</div>`;return}
 const d=list.find(item=>item.id===id);if(!d)throw Error('未找到这份文件，请返回资料列表');
 const crumb=siteCrumb(site,'阅读'),type=d.file_type||'pdf';
 if(type==='txt'||type==='md'){
  const text=await (await fetch('/api/documents/'+d.id+'/file')).text();
  $('#app').innerHTML=crumb+`<div class="page-head"><div><h1>${esc(d.title)}</h1><p class="smalltext">${esc(d.filename)} · ${formatBytes(d.size)}</p></div><div class="page-actions"><a class="button secondary" href="/api/documents/${d.id}/file?download" download>下载原文件</a></div></div>`+`<section class="panel textpanel">${type==='md'?markdownToHtml(text):'<pre class="textfile">'+esc(text)+'</pre>'}</section>`;
  return;
 }
 if(type!=='pdf'){
  $('#app').innerHTML=crumb+`<section class="panel"><span class="tag">${esc((fileTypes[type]||{label:type}).label)} 原文件</span><h1>${esc(d.title)}</h1><p>${esc(d.filename)} · ${formatBytes(d.size)}</p><div class="hintbox">此格式不支持在线预览。请下载后使用 Office 或 WPS 打开，查看原始排版。</div><a class="button" href="/api/documents/${d.id}/file?download" download>下载 ${type.toUpperCase()} 原文件</a></section>`;
  return;
 }
 const mode={bookmarks:'来自 PDF 自带目录',headings:'根据正文标题自动生成，请以原文为准。',scanned:'未提取到文字。此文件可能是扫描件，暂无法生成大纲。'}[d.mode];
 $('#app').innerHTML=crumb+`<div class="page-head"><div><h1>${esc(d.title)}</h1><p class="smalltext">${esc(d.filename)} · ${d.pages} 页</p></div><div class="page-actions"><a class="button secondary" href="/api/documents/${d.id}/file?download" download>下载 PDF</a><a class="button secondary" href="/api/documents/${d.id}/file" target="_blank" rel="noopener">原文阅读 ↗</a></div></div><div class="reader"><aside class="outline"><h2>文档大纲</h2><p>${esc(mode)}</p><div id="outlineItems">${d.outline.map((item,index)=>`<button data-page="${item.page}" data-item="${index}"><span>${esc(item.title)}</span><small>${item.page} 页</small></button>`).join('')||'<p>可使用右侧页码翻阅全文。</p>'}</div></aside><section class="paperarea" aria-label="PDF 阅读器">${viewerMarkup()}</section></div>`;
 const pdf=await loadPdf({url:'/api/documents/'+d.id+'/file'});
 const viewer=mountPdfViewer($('.paperarea'),pdf,page=>document.querySelectorAll('[data-page]').forEach(button=>button.classList.toggle('active',Number(button.dataset.page)===page)));
 document.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>viewer.goTo(button.dataset.page));
}
const audioNames=['mp3','m4a','aac','wav','ogg','oga','flac','opus'];
let activePlayer=null;
function stopPlayer(){if(activePlayer){try{activePlayer.destroy()}catch(error){}activePlayer=null}}
let forcePlay=false;
function openMedia(site,id,force){forcePlay=!!force;const url=new URL(location.href);url.searchParams.set('doc',id);history.replaceState(null,'',url);return reader(site.slug)}
function formatTime(value){let seconds=Number(value)||0;if(!Number.isFinite(seconds)||seconds<0)seconds=0;const total=Math.floor(seconds),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),rest=total%60;return (hours?hours+':'+String(minutes).padStart(2,'0'):String(minutes))+':'+String(rest).padStart(2,'0')}
function mediaKind(item){const type=item.file_type;return imageNames.includes(type)?'image':videoNames.includes(type)?'video':audioNames.includes(type)?'audio':'file'}
function mediaUrl(item){return '/api/documents/'+item.id+'/file'}
function decodable(type){const mime=mediaMime(type);if(!mime)return true;try{return document.createElement(isVideo(type)?'video':'audio').canPlayType(mime)!==''}catch(error){return true}}
function fallbackStage(item,url){const label=String(item.file_type||'').toUpperCase();const icon=isVideo(item.file_type)?'🎬':'♫';return '<div class="audiostage"><div class="audiodisc">'+icon+'</div><strong>'+esc(item.title)+'</strong><span class="muted">'+esc(item.filename)+' · 当前浏览器不能直接解码 '+esc(label)+'，可以下载后用本地播放器打开</span></div>'}
function playlistThumb(item){const kind=mediaKind(item),url=mediaUrl(item);
 if(kind==='image')return `<span class="plthumb"><img src="${thumbUrl(item)}" alt="" loading="lazy" decoding="async"></span>`;
 if(kind==='video'){if(item.meta&&item.meta.thumb)return `<span class="plthumb"><img src="${thumbUrl(item)}" alt="" loading="lazy" decoding="async"><span class="playbadge">▶</span></span>`;if(decodable(item.file_type))return `<span class="plthumb"><video src="${url}" preload="none" muted playsinline></video><span class="playbadge">▶</span></span>`;return `<span class="plthumb">${(item.file_type||'').toUpperCase()}</span>`}
 if(kind==='audio')return `<span class="plthumb audio">♫</span>`;
 return `<span class="plthumb">${(item.file_type||'').toUpperCase()}</span>`}
function playerMarkup(site,list,item){
 const kind=mediaKind(item),url=mediaUrl(item),index=list.findIndex(entry=>entry.id===item.id);
 const original=item.meta&&item.meta.original?item.meta.original:null;
 const playable=forcePlay||kind==='image'||decodable(item.file_type);
 const stage=!playable?fallbackStage(item,url):kind==='video'?`<video id="mediaEl" class="bigmedia" src="${url}" playsinline preload="${netPrefs().videoPreload}"></video>`
  :kind==='audio'?`<div class="audiostage"><div class="audiodisc">♫</div><div class="audioviz" id="audioViz">${Array.from({length:28},(_,i)=>'<i style="height:'+(18+(i%7)*6)+'%"></i>').join('')}</div><strong>${esc(item.title)}</strong><span class="muted">${esc(item.filename)}${item.meta&&item.meta.duration?' · '+formatTime(item.meta.duration):''}</span><audio id="mediaEl" src="${url}" preload="metadata"></audio></div>`
  :`<img id="mediaEl" class="bigmedia zoomable" src="${item.meta&&item.meta.thumb?thumbUrl(item):url}" data-full="${url}" alt="${esc(item.title)}">`;
 const mediaBar=!playable?'<div class="player-bar" id="mediaBar">\n  <button class="pbtn" data-prev title="上一个（←）">⏮</button>\n  <button class="pbtn primary" data-force title="用浏览器原生播放器试一下">▶ 尝试播放</button>\n  <button class="pbtn" data-next title="下一个（→）">⏭</button>\n  <span class="divider"></span>\n  <span class="muted">浏览器无法直接解码这种格式</span>\n  <a class="pbtn" href="${url}?download" download>下载原文件</a>\n </div>':kind==='image'?`<div class="player-bar" id="mediaBar">
   <button class="pbtn" data-prev title="上一张（←）">⏮</button>
   <button class="pbtn" data-slideshow title="自动播放（空格）">▶ 自动播放</button>
   <button class="pbtn" data-next title="下一张（→）">⏭</button>
   <span class="divider"></span>
   <button class="pbtn" data-zoom-out title="缩小（-）">−</button>
   <span class="zoomtext" id="zoomText">适合窗口</span>
   <button class="pbtn" data-zoom-in title="放大（+）">＋</button>
   <button class="pbtn" data-zoom-fit title="适合窗口（0）">1:1</button>
   <button class="pbtn" data-rotate title="旋转（R）">⟳</button>
   <span class="divider"></span>
   <label class="speedlabel">间隔<select data-interval><option value="3">3 秒</option><option value="5" selected>5 秒</option><option value="8">8 秒</option></select></label>
   <span class="divider"></span>
   <button class="pbtn" id="downloadPng" title="在浏览器里转成 PNG 再保存">下载 PNG</button>
   <a class="pbtn" href="${url}?download" download title="下载原始 WEBP">原文件</a>
  </div>`:`<div class="player-bar" id="mediaBar">
   <button class="pbtn" data-prev title="上一个（←）">⏮</button>
   <button class="pbtn primary" data-play title="播放 / 暂停（空格）">▶</button>
   <button class="pbtn" data-next title="下一个（→）">⏭</button>
   <span class="divider"></span>
   <input class="seek" data-seek type="range" min="0" max="1000" value="0" step="1" aria-label="播放进度">
   <span class="ptime" data-time>0:00 / 0:00</span>
   <span class="divider"></span>
   <button class="pbtn" data-mute title="静音（M）">🔊</button>
   <input class="volume" data-volume type="range" min="0" max="100" value="100" step="1" aria-label="音量">
   <label class="speedlabel">倍速<select data-speed><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
   <button class="pbtn" data-loop title="循环播放（L）">🔁</button>
   <button class="pbtn" data-autonext title="播完自动下一个">自动下一个</button>
   ${kind==='video'?'<button class="pbtn" data-pip title="画中画（P）">⧉</button><button class="pbtn" data-full title="全屏（F）">⛶</button>':''}
   <a class="pbtn" href="${url}?download" download>下载</a>
  </div>`;
 const playlist=list.map((entry,position)=>`<button class="plitem${entry.id===item.id?' active':''}" data-id="${entry.id}"><span class="plindex">${position+1}</span>${playlistThumb(entry)}<span class="pltext"><strong>${esc(entry.title)}</strong><span class="muted">${mediaKind(entry)==='audio'?'音频':mediaKind(entry)==='video'?'视频':'图片'}${entry.meta&&entry.meta.duration?' · '+formatTime(entry.meta.duration):''}${entry.meta&&entry.meta.width?' · '+entry.meta.width+'×'+entry.meta.height:''}</span></span></button>`).join('');
 return `<div class="player-layout"><section class="player-stage${kind==='audio'?' isaudio':''}">${stage}<div class="stage-note" id="stageNote"></div></section><aside class="playlist"><div class="playlist-head"><strong>播放列表</strong><span class="muted">${index+1} / ${list.length}</span></div><div class="playlist-items">${playlist}</div></aside></div>${mediaBar}<p class="smalltext player-hint">快捷键：空格 播放/暂停 · ← → 上一个/下一个（音视频为快退/快进 5 秒）· ↑ ↓ 音量 · M 静音 · L 循环 · F 全屏 · P 画中画 · 图片：+ − 缩放、0 适合窗口、R 旋转。</p>`;
}
function mediaPlayer(site,list,item){
 const kind=mediaKind(item),media=$('#mediaEl'),bar=$('#mediaBar'),note=$('#stageNote');
 const preferences=window.__classHubPrefs||{get:()=>true,set:()=>{}};
 const showHints=preferences.get('hints')!==false;
 const hint=document.querySelector('.player-hint');if(hint&&!showHints)hint.hidden=true;
 const destroyers=[];let rotation=0,zoom=1,fit=true,slideshow=null,autonext=preferences.get('autonext')!==false,audioContext=null,raf=0;
 const say=message=>{if(note){note.textContent=message;note.classList.toggle('show',!!message);if(message)setTimeout(()=>{if(note.textContent===message)note.classList.remove('show')},3200)}};
 const go=delta=>{const index=list.findIndex(entry=>entry.id===item.id);const next=list[(index+delta+list.length)%list.length];if(next)openMedia(site,next.id)};
 const open=id=>openMedia(site,id);
 // 播放列表
 document.querySelectorAll('.plitem').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.id!==item.id)open(button.dataset.id)}));
 if(!media){
  const force=bar&&bar.querySelector('[data-force]'),prev=bar&&bar.querySelector('[data-prev]'),next=bar&&bar.querySelector('[data-next]');
  if(force)force.onclick=()=>openMedia(site,item.id,true);
  if(prev)prev.onclick=()=>go(-1);
  if(next)next.onclick=()=>go(1);
  return {destroy(){}};
 }
 // 图片：缩放 / 旋转 / 轮播
 if(kind==='image'){
  const apply=()=>{if(!media)return;const scale=fit?'1':String(zoom);media.style.transform='scale('+scale+') rotate('+rotation+'deg)';media.style.transformOrigin='center center';const text=$('#zoomText');if(text)text.textContent=fit?'适合窗口':Math.round(zoom*100)+'%'};
  const zoomBy=factor=>{fit=false;zoom=Math.max(0.2,Math.min(6,zoom*factor));apply()};
  bar.querySelector('[data-zoom-in]').onclick=()=>zoomBy(1.25);
  bar.querySelector('[data-zoom-out]').onclick=()=>zoomBy(0.8);
  bar.querySelector('[data-zoom-fit]').onclick=()=>{fit=!fit;if(!fit)zoom=1;apply()};
  bar.querySelector('[data-rotate]').onclick=()=>{rotation=(rotation+90)%360;apply()};
  const slideshowButton=bar.querySelector('[data-slideshow]');
  const startSlideshow=()=>{stopSlideshow();const interval=Number(bar.querySelector('[data-interval]').value)||5;slideshowButton.textContent='⏸ 暂停轮播';slideshow=setInterval(()=>go(1),interval*1000)};
  const stopSlideshow=()=>{if(slideshow)clearInterval(slideshow);slideshow=null;slideshowButton.textContent='▶ 自动播放'};
  slideshowButton.onclick=()=>slideshow?stopSlideshow():startSlideshow();
  destroyers.push(stopSlideshow);
  $('#downloadPng').onclick=async()=>{const button=$('#downloadPng');const text=button.textContent;button.disabled=true;button.textContent='正在转 PNG…';try{saveBlob(await imageToPngBlob(mediaUrl(item)),stripExtension(item.filename||item.title)+'.png')}catch(error){say(error.message)}finally{button.disabled=false;button.textContent=text}};
  const full=media&&media.dataset.full;
  if(full&&media.getAttribute("src")!==full){
   const size=Number(item.size)||0,limit=Number(netPrefs().autoFullImage)||0;
   const loadFull=()=>{const image=new Image();image.onload=()=>{if(media)media.src=image.src};image.src=full};
   if(limit&&size>limit){
    const button=document.createElement("button");button.className="pbtn";button.type="button";button.dataset.loadFull="1";button.textContent="加载原图（"+formatBytes(size)+"）";button.title="省流模式：原图 "+formatBytes(size)+"，需要时再下载";
    const bar=$("#mediaBar");if(bar)bar.insertBefore(button,bar.querySelector("#downloadPng"));
    button.onclick=()=>{button.disabled=true;button.textContent="正在加载原图…";loadFull();say("正在加载原图 "+formatBytes(size)+"，请稍候")};
    say("省流模式：先显示缩略图（原图 "+formatBytes(size)+"），需要时点“加载原图”");
   }else{loadFull()}
  }
  apply();
 }else{
  // 音视频
  const playButton=bar.querySelector('[data-play]'),seek=bar.querySelector('[data-seek]'),time=bar.querySelector('[data-time]'),volume=bar.querySelector('[data-volume]'),muteButton=bar.querySelector('[data-mute]'),speed=bar.querySelector('[data-speed]'),loopButton=bar.querySelector('[data-loop]'),autoButton=bar.querySelector('[data-autonext]');
  const paint=()=>{const duration=Number.isFinite(media.duration)?media.duration:0;time.textContent=formatTime(media.currentTime)+' / '+formatTime(duration);seek.value=duration?String(Math.round(media.currentTime/duration*1000)):'0'};
  const setPlayIcon=()=>{playButton.textContent=media.paused?'▶':'⏸'};
  playButton.onclick=()=>{if(media.paused)media.play().catch(error=>say('浏览器阻止了自动播放，点一下播放按钮即可'));else media.pause()};
  media.addEventListener('play',setPlayIcon);media.addEventListener('pause',setPlayIcon);
  media.addEventListener('timeupdate',paint);media.addEventListener('loadedmetadata',paint);media.addEventListener('durationchange',paint);
  media.addEventListener('ended',()=>{if(autonext)go(1)});
  media.addEventListener('error',()=>{const link='<a href="'+mediaUrl(item)+'?download" download>下载原文件</a>';if(note){note.innerHTML='这个媒体文件无法播放，可以 '+link+'，或换一个浏览器试试';note.classList.add('show')}else say('这个媒体文件无法播放，请下载后本地打开')});
  seek.addEventListener('input',()=>{const duration=Number.isFinite(media.duration)?media.duration:0;if(duration)media.currentTime=Number(seek.value)/1000*duration});
  volume.addEventListener('input',()=>{media.volume=Number(volume.value)/100;media.muted=media.volume===0});
  muteButton.onclick=()=>{media.muted=!media.muted;muteButton.textContent=media.muted?'🔇':'🔊'};
  speed.onchange=()=>{media.playbackRate=Number(speed.value)};
  loopButton.onclick=()=>{media.loop=!media.loop;loopButton.classList.toggle('on',media.loop)};
  autoButton.onclick=()=>{autonext=!autonext;autoButton.classList.toggle('on',autonext);preferences.set('autonext',autonext)};
  autoButton.classList.toggle('on',autonext);
  media.volume=1;paint();setPlayIcon();
  if(preferences.get('autoplay')!==false)media.play().catch(()=>{});else say('已按偏好停在开始位置，点播放即可');
  if(bar.querySelector('[data-pip]'))bar.querySelector('[data-pip]').onclick=async()=>{try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else await media.requestPictureInPicture()}catch(error){say('这个浏览器不支持画中画')}};
  if(bar.querySelector('[data-full]'))bar.querySelector('[data-full]').onclick=()=>{const stage=document.querySelector('.player-stage');if(document.fullscreenElement)document.exitFullscreen();else (stage.requestFullscreen?stage.requestFullscreen():media.webkitEnterFullscreen&&media.webkitEnterFullscreen())};
  // 音频可视化（可选，失败不影响播放）
  if(kind==='audio'&&netPrefs().visualizer&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   try{
    const Context=window.AudioContext||window.webkitAudioContext;
    if(Context){
     audioContext=new Context();
     const source=audioContext.createMediaElementSource(media),analyser=audioContext.createAnalyser();
     analyser.fftSize=64;source.connect(analyser);analyser.connect(audioContext.destination);
     const bins=document.querySelectorAll('#audioViz i'),values=new Uint8Array(analyser.frequencyBinCount);
     const draw=()=>{analyser.getByteFrequencyData(values);bins.forEach((bar,index)=>{bar.style.height=Math.max(8,Math.round(values[index%bins.length]/255*100))+'%'});raf=requestAnimationFrame(draw)};
     draw();
    }
   }catch(error){audioContext=null}
  }
 }
 const onKey=event=>{const tag=(event.target&&event.target.tagName||'').toLowerCase();if(['input','select','textarea'].includes(tag))return;
  const key=event.key;
  if(key===' '){event.preventDefault();if(kind==='image'){const button=bar.querySelector('[data-slideshow]');button&&button.click()}else{const button=bar.querySelector('[data-play]');button&&button.click()}return}
  if(key==='ArrowLeft'){if(kind!=='image'&&media){media.currentTime=Math.max(0,media.currentTime-5);return}go(-1);return}
  if(key==='ArrowRight'){if(kind!=='image'&&media){media.currentTime=Math.min(media.duration||0,media.currentTime+5);return}go(1);return}
  if(key==='ArrowUp'&&kind!=='image'&&media){media.volume=Math.min(1,media.volume+0.1);const slider=bar.querySelector('[data-volume]');if(slider)slider.value=String(Math.round(media.volume*100));return}
  if(key==='ArrowDown'&&kind!=='image'&&media){media.volume=Math.max(0,media.volume-0.1);const slider=bar.querySelector('[data-volume]');if(slider)slider.value=String(Math.round(media.volume*100));return}
  if(key==='m'||key==='M'){const button=bar.querySelector('[data-mute]');button&&button.click();return}
  if(key==='l'||key==='L'){const button=bar.querySelector('[data-loop]');button&&button.click();return}
  if(key==='f'||key==='F'){const button=bar.querySelector('[data-full]');button&&button.click();return}
  if(key==='p'||key==='P'){const button=bar.querySelector('[data-pip]');button&&button.click();return}
  if(kind==='image'){
   if(key==='+'||key==='='){bar.querySelector('[data-zoom-in]').click()}
   if(key==='-'||key==='_'){bar.querySelector('[data-zoom-out]').click()}
   if(key==='0'){bar.querySelector('[data-zoom-fit]').click()}
   if(key==='r'||key==='R'){bar.querySelector('[data-rotate]').click()}
  }};
 window.addEventListener('keydown',onKey);destroyers.push(()=>window.removeEventListener('keydown',onKey));
 return {destroy(){destroyers.forEach(fn=>{try{fn()}catch(error){}});if(raf)cancelAnimationFrame(raf);if(media){try{media.pause();media.removeAttribute('src');media.load&&media.load()}catch(error){}}if(audioContext){try{audioContext.close()}catch(error){}}}};
}
async function galleryPage(site,list,id){
 const counts={image:0,video:0,audio:0};list.forEach(item=>{const kind=mediaKind(item);if(counts[kind]!==undefined)counts[kind]++});
 if(!id){
  const tiles=list.map(item=>{const kind=mediaKind(item),url=mediaUrl(item);
   return `<a class="tile${kind==='video'?' isvideo':kind==='audio'?' isaudio':''}" href="/sites/${site.slug}/?doc=${encodeURIComponent(item.id)}" title="${esc(item.title)}"><span class="tilemedia">${kind==='image'?'<img src="'+thumbUrl(item)+'" alt="'+esc(item.title)+'" loading="lazy" decoding="async">':kind==='video'?(item.meta&&item.meta.thumb?'<img src="'+thumbUrl(item)+'" alt="'+esc(item.title)+'" loading="lazy" decoding="async"><span class="playbadge">▶</span>':decodable(item.file_type)?'<video src="'+url+'" preload="none" muted playsinline></video><span class="playbadge">▶</span>':'<span class="audiotile">🎬</span><span class="playbadge">▶</span>'):'<span class="audiotile">♫</span><span class="playbadge">▶</span>'}</span><span class="tilemeta"><strong>${esc(item.title)}</strong><span class="muted">${item.file_type.toUpperCase()}${item.meta&&item.meta.width?' · '+item.meta.width+'×'+item.meta.height:''}${item.meta&&item.meta.duration?' · '+formatTime(item.meta.duration):''} · ${formatBytes(item.size)}</span></span></a>`}).join('');
  $('#app').innerHTML=siteCrumb(site)+siteHeading(site,`<span class="muted">${counts.image} 张图片 · ${counts.video} 个视频 · ${counts.audio} 段音频</span>`)+`<div class="tilegrid">${tiles||'<p class="muted">这个媒体库还没有内容。</p>'}</div>`;
  return;
 }
 const item=list.find(entry=>entry.id===id);if(!item)throw Error('未找到这份文件，请返回媒体库');
 stopPlayer();
 const detail=`${item.meta&&item.meta.width?'<span class="muted">'+item.meta.width+'×'+item.meta.height+'</span>':''}${item.meta&&item.meta.duration?'<span class="muted">'+formatTime(item.meta.duration)+'</span>':''}<span class="muted">${formatBytes(item.size)}</span>${item.meta&&item.meta.original&&item.meta.original.type?'<span class="muted">原格式 '+esc(String(item.meta.original.type).toUpperCase())+'</span>':''}`;
 $('#app').innerHTML=siteCrumb(site,'播放')+`<div class="page-head"><div><span class="tag">${esc(kindLabel(site.kind))}</span><h1>${esc(item.title)}</h1><p class="smalltext">${esc(item.filename)} ${detail}</p></div></div>`+playerMarkup(site,list,item);
 activePlayer=mediaPlayer(site,list,item);
}
async function folderPage(site,list,id){
 if(!id){
  $('#app').innerHTML=siteCrumb(site)+siteHeading(site)+`<div class="filelist">${list.map(card).join('')||'<p class="muted">这个文件夹站点还没有上传压缩包。</p>'}</div>`;
  return;
 }
 const item=list.find(entry=>entry.id===id);if(!item)throw Error('未找到这个压缩包，请返回列表');
 const entries=(item.entries||[]).filter(entry=>!entry.directory),tree=new Map();
 for(const entry of entries){const parts=entry.name.split('/'),file=parts.pop(),folder=parts.join('/');if(!tree.has(folder))tree.set(folder,[]);tree.get(folder).push({...entry,file})}
 const groups=[...tree.entries()].sort((a,b)=>a[0]<b[0]?-1:1).map(([folder,items])=>`<div class="foldergroup"><div class="folderhead"><strong>${folder?esc(folder):'压缩包根目录'}</strong><span class="muted">${items.length} 个文件</span></div><ul class="entrylist">${items.sort((a,b)=>a.file<b.file?-1:1).map(entry=>`<li><button class="entry" data-name="${esc(entry.name)}"><span class="entryname">${esc(entry.file)}</span><span class="muted">${formatBytes(entry.size)}${entry.method===0?'':' · 压缩'}</span></button></li>`).join('')}</ul></div>`).join('');
 $('#app').innerHTML=siteCrumb(site,'浏览')+`<div class="page-head"><div><h1>${esc(item.title)}</h1><p class="smalltext">${esc(item.filename)} · 内含 ${entries.length} 个文件 · ${formatBytes(item.size)}</p></div><div class="page-actions"><a class="button" href="/api/documents/${item.id}/file?download" download>下载整个压缩包</a></div></div>${groups||'<p class="muted">这个压缩包是空的。</p>'}<div id="entryView"></div>`;
 $('#app').querySelectorAll('.entry').forEach(button=>button.onclick=()=>openEntry(item,entries.find(entry=>entry.name===button.dataset.name),button));
}
async function openEntry(item,entry,button){
 const box=$('#entryView');if(!entry)return;
 box.innerHTML='<section class="panel spaced"><p class="progress">正在从压缩包中读取 '+esc(baseName(entry.name))+'…</p></section>';
 try{
  const bytes=await zipData(item),data=await readZipEntry(bytes,entry),name=baseName(entry.name);
  if(imageEntry(name)){
   const blob=new Blob([data],{type:'image/'+name.split('.').pop().toLowerCase()}),url=URL.createObjectURL(blob);
   box.innerHTML=`<section class="panel spaced"><div class="page-head"><div><h2>${esc(name)}</h2><p class="smalltext">${formatBytes(entry.size)}</p></div><div class="page-actions"><button class="button" id="entrySave">下载这个文件</button></div></div><img class="bigmedia" src="${url}" alt="${esc(name)}" loading="lazy" decoding="async"></section>`;
   $('#entrySave').onclick=()=>saveBlob(blob,name);
   return;
  }
  if(textLikeEntry(name)){
   const text=new TextDecoder('utf-8').decode(data);
   box.innerHTML=`<section class="panel spaced"><div class="page-head"><div><h2>${esc(name)}</h2><p class="smalltext">${formatBytes(entry.size)}</p></div><div class="page-actions"><button class="button" id="entrySave">下载这个文件</button></div></div><pre class="textfile">${esc(text.slice(0,200000))}</pre>${text.length>200000?'<p class="smalltext">内容较长，只显示前 200000 个字符。</p>':''}</section>`;
   $('#entrySave').onclick=()=>saveBlob(new Blob([data],{type:'application/octet-stream'}),name);
   return;
  }
  box.innerHTML=`<section class="panel spaced"><h2>${esc(name)}</h2><p class="smalltext">${formatBytes(entry.size)} · 这个格式不能在线预览，可以直接下载。</p><button class="button" id="entrySave">下载这个文件</button></section>`;
  $('#entrySave').onclick=()=>saveBlob(new Blob([data],{type:'application/octet-stream'}),name);
 }catch(error){
  box.innerHTML=`<section class="panel spaced"><h2>无法读取这个文件</h2><p class="smalltext">${esc(error.message)}（加密的压缩包无法在线浏览，请下载后打开）</p><a class="button secondary" href="/api/documents/${item.id}/file?download" download>下载整个压缩包</a></section>`;
 }
}
let chatRooms=[],chatRoom='',chatMessages=[],chatTimer=0,chatSeen=0,chatBadgeTimer=0,chatFile=null,chatConfig={chatRecall:10};
const chatPollMs=()=>netPrefs().prefetch?4000:10000;
const chatTime=value=>{const date=new Date(Number(value)||0),now=new Date();const sameDay=date.toDateString()===now.toDateString();const clock=String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');return sameDay?clock:(date.getMonth()+1)+'月'+date.getDate()+'日 '+clock};
const chatMuted=kind=>kind==='group'?!!(user&&user.muteGroup):!!(user&&user.muteDirect);
const chatRoomKind=room=>{const found=chatRooms.find(item=>item.room===room);return found?found.kind:'group'};
function chatMarkup(text){let html=esc(text);const people=[...(chatRooms.map(room=>room.kind==='direct'?room.title:'')),'所有人'].filter(Boolean);for(const name of people){const token=esc('@'+name);if(!token||token==='@')continue;html=html.split(token).join('<mark class="chat-mention">'+token+'</mark>')}return html}
function chatAttachmentMarkup(message){const attachment=message.attachment;if(!attachment)return '';const url='/api/chat/attachments/'+encodeURIComponent(message.id);if(attachment.inline&&/^(jpg|jpeg|png|gif|webp|bmp|avif)$/.test(attachment.type))return '<a class="chat-image" href="'+url+'" target="_blank" rel="noopener"><img src="'+url+'" alt="'+esc(attachment.name)+'" loading="lazy" decoding="async"></a>';if(attachment.inline&&/^(mp4|m4v|mov|webm)$/.test(attachment.type))return '<video class="chat-video" src="'+url+'" controls preload="'+netPrefs().videoPreload+'"></video>';if(attachment.inline&&/^(mp3|m4a|aac|wav|ogg|oga|flac|opus)$/.test(attachment.type))return '<audio class="chat-audio" src="'+url+'" controls preload="none"></audio>';return '<a class="chat-file" href="'+url+'" download><span class="chat-file-icon">📄</span><span><strong>'+esc(attachment.name)+'</strong><small>'+formatBytes(attachment.size)+' · 点击下载</small></span></a>'}
function chatBubble(message){const mine=message.mine;const recallWindow=Number(chatConfig.chatRecall)||0;const canRecall=mine&&(can('accounts')||!recallWindow||Date.now()-message.created<=recallWindow*60000);const showDelete=canRecall||(!mine&&can('accounts'));return '<article class="chat-msg'+(mine?' mine':'')+(message.mentions&&message.mentions.length?' has-mention':'')+'" data-id="'+esc(message.id)+'"><header><strong>'+esc(mine?'我':message.senderName||'同学')+'</strong><time>'+chatTime(message.created)+'</time>'+(showDelete?'<button type="button" class="chat-del" data-del="'+esc(message.id)+'" title="'+(mine?'撤回这条消息':'删除这条消息')+'">✕</button>':'')+'</header>'+(message.body?'<p>'+chatMarkup(message.body)+'</p>':'')+chatAttachmentMarkup(message)+'</article>'}
function renderChatRooms(){const box=$('#chatRooms');if(!box)return;box.innerHTML=chatRooms.map(chatRoomRow).join('');box.querySelectorAll('.chat-room').forEach(button=>button.onclick=()=>openChatRoom(button.dataset.room))}
function chatRoomRow(room){const active=room.room===chatRoom;const muted=chatMuted(room.kind);const preview=room.last?(room.last.mine?'我：':'')+room.last.body:room.kind==='group'?'还没有人发言，来说第一句吧':'还没有聊天记录';const badge=room.mentions?'<span class="chat-unread chat-mention-badge">@'+(room.mentions>9?'9+':room.mentions)+'</span>':room.unread?'<span class="chat-unread">'+(room.unread>99?'99+':room.unread)+'</span>':'';return '<button type="button" class="chat-room'+(active?' active':'')+(room.mentions?' has-mention':'')+'" data-room="'+esc(room.room)+'"><span class="chat-room-top"><strong>'+esc(room.title)+(muted?' 🔇':'')+'</strong><span class="muted">'+(room.last?chatTime(room.last.created):'')+'</span></span><span class="chat-room-note">'+esc(room.note||'')+'</span><span class="chat-room-last">'+esc(preview.slice(0,40))+'</span>'+badge+'</button>'}
function renderChatThread(){const box=$('#chatThread');if(!box)return;const room=chatRooms.find(item=>item.room===chatRoom);$('#chatTitle').textContent=room?room.title:'聊天';$('#chatNote').textContent=room?(room.kind==='group'?room.note:'一对一私聊 · '+room.note):'';const muted=chatMuted(room?room.kind:'group');const banner=$('#chatMuted');if(banner){banner.hidden=!muted;banner.textContent='你已被管理员禁言，暂时不能在'+(room&&room.kind==='direct'?'私聊':'班级大群')+'里发言'}const input=$('#chatInput'),send=$('#chatSend');if(input){input.disabled=muted;input.placeholder=muted?'已被禁言，暂时不能发言':'输入消息，Enter 发送，Shift+Enter 换行，@ 可以提醒同学'}if(send)send.disabled=muted;box.innerHTML=(chatMessages.length?'<div class="chat-more"><button type="button" class="pbtn" id="chatMore">加载更早的消息</button></div>':'<p class="muted chat-empty">这里还没有消息。</p>')+chatMessages.map(chatBubble).join('');const more=$('#chatMore');if(more)more.onclick=()=>loadChatMessages({before:chatMessages[0]&&chatMessages[0].created});box.querySelectorAll('[data-del]').forEach(button=>button.onclick=async()=>{const mine=(chatMessages.find(item=>item.id===button.dataset.del)||{}).mine;if(!confirm(mine?'撤回这条消息？':'删除这条消息？'))return;try{await api('/chat/messages/'+button.dataset.del,{method:'DELETE'});chatMessages=chatMessages.filter(item=>item.id!==button.dataset.del);renderChatThread();toast(mine?'消息已撤回':'消息已删除')}catch(error){toast(error.message)}})}
function chatScrollToEnd(smooth){const box=$('#chatThread');if(!box)return;box.scrollTop=box.scrollHeight;if(smooth)box.scrollTo({top:box.scrollHeight,behavior:'smooth'})}
async function loadChatMessages(options={}){const query=['room='+encodeURIComponent(chatRoom)];if(options.after)query.push('after='+options.after);if(options.before)query.push('before='+options.before);const data=await api('/chat/messages?'+query.join('&'));const list=data.messages||[];if(options.after){const known=new Set(chatMessages.map(item=>item.id));const fresh=list.filter(item=>!known.has(item.id));if(fresh.length){const box=$('#chatThread');const nearBottom=!box||box.scrollHeight-box.scrollTop-box.clientHeight<160;chatMessages=chatMessages.concat(fresh);renderChatThread();if(nearBottom)chatScrollToEnd(true)}}else if(options.before){const known=new Set(chatMessages.map(item=>item.id));chatMessages=list.filter(item=>!known.has(item.id)).concat(chatMessages);renderChatThread()}else{chatMessages=list;renderChatThread();chatScrollToEnd(false)}if(chatMessages.length)chatSeen=chatMessages[chatMessages.length-1].created;return data}
async function markChatRead(){if(!chatRoom||!chatSeen)return;try{await api('/chat/read',{method:'POST',body:JSON.stringify({room:chatRoom,at:chatSeen})});const room=chatRooms.find(item=>item.room===chatRoom);if(room){room.unread=0;room.mentions=0}renderChatRooms();refreshChatBadge()}catch(error){}}
async function openChatRoom(room){chatRoom=room;chatMessages=[];chatSeen=0;const url=new URL(location.href);url.searchParams.set('room',room);history.replaceState(null,'',url);renderChatThread();try{await loadChatMessages()}catch(error){toast(error.message);return}renderChatRooms();markChatRead();chatScrollToEnd(false)}
function chatSuggestMentions(){const box=$('#chatMentions'),input=$('#chatInput');if(!box||!input)return;const value=input.value,at=value.lastIndexOf('@');if(at<0){box.hidden=true;return}const query=value.slice(at+1);if(query.length>12||/\s/.test(query)){box.hidden=true;return}const names=chatRooms.filter(room=>room.kind==='direct').map(room=>room.title).filter(name=>name&&(!query||name.indexOf(query)>=0)).slice(0,6);if(!names.length){box.hidden=true;return}box.innerHTML=names.map(name=>'<button type="button" class="chat-mention-option" data-name="'+esc(name)+'">@'+esc(name)+'</button>').join('');box.hidden=false;box.querySelectorAll('button').forEach(button=>button.onclick=()=>{input.value=value.slice(0,at)+'@'+button.dataset.name+' ';box.hidden=true;input.focus()})}
function wireChatComposer(){const form=$('#chatForm');if(!form)return;const input=$('#chatInput'),picker=$('#chatFile'),chip=$('#chatFileChip');input.addEventListener('input',()=>{chatSuggestMentions();input.style.height='auto';input.style.height=Math.min(140,input.scrollHeight)+'px'});input.addEventListener('keydown',event=>{const box=$('#chatMentions');if(event.key==='Enter'&&!event.shiftKey&&box&&!box.hidden&&box.querySelector('button')){event.preventDefault();box.querySelector('button').click();return}if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();form.requestSubmit()}if(event.key==='Escape'&&box)box.hidden=true});picker.addEventListener('change',()=>{const file=picker.files&&picker.files[0];if(!file)return;if(file.size>10*1024*1024){toast('附件最大 10 MB');picker.value='';return}chatFile=file;chip.hidden=false;chip.innerHTML='<span>📎 '+esc(file.name)+' · '+formatBytes(file.size)+'</span><button type="button" id="chatFileClear" title="取消附件">✕</button>';$('#chatFileClear').onclick=()=>{chatFile=null;picker.value='';chip.hidden=true;chip.innerHTML=''}});form.addEventListener('submit',async event=>{event.preventDefault();if(chatMuted(chatRoomKind(chatRoom)))return;const text=input.value.trim();if(!text&&!chatFile)return;const file=chatFile;input.value='';input.style.height='';if(chip){chip.hidden=true;chip.innerHTML=''}chatFile=null;if(picker)picker.value='';try{let result;if(file){const data=new FormData();data.set('room',chatRoom);data.set('body',text);data.set('file',file);result=await api('/chat/messages',{method:'POST',body:data})}else result=await api('/chat/messages',{method:'POST',body:JSON.stringify({room:chatRoom,body:text})});chatMessages.push(result.message);chatSeen=result.message.created;renderChatThread();chatScrollToEnd(true);const room=chatRooms.find(item=>item.room===chatRoom);if(room){room.last={body:result.message.body||(result.message.attachment?'[附件] '+result.message.attachment.name:''),created:result.message.created,mine:true};room.total=(room.total||0)+1;renderChatRooms()}}catch(error){input.value=text;toast(error.message)}})}
async function refreshChatRooms(){try{const data=await api('/chat/rooms');chatRooms=data.rooms||[];renderChatRooms()}catch(error){}}
async function chatPage(){stopPlayer();chatRooms=[];chatMessages=[];chatFile=null;chatRoom=new URLSearchParams(location.search).get('room')||'class';$('#app').innerHTML='<div class="layout-page"><div class="page-head"><div><span class="tag">聊天</span><h1>班级聊天</h1><p class="smalltext">班级大群所有人都能看到；单独点一位同学就是你们之间的私聊。输入 @ 可以提醒某位同学。</p></div><div class="page-actions"><a class="button secondary" href="/">返回主站</a><button class="button secondary" type="button" id="chatRefresh">刷新</button></div></div><div class="chat-layout"><aside class="chat-rooms" id="chatRooms">正在加载…</aside><section class="chat-panel"><header class="chat-head"><div><h2 id="chatTitle">班级大群</h2><p class="smalltext" id="chatNote"></p></div></header><p class="chat-muted" id="chatMuted" hidden></p><div class="chat-thread" id="chatThread"><p class="muted">正在加载消息…</p></div><div class="chat-mentions" id="chatMentions" hidden></div><form class="chat-composer" id="chatForm"><button class="pbtn" type="button" id="chatPick" title="发送图片或文件">📎</button><input id="chatFile" type="file" hidden><textarea id="chatInput" rows="1" maxlength="500" placeholder="输入消息，Enter 发送，Shift+Enter 换行，@ 可以提醒同学"></textarea><button class="button" type="submit" id="chatSend">发送</button></form><p class="smalltext" id="chatFileChip" hidden></p></section></div></div>';$('#chatPick').onclick=()=>$('#chatFile').click();const config=await api('/settings');if(config&&config.settings)chatConfig=config.settings;const data=await api('/chat/rooms');chatRooms=data.rooms||[];if(!chatRooms.some(room=>room.room===chatRoom))chatRoom=chatRooms[0]?chatRooms[0].room:'class';renderChatRooms();renderChatThread();wireChatComposer();$('#chatRefresh').onclick=()=>{refreshChatRooms().then(()=>loadChatMessages({after:chatSeen})).then(()=>toast('已刷新')).catch(()=>{})};await openChatRoom(chatRoom);if(chatTimer)clearInterval(chatTimer);chatTimer=setInterval(()=>{if(!document.hidden&&chatRoom)loadChatMessages({after:chatSeen}).then(()=>markChatRead()).catch(()=>{})},chatPollMs());refreshChatBadge()}
async function refreshChatBadge(){if(!user||user.mustChange)return;try{const data=await api('/chat/unread');const badge=$('#chatBadge');if(!badge)return;const total=(data.unread||0)+(data.mentions||0)*0;badge.textContent=data.unread>99?'99+':String(data.unread);badge.hidden=!data.unread;badge.title=data.mentions?('有 '+data.mentions+' 条 @ 你的消息'):'';badge.classList.toggle('has-mention',!!data.mentions)}catch(error){}}
function startChatWatch(){if(chatBadgeTimer)clearInterval(chatBadgeTimer);refreshChatBadge();chatBadgeTimer=setInterval(()=>{if(!document.hidden)refreshChatBadge()},netPrefs().prefetch?30000:60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshChatBadge()})}
async function admin(){if(!canAny())throw Error('当前账户没有管理权限，请联系管理员');$('#app').innerHTML=`<div class="layout-page"><div class="page-head"><div><span class="tag">管理后台</span><h1>资料与账户管理</h1><p class="smalltext">上传资料、管理站点与账户，维护课程表、日历与自定义事件。</p></div><div class="page-actions"><a class="button secondary" href="/">返回主站</a><a class="button secondary" href="/timetable/">查看课程表</a><div class="page-actions"><a class="button secondary" href="/calendar/">查看日历</a>${can('courses')?'<a class="button secondary" href="/admin/?tab=courses">编辑课程表</a>':''}</div></div></div><div class="tabs" id="adminTabs"><button class="tab active" type="button" data-tab="data">资料与账户</button><button class="tab" type="button" data-tab="sites">站点管理</button><button class="tab" type="button" data-tab="courses">课程表</button><button class="tab" type="button" data-tab="calendar">日历与事件</button></div><div class="tab-panel active" data-panel="data"><div class="admin-grid"><section class="panel" id="uploadPanel"><h2>上传资料</h2><p class="smalltext">PDF 可预览并自动生成大纲；Word、Excel、PowerPoint 原文件支持保存和下载。</p><form id="upload"><label for="title">文档标题</label><input name="title" id="title" required maxlength="150"><label for="site">所属站点</label><select id="site" name="siteId" required></select><label for="file">文件（视频最大 200 MB，图片与文档最大 20 MB，PDF 最多 500 页）</label><input name="file" id="file" type="file" required><p class="smalltext" id="uploadHint"></p><p class="progress" id="progress" role="status"></p><div id="outlinePreview"></div><div id="uploadReader" class="upload-reader" hidden></div><label id="confirmLabel" class="confirm-layout" hidden><input type="checkbox" id="confirmLayout">我已检查页面显示与文件内容</label><div class="error" role="alert"></div><button class="button" type="submit" disabled>上传并保存</button></form></section><section class="panel" id="createUserPanel"><h2>创建班级账户</h2><p class="smalltext">可以先建用户组再选组，也可以不选组、直接勾选权限；管理员拥有全部权限。</p><form id="createUser"><div class="formgrid"><div><label for="uname">账号</label><input id="uname" name="username" pattern="[a-zA-Z0-9_.-]{3,32}" required autocomplete="off" placeholder="如 student01"></div><div><label for="name">姓名</label><input id="name" name="name" required maxlength="50"></div></div><label for="tempPassword">初始密码（至少 12 个字符）</label><input id="tempPassword" name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"><label for="ugroup">用户组</label><select id="ugroup" name="groupId"><option value="">不使用用户组（手动指定权限）</option></select><div id="uperms" class="permgrid"></div><label class="switch-line"><input type="checkbox" id="uisadmin"> 设为管理员（拥有全部权限）</label><div class="error" role="alert"></div><button class="button" type="submit">创建账户</button></form></section></div><section class="panel" id="usersPanel"><h2>账户与权限</h2><p class="smalltext">停用、重置密码、改权限或换用户组后，该账户的现有登录会立即失效。</p><div id="users" class="tablewrap">正在加载…</div></section><section class="panel spaced" id="groupsPanel"><h2>用户组</h2><p class="smalltext">把常用权限组合成组，新建账户时直接选组；修改组的权限会同步给组内所有成员。</p><form id="createGroup"><div class="formgrid"><div><label for="gname">组名</label><input id="gname" name="name" required maxlength="30" placeholder="如：宣传组"></div><div><label for="gnote">说明（可选）</label><input id="gnote" name="note" maxlength="80" placeholder="如：负责上传活动照片"></div></div><div id="gperms" class="permgrid"></div><div class="error" role="alert"></div><button class="button" type="submit">新建用户组</button></form><div id="groups" class="tablewrap">正在加载…</div></section></div><section class="panel spaced" id="brandPanel"><h2>网站信息</h2><p class="smalltext">学校与班级名称会同步显示在页头、登录页、浏览器标题与页脚。</p><form id="brandForm"><div class="formgrid"><div><label for="brandSchool">学校名称</label><input id="brandSchool" name="school" maxlength="40" placeholder="如：第三中学"></div><div><label for="brandClass">班级名称</label><input id="brandClass" name="className" maxlength="30" placeholder="如：2028届1班"></div><div><label for="brandSubtitle">网站副标题</label><input id="brandSubtitle" name="subtitle" maxlength="30" placeholder="如：信息资源共享网站"></div></div><div class="error" role="alert"></div><button class="button" type="submit">保存网站信息</button></form></section><section class="panel spaced" id="chatPanel"><h2>聊天设置</h2><p class="smalltext">撤回时限内同学可以撤回自己发的消息，超过时限只有管理员能删除；自动清理会定期删除更早的消息和附件。</p><form id="chatSettings"><div class="formgrid"><div><label for="chatRecall">撤回时限（分钟，0 表示不允许撤回）</label><input id="chatRecall" name="chatRecall" type="number" min="0" max="1440" required></div><div><label for="chatRetention">历史消息保存天数（0 表示永久保留）</label><input id="chatRetention" name="chatRetention" type="number" min="0" max="3650" required></div><div><label for="chatCleanupHours">手动清理：删除多少小时前的消息</label><input id="chatCleanupHours" type="number" min="1" max="8760" value="24"></div></div><div class="error" role="alert"></div><div class="page-actions"><button class="button" type="submit">保存聊天设置</button><button class="button secondary" type="button" id="chatCleanup">立即清理过期消息</button></div></form></section><div class="tab-panel" data-panel="sites" id="panelSites"><section class="panel"><h2>专题站点</h2><p class="smalltext">成员在主站首页看到全部站点；每个站点的资料彼此独立。</p><form id="createSite"><div class="formgrid"><div><label for="siteName">站点名称</label><input id="siteName" name="name" required maxlength="50" placeholder="如 研学活动"></div><div><label for="siteKind">站点类型</label><select id="siteKind" name="kind"><option value="files">文件站点 · PDF/Office/文本</option><option value="folder">文件夹站点 · ZIP 压缩包</option><option value="gallery">图册站点 · 图片/视频</option></select></div><div><label for="siteSlug">访问路径</label><input id="siteSlug" name="slug" pattern="[a-z0-9][a-z0-9-]{1,31}" required autocomplete="off" placeholder="如 activity"></div></div><label for="siteDesc">一句话说明（可选）</label><input id="siteDesc" name="description" maxlength="120" placeholder="如：2028届1班研学活动资料"><div class="error" role="alert"></div><button class="button" type="submit">创建站点</button></form><div id="sites" class="tablewrap">正在加载…</div></section></div><div class="tab-panel" data-panel="courses" id="panelCourses"><p class="smalltext">正在载入课程表…</p></div><div class="tab-panel" data-panel="calendar" id="panelCalendar"><p class="smalltext">正在载入日历设置…</p></div><dialog id="editGroupDialog"><h2>编辑用户组</h2><form id="editGroupForm"><label for="egname">组名</label><input id="egname" name="name" required maxlength="30"><label for="egnote">说明</label><input id="egnote" name="note" maxlength="80"><div id="egperms" class="permgrid"></div><div class="error" role="alert"></div><div class="page-actions"><button class="button secondary" type="button" id="cancelEditGroup">取消</button><button class="button" type="submit">保存</button></div></form></dialog><dialog id="editSiteDialog"><h2>编辑站点</h2><form id="editSiteForm"><label for="editSiteName">站点名称</label><input id="editSiteName" name="name" required maxlength="50"><label for="editSiteKind">站点类型（站点里没有资料时才能改）</label><select id="editSiteKind" name="kind"><option value="files">文件站点</option><option value="folder">文件夹站点</option><option value="gallery">图册站点</option></select><label for="editSiteDesc">一句话说明（可选）</label><input id="editSiteDesc" name="description" maxlength="120"><p class="smalltext" id="editSiteSlug"></p><div class="error" role="alert"></div><div class="buttons"><button class="button" type="submit">保存</button><button class="button secondary" type="button" id="cancelEditSite">取消</button></div></form></dialog><dialog id="resetDialog"><h2>重置初始密码</h2><form id="resetForm"><label for="resetPassword">新初始密码</label><input id="resetPassword" name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"><div class="error" role="alert"></div><div class="buttons"><button class="button" type="submit">确认重置</button><button class="button secondary" type="button" id="cancelReset">取消</button></div></form></dialog></div>`;
 $('#brandSchool').value=brandInfo().school;$('#brandClass').value=brandInfo().name;$('#brandSubtitle').value=brandInfo().subtitle;
 wireForm('#brandForm',async data=>{const r=await api('/settings',{method:'PATCH',body:JSON.stringify(Object.fromEntries(data))});if(r.brand)brand=r.brand;applyBrand();toast('网站信息已更新')});
 let metadata=null,selected=null,generation=0,preview=null,ready=false;
 const submit=$('#upload button[type=submit]');const refresh=()=>{submit.disabled=!ready||(extension(selected?.name)==='pdf'&&!$('#confirmLayout').checked)};$('#confirmLayout').onchange=refresh;
 $('#file').onchange=async()=>{const gen=++generation;ready=false;metadata=null;galleryQueue=[];const activeSite=siteById($('#site').value)||sites[0]||{kind:'files'},activeKind=activeSite.kind||'files';if(activeKind==='gallery'){submit.disabled=true;$('#progress').textContent='';$('#outlinePreview').innerHTML='';$('#upload .error').textContent='';try{await prepareGallery($('#file').files)}catch(err){if(gen===generation){$('#progress').textContent='';error($('#upload'),err)}}return}selected=$('#file').files[0];submit.disabled=true;$('#outlinePreview').innerHTML='';$('#uploadReader').hidden=true;$('#confirmLabel').hidden=true;$('#confirmLayout').checked=false;$('#upload .error').textContent='';$('#progress').textContent='';if(preview){await preview.destroy();preview=null}if(!selected)return;const f=selected;if(!$('#title').value)$('#title').value=f.name.replace(/\.[^.]+$/,'');try{const maxBytes=uploadLimitFor(activeKind,extension(f.name));if(f.size>maxBytes)throw Error(extension(f.name).toUpperCase()+' 最大 '+limitText(maxBytes)+'，当前文件 '+limitText(f.size));const data=await f.arrayBuffer();const type=validateFile(data,f.name,activeKind);if(gen!==generation)return;
  if(activeKind==='folder'){
   const entries=zipEntries(new Uint8Array(data));if(!entries)throw Error('这个 ZIP 无法解析（不支持加密或 ZIP64 压缩包）');
   const files=entries.filter(entry=>!entry.directory);
   metadata={pages:0,items:[],mode:'original'};
   $('#progress').textContent='压缩包内 '+files.length+' 个文件，共 '+formatBytes(files.reduce((sum,entry)=>sum+entry.size,0))+'。';
   $('#outlinePreview').innerHTML='<details><summary>查看压缩包目录（'+files.length+'）</summary><ol class="outline-preview">'+files.slice(0,200).map(entry=>'<li>'+esc(entry.name)+' <span class="muted">'+formatBytes(entry.size)+'</span></li>').join('')+'</ol></details>';
   ready=true;refresh();return;
  }
  if(type!=='pdf'){metadata={pages:0,items:[],mode:'original'};$('#progress').textContent=fileTypes[type].label+' 原文件已就绪。此格式暂不支持在线预览，成员可下载原文件。';ready=true;refresh();return}
  $('#progress').textContent='正在读取 PDF…';const pdf=await loadPdf({data});if(pdf.numPages>500){await pdf.destroy();throw Error('每份 PDF 最多 500 页')}if(gen!==generation){await pdf.destroy();return}
  $('#uploadReader').hidden=false;$('#uploadReader').innerHTML='<p class="preview-note">发布前预览 · 与阅读页使用同一份原文件及显示方式</p>'+viewerMarkup();preview=mountPdfViewer($('#uploadReader'),pdf);
  const result=await extractOutline(pdf,(p,total)=>{if(gen===generation)$('#progress').textContent=`正在生成大纲 ${p} / ${total} 页…`});if(gen!==generation)return;metadata=result;
  $('#progress').textContent=result.mode==='scanned'?'未提取到文字，可保留原页面阅读；暂无法生成大纲。':`已识别 ${result.pages} 页，生成 ${result.items.length} 个大纲条目。`;
  $('#outlinePreview').innerHTML='<details><summary>查看自动大纲（'+result.items.length+' 项）</summary><ol class="outline-preview">'+result.items.map(i=>`<li>${esc(i.title)} <span class="muted">第 ${i.page} 页</span></li>`).join('')+'</ol></details>';$('#confirmLabel').hidden=false;ready=true;refresh();
 }catch(e){if(gen===generation){$('#progress').textContent='';error($('#upload'),e)}}};
 const upload=$('#upload');upload.addEventListener('submit',async e=>{e.preventDefault();if(galleryQueue.length){await uploadGallery();return}if(!ready||!metadata||!selected)return;if(extension(selected.name)==='pdf'&&!$('#confirmLayout').checked)return;submit.disabled=true;$('#file').disabled=true;$('#title').disabled=true;upload.querySelector('.error').textContent='';const activeSiteKind=(siteById($('#site').value)||{}).kind||'files';try{$('#progress').textContent='正在上传并保存…';const r=await sendUpload({file:selected,title:$('#title').value,siteId:$('#site').value,metadata,siteKind:activeSiteKind});const after=sites.find(s=>s.id===$('#site').value)||sites[0];location.href=after?'/sites/'+after.slug+'/?doc='+r.id:'/'}catch(e){error(upload,e);$('#progress').textContent='上传未完成，可重试。';$('#file').disabled=false;$('#title').disabled=false;refresh()}});
 if(can('accounts')){
 $('#uperms').innerHTML=permissionBoxes('permissions',[]);
 $('#gperms').innerHTML=permissionBoxes('permissions',[]);
 const syncPerms=()=>{const grouped=!!$('#ugroup').value,admin=$('#uisadmin').checked;$('#uperms').hidden=grouped||admin;$('#uperms').style.opacity=grouped?'0.5':'1'};
 $('#ugroup').onchange=syncPerms;$('#uisadmin').onchange=syncPerms;syncPerms();
 wireForm('#createUser',async(data,form)=>{const fields=Object.fromEntries(data);const body={username:fields.username,name:fields.name,password:fields.password,groupId:$('#ugroup').value,role:$('#uisadmin').checked?'admin':'member',permissions:[...form.querySelectorAll('input[name=permissions]:checked')].map(input=>input.value)};await api('/users',{method:'POST',body:JSON.stringify(body)});form.reset();$('#gperms')&&null;await loadUsers();toast('账户已创建，首次登录需修改密码')});
 wireForm('#createGroup',async(data,form)=>{const body=Object.fromEntries(data);body.permissions=[...form.querySelectorAll('input[name=permissions]:checked')].map(input=>input.value);await api('/groups',{method:'POST',body:JSON.stringify(body)});form.reset();form.querySelectorAll('input[name=permissions]').forEach(input=>{input.checked=false});await loadGroups();fillGroupOptions();toast('用户组已创建')});
 wireForm('#editGroupForm',async(data,form)=>{const body=Object.fromEntries(data);body.permissions=[...form.querySelectorAll('input[name=permissions]:checked')].map(input=>input.value);await api('/groups/'+editingGroup,{method:'PATCH',body:JSON.stringify(body)});$('#editGroupDialog').close();await loadGroups();await loadUsers();toast('用户组已更新')});
 $('#cancelEditGroup').onclick=()=>$('#editGroupDialog').close();
 wireForm('#chatSettings',async data=>{const body=Object.fromEntries(data);await api('/settings',{method:'PATCH',body:JSON.stringify(body)});toast('聊天设置已保存')});
 $('#chatCleanup').onclick=async()=>{const button=$('#chatCleanup');button.disabled=true;try{const hours=Number(($('#chatCleanupHours')||{}).value)||24;const result=await api('/chat/cleanup',{method:'POST',body:JSON.stringify({hours})});toast(result.removed?('已清理 '+result.removed+' 条过期消息'):'没有需要清理的消息')}catch(error){toast(error.message)}finally{button.disabled=false}};
 api('/settings').then(data=>{const config=data.settings||{};if($('#chatRecall'))$('#chatRecall').value=String(config.chatRecall??10);if($('#chatRetention'))$('#chatRetention').value=String(config.chatRetention??90)}).catch(()=>{});

 }else{
 ['#uperms','#gperms'].forEach(id=>{const node=$(id);if(node)node.innerHTML=''});
 }
 applyAdminPermissions();
 wireForm('#createSite',async(data,form)=>{await api('/sites',{method:'POST',body:JSON.stringify(Object.fromEntries(data))});form.reset();await loadSites();toast('站点已创建，成员已经可以在首页看到')});
 let editingSite=null;$('#cancelEditSite').onclick=()=>$('#editSiteDialog').close();
 wireForm('#editSiteForm',async(data,form)=>{await api('/sites/'+editingSite.id,{method:'PATCH',body:JSON.stringify(Object.fromEntries(data))});$('#editSiteDialog').close();toast('站点信息已更新');await loadSites()});
 async function loadSites(){sites=(await api('/sites')).sites;renderSites();const picker=$('#site');if(picker&&!picker.dataset.wired){picker.dataset.wired='1';picker.onchange=syncUploadAccept}}
 function renderSites(){const select=$('#site'),wanted=siteOf(new URLSearchParams(location.search).get('site')||''),keep=select.value;
  select.innerHTML=sites.map(site=>`<option value="${site.id}">${esc(site.name)}（${esc(kindBadge(site.kind))}）</option>`).join('');
  select.value=(wanted||sites.find(site=>site.id===keep)||sites[0])?.id||'';
  syncUploadAccept();
  $('#sites').innerHTML=sites.length?`<table><thead><tr><th>站点</th><th>类型</th><th>说明</th><th>资料</th><th>操作</th></tr></thead><tbody>${sites.map(site=>`<tr><td>${esc(site.name)}<br><span class="muted">/sites/${site.slug}/</span></td><td>${esc(kindLabel(site.kind))}</td><td>${esc(site.description||'—')}</td><td>${site.count} 份</td><td><button data-id="${site.id}" data-action="edit">编辑</button><a class="button secondary" href="/sites/${site.slug}/">查看</a><button data-id="${site.id}" data-action="delete">删除</button></td></tr>`).join('')}</tbody></table>`:'<p class="muted">还没有站点。</p>';
  $('#sites').querySelectorAll('button').forEach(button=>button.onclick=async()=>{const site=sites.find(item=>item.id===button.dataset.id);if(!site)return;
   if(button.dataset.action==='edit'){editingSite=site;$('#editSiteName').value=site.name;$('#editSiteDesc').value=site.description;$('#editSiteKind').value=site.kind||'files';$('#editSiteSlug').textContent='访问路径：/sites/'+site.slug+'/'+`'（站点里已有资料时不能改类型）'+`;$('#editSiteDialog').showModal();return}
   if(!confirm('确认删除站点“'+site.name+'”？'))return;
   try{await api('/sites/'+site.id,{method:'DELETE'});await loadSites();toast('站点已删除')}catch(error){toast(error.message)}})}
 function syncUploadAccept(){const site=siteById($('#site').value)||sites[0],kind=kindOf(site&&site.kind),extensions=allowedExtensions(kind),input=$('#file');input.setAttribute('accept',extensions.map(ext=>'.'+ext).join(','));input.multiple=kind==='gallery';$('#uploadHint').textContent=siteKinds[kind].hint+'（'+extensions.join('、')+'，单个文件不超过 20 MB）';$('#title').closest('label')&&($('#title').placeholder=kind==='gallery'?'可留空，默认用文件名':'');}
 await loadSites();
 let resetId=null;$('#cancelReset').onclick=()=>$('#resetDialog').close();wireForm('#resetForm',async(data,form)=>{await api('/users/'+resetId,{method:'PATCH',body:JSON.stringify({password:data.get('password')})});$('#resetDialog').close();form.reset();toast('密码已重置');await loadUsers()});
async function loadGroups(){groups=(await api('/groups')).groups;renderGroups();fillGroupOptions();return groups}
function fillGroupOptions(){const select=$('#ugroup');if(!select)return;const current=select.value;select.innerHTML='<option value="">不使用用户组（手动指定权限）</option>'+groups.map(group=>`<option value="${group.id}">${esc(group.name)}（${esc(group.permissions.map(permissionLabel).join('、')||'只读')}）</option>`).join('');select.value=current}
function renderGroups(){const box=$('#groups');if(!box)return;if(!groups.length){box.innerHTML='<p class="muted">还没有用户组，可以用上面的表单新建一个。</p>';return}box.innerHTML=`<table><thead><tr><th>组名</th><th>权限</th><th>成员</th><th>操作</th></tr></thead><tbody>${groups.map(group=>`<tr><td>${esc(group.name)}${group.note?'<br><span class="muted">'+esc(group.note)+'</span>':''}</td><td>${esc(group.permissions.map(permissionLabel).join('、')||'只读（不能管理）')}</td><td>${group.members}</td><td><button data-id="${group.id}" data-action="edit">编辑</button><button data-id="${group.id}" data-action="delete">删除</button></td></tr>`).join('')}</tbody></table>`;box.querySelectorAll('button').forEach(button=>button.onclick=async()=>{const group=groupById(button.dataset.id);if(!group)return;if(button.dataset.action==='edit'){editingGroup=group.id;$('#egname').value=group.name;$('#egnote').value=group.note||'';$('#egperms').innerHTML=permissionBoxes('permissions',group.permissions);$('#editGroupDialog').showModal();return}if(!confirm('确认删除用户组“'+group.name+'”？组内成员会改为手动指定权限。'))return;try{await api('/groups/'+group.id,{method:'DELETE'});await loadGroups();await loadUsers();toast('用户组已删除')}catch(error){toast(error.message)}})}
async function loadUsers(){await loadGroups();const list=(await api('/users')).users;$('#users').innerHTML=`<table><thead><tr><th>姓名 / 账号</th><th>用户组</th><th>权限</th><th>状态</th><th>操作</th></tr></thead><tbody>${list.map(u=>{const guarded=u.id===user.id||u.username==='admin';const groupCell=guarded?'<span class="muted">—</span>':`<select data-id="${u.id}" data-action="group" aria-label="用户组"><option value="">手动指定</option>${groups.map(group=>`<option value="${group.id}"${u.groupId===group.id?' selected':''}>${esc(group.name)}</option>`).join('')}</select>`;const actions=guarded?'<span class="muted">受保护的管理账户</span>':`<button data-id="${u.id}" data-action="muteGroup" class="switch-btn" aria-pressed="${u.muteGroup?'false':'true'}" title="班级大群发言权限"><span class="dot"></span>${u.muteGroup?'群聊已禁言':'群聊可发言'}</button><button data-id="${u.id}" data-action="muteDirect" class="switch-btn" aria-pressed="${u.muteDirect?'false':'true'}" title="私聊发言权限"><span class="dot"></span>${u.muteDirect?'私聊已禁言':'私聊可发言'}</button><button data-id="${u.id}" data-action="role">${u.role==='admin'?'设为成员':'设为管理员'}</button><button data-id="${u.id}" class="switch-btn" data-action="disabled" aria-pressed="${u.disabled?'false':'true'}"><span class="dot"></span>${u.disabled?'已停用':'使用中'}</button><button data-id="${u.id}" data-action="reset">重置密码</button><button data-id="${u.id}" data-action="delete" class="danger">删除账号</button>`;return `<tr><td>${esc(u.name)}<br><span class="muted">${esc(u.username)}</span></td><td>${groupCell}</td><td>${esc(permissionText(u))}</td><td>${u.disabled?'已停用':u.mustChange?'待修改初始密码':'正常'}</td><td>${actions}</td></tr>`}).join('')}</tbody></table>`;
 $('#users').querySelectorAll('button').forEach(button=>button.onclick=async()=>{const target=list.find(item=>item.id===button.dataset.id);if(!target)return;if(button.dataset.action==='reset'){resetId=target.id;$('#resetDialog').showModal();return}
  if(button.dataset.action==='delete'){if(!confirm('确认删除账号“'+target.name+'”？该账号的登录会失效，他发送的聊天消息也会一起删除。'))return;try{const result=await api('/users/'+target.id,{method:'DELETE'});await loadUsers();toast('账号已删除'+(result.removed&&result.removed.messages?('，同时清理了 '+result.removed.messages+' 条聊天消息'):''))}catch(error){toast(error.message)}return}if(!confirm('确认'+button.textContent+'“'+target.name+'”？'))return;const action=button.dataset.action;const body={role:action==='role'?(target.role==='admin'?'member':'admin'):target.role,disabled:action==='disabled'?!target.disabled:!!target.disabled,groupId:target.groupId||''};if(action==='muteGroup')body.muteGroup=!target.muteGroup;if(action==='muteDirect')body.muteDirect=!target.muteDirect;try{await api('/users/'+target.id,{method:'PATCH',body:JSON.stringify(body)});await loadUsers();toast(body.muteGroup!==undefined||body.muteDirect!==undefined?'禁言设置已更新':'账户权限已更新')}catch(error){toast(error.message)}});
 $('#users').querySelectorAll('select[data-action=group]').forEach(select=>select.onchange=async()=>{const target=list.find(item=>item.id===select.dataset.id);if(!target)return;try{await api('/users/'+target.id,{method:'PATCH',body:JSON.stringify({role:target.role,disabled:!!target.disabled,groupId:select.value})});await loadUsers();toast(select.value?'已加入用户组':'已改为手动指定权限')}catch(error){toast(error.message)}})
}if(can('accounts'))await loadUsers();
 wireAdminTabs();
}
function applyAdminPermissions(){
const show={upload:can('upload'),accounts:can('accounts'),sites:can('sites'),courses:can('courses'),calendar:can('calendar'),brand:can('brand')};
const hide=(id,visible)=>{const node=document.getElementById(id);if(node)node.hidden=!visible};
hide('uploadPanel',show.upload);hide('createUserPanel',show.accounts);hide('usersPanel',show.accounts);hide('groupsPanel',show.accounts);hide('brandPanel',show.brand);hide('chatPanel',show.accounts);hide('panelSites',show.sites);hide('panelCourses',show.courses);hide('panelCalendar',show.calendar);
const tabs={data:show.upload||show.accounts||show.brand,sites:show.sites,courses:show.courses,calendar:show.calendar};
const bar=$('#adminTabs');if(bar)bar.querySelectorAll('.tab').forEach(button=>{button.hidden=!tabs[button.dataset.tab]});
}
const visibleAdminTabs=()=>{const bar=$('#adminTabs');return bar?[...bar.querySelectorAll('.tab')].filter(button=>!button.hidden).map(button=>button.dataset.tab):[]};

function wireAdminTabs(){
 const bar=$('#adminTabs');if(!bar)return;
 bar.querySelectorAll('.tab').forEach(button=>button.onclick=()=>openAdminTab(button.dataset.tab));
 const requested=new URLSearchParams(location.search).get('tab');const available=visibleAdminTabs();openAdminTab(available.includes(requested)?requested:(available[0]||'data'));
}
async function openAdminTab(name){
 const bar=$('#adminTabs');if(!bar)return;
 bar.querySelectorAll('.tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===name));
 document.querySelectorAll('.tab-panel').forEach(panel=>panel.classList.toggle('active',panel.dataset.panel===name));
 const requestedFocus=new URLSearchParams(location.search).get('focus');
 const url=new URL(location.href);url.searchParams.set('tab',name);url.searchParams.delete('focus');history.replaceState(null,'',url);
 if(name==='courses'&&!$('#panelCourses').dataset.ready){
  const box=$('#panelCourses');box.innerHTML='<p class="smalltext">正在载入课程表…</p>';
  try{timetableData=await api('/timetable');box.innerHTML=adminCourseTools();box.dataset.ready='1';wireCourseTools()}
  catch(error){box.innerHTML='<p class="error">课程表载入失败：'+esc(error.message)+'</p>'}
 }
 if(name==='calendar'&&!$('#panelCalendar').dataset.ready){
  const box=$('#panelCalendar');box.innerHTML='<p class="smalltext">正在载入日历设置…</p>';
  try{const data=await api('/settings');box.innerHTML=adminCalendarTools();box.dataset.ready='1';wireCalendarTools();renderEventList(data.events)}
  catch(error){box.innerHTML='<p class="error">日历设置载入失败：'+esc(error.message)+'</p>'}
 }
 if(requestedFocus){const map={upload:'#file',site:'#siteName',user:'#uname',course:'#cname',event:'#eventName',brand:'#brandSchool'};const field=map[requestedFocus]?document.querySelector(map[requestedFocus]):null;if(field){field.scrollIntoView({block:'center',behavior:'smooth'});if(field.focus)field.focus()}}
}
function refreshCourseArea(){if($('#courses'))renderCourseList();else renderTimetable()}
async function reloadAdminCalendar(){try{const data=await api('/settings');renderEventList(data.events)}catch(error){}}
async function main(){if(user&&!user.mustChange)sites=(await api('/sites')).sites;nav();if(!user){if(setupPending){setupPage();return}login();return}if(user.mustChange||location.pathname==='/account/'){password();return}
 if(location.pathname!=='/chat/')startChatWatch();const slug=currentSite();if(location.pathname==='/chat/')await chatPage();else if(location.pathname==='/admin/')await admin();else if(location.pathname==='/calendar/')await calendarPage();else if(location.pathname==='/timetable/')await timetablePage();else if(slug)await reader(slug);else{docs=(await api('/documents')).documents;await home()}}
try{applyNet();observeNet();installPrefetch();setDensityCap(netPrefs().density);const me=await api('/me');user=me.user;brand=me.brand||null;setupPending=!!me.setup;applyBrand();paintNetStatus();await main()}catch(e){$('#app').innerHTML=`<section class="panel"><h1>暂时无法打开</h1><p>${esc(e.message)}</p><a class="button" href="/">返回首页</a></section>`}
