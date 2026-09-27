// 账号管理界面检查：删除账号、停用账号登录提示、权限勾选布局
import {spawn} from 'node:child_process';
import WebSocket from '../../node_modules/ws/index.js';
const SITE=process.env.BASE_URL||'http://127.0.0.1:4173';
const PORT=Number(process.env.CDP_PORT||9453),profile='/tmp/cdp-accounts-'+Date.now();
const chrome=spawn('google-chrome',['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--window-size=1440,1200','--remote-debugging-port='+PORT,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore',detached:true});chrome.unref();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pick=res=>(res.headers.getSetCookie?res.headers.getSetCookie().join('; '):res.headers.get('set-cookie'))||'';
const call=async(path,method,body,cookie)=>fetch(SITE+'/api'+path,{method:method||'GET',headers:{'Content-Type':'application/json',origin:SITE,...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
const json=async res=>{try{return await res.json()}catch(error){return {}}};
const stamp=Date.now().toString(36).slice(-5);
const CREDS=[[process.env.ADMIN_USER||'admin',process.env.ADMIN_PASSWORD||'Local-New-Password-827!'],['admin','Local-New-Password-827!'],['admin','Local-Test-Password-827!'],['admin','Owner-Password-827!'],['owner','E2E-Admin-Password-827!']];
let adminCookie='';
if((await json(await fetch(SITE+'/api/me'))).setup){const r=await call('/setup','POST',{school:'账号检查中学',className:'账号检查班',username:'owner'+stamp,password:'Local-Test-Password-827!',password2:'Local-Test-Password-827!'});adminCookie=pick(r)}
if(!adminCookie){for(const [username,password] of CREDS){const r=await call('/login','POST',{username,password});if(r.status===200){adminCookie=pick(r);break}}const owner=await call('/login','POST',{username:'owner',password:'Local-New-Password-827!'});if(!adminCookie&&owner.status===200)adminCookie=pick(owner)}
if(!adminCookie){console.log('SKIP :: 无法登录管理员');process.exit(0)}
const me=await json(await fetch(SITE+'/api/me',{headers:{cookie:adminCookie}}));
if(me.user&&me.user.mustChange){const changed=await call('/password','POST',{oldPassword:'Local-Test-Password-827!',password:'Local-New-Password-827!'},adminCookie);adminCookie=pick(changed)||adminCookie}
const username='stop'+stamp,password='Stop-Example-827!';
const created=await call('/users','POST',{username,name:'停用示例',password},adminCookie);
const users=await json(await fetch(SITE+'/api/users',{headers:{cookie:adminCookie}}));
const target=users.users.find(item=>item.username===username);
await call('/users/'+target.id,'PATCH',{role:'member',disabled:true},adminCookie);
const results=[];const check=(name,ok,extra)=>{console.log((ok?'PASS':'FAIL')+' :: '+name+(extra?' :: '+String(extra).slice(0,220):''));results.push(ok)};for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:'+PORT+'/json/version');if(r.ok)break}catch(error){}await sleep(500)}
const targetPage=await (await fetch('http://127.0.0.1:'+PORT+'/json/new?'+encodeURIComponent(SITE+'/'),{method:'PUT'})).json();
const ws=new WebSocket(targetPage.webSocketDebuggerUrl,{maxPayload:64*1024*1024});
await new Promise((resolve,reject)=>{ws.on('open',resolve);ws.on('error',reject)});
let id=0;const pending=new Map();const errors=[];
ws.on('message',raw=>{const m=JSON.parse(raw.toString());
 if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);return}
 if(m.method==='Runtime.exceptionThrown')errors.push(String(m.params.exceptionDetails.exception?.description||'').slice(0,160));
 if(m.method==='Page.javascriptDialogOpening')ws.send(JSON.stringify({id:++id,method:'Page.handleJavaScriptDialog',params:{accept:true}}))});
const send=(method,params={})=>{const i=++id;ws.send(JSON.stringify({id:i,method,params}));return new Promise((resolve,reject)=>pending.set(i,{resolve,reject}))};
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error('eval: '+String(r.exceptionDetails.exception?.description||'').slice(0,200));return r.result.value};
await send('Runtime.enable');await send('Page.enable');
// 1) 停用账号在登录页得到明确提示
await send('Page.navigate',{url:SITE+'/'});await sleep(2500);
const loginHint=await evaluate('(async()=>{const form=document.querySelector("#login");form.querySelector("#username").value='+JSON.stringify(username)+';form.querySelector("#password").value='+JSON.stringify(password)+';form.requestSubmit();await new Promise(r=>setTimeout(r,2000));const box=document.querySelector("#login .error");return box?box.textContent:"(none)"})()');
check('停用账号登录时页面明确提醒',/停用/.test(loginHint),loginHint);
const wrongHint=await evaluate('(async()=>{const form=document.querySelector("#login");form.querySelector("#username").value='+JSON.stringify(username)+';form.querySelector("#password").value="Total-Wrong-Password-1!";form.requestSubmit();await new Promise(r=>setTimeout(r,1500));const box=document.querySelector("#login .error");return box?box.textContent:"(none)"})()');
check('密码错误仍然是普通提示（不泄露账号状态）',/不正确/.test(wrongHint),wrongHint);// 2) 管理员登录后检查布局与删除按钮，并通过界面删除这个账号
const loginForm=await evaluate('(async()=>{const form=document.querySelector("#login");form.querySelector("#username").value='+JSON.stringify(CREDS[0][0])+';form.querySelector("#password").value='+JSON.stringify(CREDS[0][1])+';form.requestSubmit();await new Promise(r=>setTimeout(r,2500));const me=await (await fetch("/api/me")).json();if(me.user&&me.user.mustChange){const box=document.querySelector("#password")?document.querySelector("#password"):null;await fetch("/api/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldPassword:"Local-New-Password-827!",password:"Local-Test-Password-827!"})})}const state=await (await fetch("/api/me")).json();return JSON.stringify({user:state.user&&state.user.username,role:state.user&&state.user.role})})()');
check('用表单登录管理员',/admin|owner/.test(loginForm),loginForm);
await send('Page.navigate',{url:SITE+'/admin/?tab=data'});await sleep(3500);
const layout=await evaluate('JSON.stringify([...document.querySelectorAll(".perm")].slice(0,3).map(node=>{const span=node.querySelector("span").getBoundingClientRect(),box=node.querySelector("input").getBoundingClientRect();return {spanW:Math.round(span.width),spanH:Math.round(span.height),boxW:Math.round(box.width),boxH:Math.round(box.height)}}))');
const boxes=JSON.parse(layout);
check('权限勾选条目文字横向排布',boxes.length>=3&&boxes.every(item=>item.spanW>=140&&item.spanH<=100),layout);
check('勾选框是 18×18（不再撑满一行）',boxes.every(item=>item.boxW===18&&item.boxH===18),layout);
check('后台无横向溢出',await evaluate('document.documentElement.scrollWidth-window.innerWidth')<=2);
check('账户表提供删除按钮',await evaluate('document.querySelectorAll("[data-action=delete]").length')>=1);
const removed=await evaluate('(async()=>{const rows=[...document.querySelectorAll("#users tr")];const row=rows.find(item=>item.textContent.indexOf('+JSON.stringify(username)+')>=0);if(!row)return "no-row";const button=row.querySelector("[data-action=delete]");button.click();await new Promise(r=>setTimeout(r,2500));return JSON.stringify({rows:[...document.querySelectorAll("#users tr")].filter(item=>item.textContent.indexOf('+JSON.stringify(username)+')>=0).length})})()');
check('在界面上可以删除账号',JSON.parse(removed).rows===0,removed);
const gone=await json(await fetch(SITE+'/api/users',{headers:{cookie:adminCookie}}));
check('删除后账号列表不再包含它',!gone.users.some(item=>item.username===username),'users='+gone.users.length);
check('控制台无错误',errors.length===0,errors.slice(0,2).join(' | '));
console.log('TOTAL',results.length,', FAILED',results.filter(ok=>!ok).length);
ws.close();chrome.kill('SIGKILL');process.exit(results.filter(ok=>!ok).length?1:0);