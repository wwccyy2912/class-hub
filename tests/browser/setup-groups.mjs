// 首次初始化向导 + 用户组与权限界面检查（需要全新数据库：没有管理员、未完成初始化）
import {spawn} from 'node:child_process';
import WebSocket from '../../node_modules/ws/index.js';
const SITE=process.env.BASE_URL||'http://127.0.0.1:4173';
const PORT=Number(process.env.CDP_PORT||9417),profile='/tmp/cdp-setup-'+Date.now();
const chrome=spawn('google-chrome',['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--window-size=1440,1100','--remote-debugging-port='+PORT,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore',detached:true});chrome.unref();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:'+PORT+'/json/version');if(r.ok)break}catch(error){}await sleep(500)}
const target=await (await fetch('http://127.0.0.1:'+PORT+'/json/new?'+encodeURIComponent(SITE+'/'),{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl,{maxPayload:64*1024*1024});
await new Promise((resolve,reject)=>{ws.on('open',resolve);ws.on('error',reject)});
let id=0;const pending=new Map();const errors=[];
ws.on('message',raw=>{const m=JSON.parse(raw.toString());
 if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);return}
 if(m.method==='Runtime.exceptionThrown')errors.push('EXCEPTION '+String(m.params.exceptionDetails.exception?.description||'').slice(0,150))});
const send=(method,params={})=>{const i=++id;ws.send(JSON.stringify({id:i,method,params}));return new Promise((resolve,reject)=>pending.set(i,{resolve,reject}))};
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error('eval: '+String(r.exceptionDetails.exception?.description||'').slice(0,200));return r.result.value};
const waitFor=async(expression,timeout=30000)=>{const t0=Date.now();while(Date.now()-t0<timeout){try{if(await evaluate(expression))return true}catch(error){}await sleep(300)}return false};
const results=[];const check=(name,ok,extra)=>{console.log((ok?'PASS':'FAIL')+' :: '+name+(extra?' :: '+String(extra).slice(0,220):''));results.push(ok)};
const stamp=Date.now().toString(36).slice(-5);
await send('Runtime.enable');await send('Page.enable');
await send('Page.navigate',{url:SITE+'/'});await sleep(2500);
const pendingSetup=await evaluate('!!document.querySelector("#setup")');
if(!pendingSetup)console.log('SKIP :: 数据库已初始化，跳过首次引导与建组建号检查（先清空数据库再运行可完整检查）');
if(pendingSetup)check('全新网站先显示首次初始化向导',true,await evaluate('document.querySelector("#app").textContent.slice(0,60)'));
if(pendingSetup){
 const filled=await evaluate('(()=>{document.querySelector("#school").value="第十四中学";document.querySelector("#className").value="2028届7班";document.querySelector("#subtitle").value="班级资料空间";document.querySelector("#setupUser").value="teach'+stamp+'";document.querySelector("#setupName").value="张老师";document.querySelector("#setupPassword").value="Setup-'+stamp+'-Password!";document.querySelector("#setupPassword2").value="Setup-'+stamp+'-Password!";return true})()');
 check('向导表单可以填写',filled);
 await evaluate('document.querySelector("#setup button[type=submit]").click();true');
 const entered=await waitFor('!!document.querySelector(".hero")',20000);
 check('初始化后直接进入网站',entered,await evaluate('location.href'));
 const brand=await evaluate('JSON.stringify({title:document.title,name:document.querySelector("#brandName")?document.querySelector("#brandName").textContent:"",foot:document.querySelector("#footerLine")?document.querySelector("#footerLine").textContent:""})');
 check('页头与标题使用初始化的学校/班级',/2028届7班/.test(JSON.parse(brand).title)&&/第十四中学/.test(JSON.parse(brand).foot),brand);
}
// 用管理员会话继续（若刚才完成了初始化则已经登录，否则用已有管理员登录）
if(!pendingSetup){console.log('TOTAL 0 , FAILED 0（已初始化数据库，只做了登录检查）');ws.close();chrome.kill('SIGKILL');process.exit(0)}
const loggedIn=await evaluate('(async()=>{const me=await (await fetch("/api/me")).json();return !!(me.user&&me.user.role==="admin")})()');
if(!loggedIn){const CREDS=JSON.stringify([[process.env.ADMIN_USER||'admin',process.env.ADMIN_PASSWORD||'Local-New-Password-827!'],['admin','Local-New-Password-827!'],['admin','Local-Test-Password-827!'],['admin','E2E-Admin-Password-827!'],['owner','E2E-Admin-Password-827!']]);const login=await evaluate('(async()=>{const attempt=async (user,password)=>{const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:user,password})});return r.status};for(const [user,password] of '+CREDS+'){if(await attempt(user,password)===200)return 200}return 0})()');check('管理员登录',login===200,'status='+login);const changed=await evaluate('(async()=>{const me=await (await fetch("/api/me")).json();if(!me.user||!me.user.mustChange)return "skip";const r=await fetch("/api/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldPassword:"Local-Test-Password-827!",password:"Local-New-Password-827!"})});return String(r.status)})()');console.log('forced change:',changed);await send('Page.navigate',{url:SITE+'/admin/?tab=data'});await sleep(3000)}
// 用户组界面
await send('Page.navigate',{url:SITE+'/admin/?tab=data'});await sleep(3500);
check('后台有用户组面板',await evaluate('!!document.querySelector("#groupsPanel")&&!!document.querySelector("#createGroup")'));
const groupCreated=await evaluate('(async()=>{document.querySelector("#gname").value="宣传组'+stamp+'";document.querySelector("#gnote").value="负责上传活动照片";document.querySelector("#gperms input[value=upload]").checked=true;document.querySelector("#gperms input[value=calendar]").checked=true;document.querySelector("#createGroup button[type=submit]").click();await new Promise(r=>setTimeout(r,1500));return document.querySelector("#groups").textContent.replace(/\\s+/g," " ).slice(0,80)})()');
check('新建用户组并显示权限',/宣传组/.test(groupCreated)&&/上传与管理资料/.test(groupCreated),groupCreated);
const accountCreated=await evaluate('(async()=>{document.querySelector("#uname").value="member'+stamp+'";document.querySelector("#name").value="组内同学";document.querySelector("#tempPassword").value="Member-'+stamp+'-Password!";const select=document.querySelector("#ugroup");const option=[...select.options].find(item=>item.textContent.indexOf("宣传组'+stamp+'")>=0);select.value=option.value;select.dispatchEvent(new Event("change"));document.querySelector("#createUser button[type=submit]").click();await new Promise(r=>setTimeout(r,1800));return document.querySelector("#users").textContent.replace(/\\s+/g," " ).slice(0,140)})()');
check('建账户时选组并在列表显示权限',/组内同学/.test(accountCreated)&&/上传与管理资料/.test(accountCreated),accountCreated);
const manualCreated=await evaluate('(async()=>{document.querySelector("#uname").value="manual'+stamp+'";document.querySelector("#name").value="手动同学";document.querySelector("#tempPassword").value="Manual-'+stamp+'-Password!";const select=document.querySelector("#ugroup");select.value="";select.dispatchEvent(new Event("change"));const box=document.querySelector("#uperms");box.querySelectorAll("input").forEach(input=>{input.checked=input.value==="courses"});document.querySelector("#createUser button[type=submit]").click();await new Promise(r=>setTimeout(r,1800));return document.querySelector("#users").textContent.replace(/\\s+/g," " ).slice(0,200)})()');
check('不选组时手动指定权限',/手动同学/.test(manualCreated)&&/课程表/.test(manualCreated),manualCreated);
// 组内成员登录后只看到自己有权限的标签页
const memberLogin=await evaluate('(async()=>{await fetch("/api/logout",{method:"POST"});const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"member'+stamp+'",password:"Member-'+stamp+'-Password!"})});if(r.status!==200)return "login="+r.status;const c=await fetch("/api/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldPassword:"Member-'+stamp+'-Password!",password:"Member-'+stamp+'-New!"})});return String(c.status)})()');
check('组内成员登录并改初始密码',memberLogin==='200',memberLogin);
await send('Page.navigate',{url:SITE+'/admin/'});await sleep(3500);
const tabs=await evaluate('(()=>{const shown=id=>{const node=document.getElementById(id);return !!node&&!node.hidden};return JSON.stringify({tabs:[...document.querySelectorAll("#adminTabs .tab")].filter(t=>!t.hidden).map(t=>t.dataset.tab),upload:shown("uploadPanel"),accounts:shown("usersPanel"),sites:shown("panelSites"),courses:shown("panelCourses"),calendar:shown("panelCalendar"),brand:shown("brandPanel"),panels:document.querySelectorAll(".tab-panel").length})})()');
const tabInfo=JSON.parse(tabs);
console.log('成员后台页面：',String(await evaluate('document.querySelector("#app").textContent.replace(/\\s+/g," ").slice(0,140)')),await evaluate('JSON.stringify({me:await (await fetch("/api/me")).json()})').catch(()=>''));
check('成员只看到有权限的后台标签页',tabInfo.tabs.length===2&&tabInfo.tabs.indexOf('data')>=0&&tabInfo.tabs.indexOf('calendar')>=0,JSON.stringify(tabInfo.tabs));
check('成员看不到无权限的面板',tabInfo.accounts===false&&tabInfo.sites===false&&tabInfo.courses===false&&tabInfo.brand===false&&tabInfo.upload===true,tabs);
check('控制台无错误',errors.length===0,errors.slice(0,2).join(' | '));
console.log('TOTAL',results.length,', FAILED',results.filter(ok=>!ok).length);
ws.close();chrome.kill('SIGKILL');process.exit(results.filter(ok=>!ok).length?1:0);