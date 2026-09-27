// 首次初始化、用户组与权限的端到端检查（需要可写的本地 D1）
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const origin=base;
const pick=res=>(res.headers.getSetCookie?res.headers.getSetCookie().join('; '):res.headers.get('set-cookie'))||'';
const call=async(path,method,body,cookie)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',origin,...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
const json=async res=>{try{return await res.json()}catch(error){return {}}};
const stamp=Date.now().toString(36);
const adminPassword=process.env.ADMIN_PASSWORD||'E2E-Admin-Password-827!';
const checks=[];
const check=(name,ok,extra)=>{checks.push(ok);console.log((ok?'PASS':'FAIL')+' :: '+name+(extra?' :: '+extra:''))};

// 1) 首次初始化：已经初始化过就直接登录
const before=await json(await fetch(base+'/api/me'));
let adminCookie='',adminUser=process.env.ADMIN_USER||'admin';
if(before.setup){
 const bad=await call('/api/setup','POST',{className:'测试班',username:'teach'+stamp,password:'short'});
 check('初始化时弱密码被拒',bad.status===400,'status='+bad.status);
 const ready=await call('/api/setup','POST',{school:'检查中学',className:'检查班',subtitle:'检查空间',username:'setup'+stamp,name:'初始化管理员',password:adminPassword,password2:adminPassword});
 check('首次初始化成功',ready.status===201,'status='+ready.status);
 const body=await json(ready);
 adminCookie=pick(ready);adminUser=body.user&&body.user.username;
 check('初始化后直接登录为管理员',!!body.user&&body.user.role==='admin'&&body.user.mustChange===false,JSON.stringify(body.user&&{u:body.user.username,role:body.user.role,mustChange:body.user.mustChange}));
 check('初始化写入学校与班级名称',body.brand&&body.brand.school==='检查中学'&&body.brand.name==='检查班',JSON.stringify(body.brand));
 const again=await call('/api/setup','POST',{className:'重复',username:'again'+stamp,password:'Repeat-'+stamp+'-Password!'});
 check('不能重复初始化',again.status===403,'status='+again.status);
 const html=await (await fetch(base+'/')).text();
 check('首页标题使用初始化的班级名称',html.indexOf('检查班')>=0);
}else{
 let login=null,used='';
 for(const password of [adminPassword,'Local-New-Password-827!','Local-Test-Password-827!'].filter(Boolean)){
  const attempt=await call('/api/login','POST',{username:adminUser,password});
  if(attempt.status===200){login=attempt;used=password;break}
 }
 if(!login){console.log('SKIP :: 网站已经初始化且管理员密码未知（设置 ADMIN_PASSWORD 后可以完整检查）');process.exit(0)}
 adminCookie=pick(login);
 check('已有网站可以用管理员登录',true,'密码来源='+(used===process.env.ADMIN_PASSWORD?'环境变量':'内置测试密码'));
 {const me=await json(await fetch(base+'/api/me',{headers:{cookie:adminCookie}}));if(me.user&&me.user.mustChange){const changed=await call('/api/password','POST',{oldPassword:used,password:'Local-New-Password-827!'},adminCookie);adminCookie=pick(changed);check('强制修改初始密码',changed.status===200,'status='+changed.status)}}
}
const adminMe=await json(await fetch(base+'/api/me',{headers:{cookie:adminCookie}}));
check('管理员拥有全部权限',(adminMe.user&&adminMe.user.permissions||[]).length===6,JSON.stringify(adminMe.user&&adminMe.user.permissions));

// 2) 用户组
const created=await call('/api/groups','POST',{name:'资料组'+stamp,note:'负责上传',permissions:['upload','brand']},adminCookie);
const group=await json(created);
check('新建用户组',created.status===201&&group.group&&group.group.permissions.length===2,'status='+created.status);
const groupId=group.group&&group.group.id;
check('非法权限会被过滤',(await json(await call('/api/groups','POST',{name:'空组'+stamp,permissions:['nope','upload'],note:''},adminCookie))).group.permissions.join(',')==='upload');

// 3) 建账户：选组 / 手动权限
const inGroup='g'+stamp,manualUser='m'+stamp;
check('按用户组建账户',(await call('/api/users','POST',{username:inGroup,name:'组内同学',password:'Group-'+stamp+'-Password!',groupId},adminCookie)).status===201);
check('手动指定权限建账户',(await call('/api/users','POST',{username:manualUser,name:'手动同学',password:'Manual-'+stamp+'-Password!',permissions:['courses']},adminCookie)).status===201);
const users=await json(await fetch(base+'/api/users',{headers:{cookie:adminCookie}}));
const groupedUser=users.users.find(u=>u.username===inGroup),manualAccount=users.users.find(u=>u.username===manualUser);
check('选组的账户继承组权限',groupedUser&&groupedUser.groupId===groupId&&groupedUser.permissions.join(',')==='upload,brand',JSON.stringify(groupedUser&&groupedUser.permissions));
check('手动账户保存手动权限',manualAccount&&manualAccount.permissions.join(',')==='courses',JSON.stringify(manualAccount&&manualAccount.permissions));

// 4) 登录后按权限放行/拦截
const signIn=async(username,password,next)=>{const r=await call('/api/login','POST',{username,password});if(r.status!==200)return '';let cookie=pick(r);const me=await json(await fetch(base+'/api/me',{headers:{cookie}}));if(me.user&&me.user.mustChange)cookie=pick(await call('/api/password','POST',{oldPassword:password,password:next},cookie));return cookie};
const groupedCookie=await signIn(inGroup,'Group-'+stamp+'-Password!','Group-'+stamp+'-New!');
const manualCookie=await signIn(manualUser,'Manual-'+stamp+'-Password!','Manual-'+stamp+'-New!');
check('选组账户改网站信息放行',(await call('/api/settings','PATCH',{school:'检查中学'},groupedCookie)).status===200);
check('选组账户建站点被拦',(await call('/api/sites','POST',{name:'越权站',slug:'deny-'+stamp,kind:'files'},groupedCookie)).status===403);
check('选组账户建账户被拦',(await call('/api/users','POST',{username:'x'+stamp,name:'x',password:'Xxxxx-'+stamp+'-Password!'},groupedCookie)).status===403);
check('手动账户改课程表设置放行',(await call('/api/settings','PATCH',{countdownDays:18},manualCookie)).status===200);
check('手动账户改网站信息被拦',(await call('/api/settings','PATCH',{school:'x'},manualCookie)).status===403);
check('手动账户查看账户列表被拦',(await call('/api/users','GET',undefined,manualCookie)).status===403);

// 5) 组权限变更同步给成员
check('修改组权限',(await call('/api/groups/'+groupId,'PATCH',{name:'资料组'+stamp,note:'上传+课表',permissions:['upload','courses']},adminCookie)).status===200);
const after=await json(await fetch(base+'/api/users',{headers:{cookie:adminCookie}}));
check('组内成员权限同步',JSON.stringify(after.users.find(u=>u.username===inGroup).permissions)==='["upload","courses"]');
check('同步后成员可以改课程表设置',(await call('/api/settings','PATCH',{countdownDays:19},groupedCookie)).status===200);
check('同步后成员失去网站信息权限',(await call('/api/settings','PATCH',{school:'x'},groupedCookie)).status===403);

// 6) 移出用户组改为手动
check('把成员改为手动权限',(await call('/api/users/'+groupedUser.id,'PATCH',{groupId:'',permissions:['calendar']},adminCookie)).status===200);
const moved=await json(await fetch(base+'/api/users',{headers:{cookie:adminCookie}}));
const movedUser=moved.users.find(u=>u.username===inGroup);
check('改为手动后保存新权限',movedUser.groupId===''&&movedUser.permissions.join(',')==='calendar',JSON.stringify(movedUser.permissions));
check('改权限后旧会话立即失效',(await call('/api/settings','PATCH',{countdownDays:20},groupedCookie)).status===401);
const regroupedCookie=await signIn(inGroup,'Group-'+stamp+'-New!','Group-'+stamp+'-New!');
check('重新登录后按新权限放行',(await call('/api/holidays/sync','POST',{},regroupedCookie)).status===200);
check('重新登录后旧权限失效',(await call('/api/settings','PATCH',{countdownDays:20},regroupedCookie)).status===403);

// 7) 管理员仍然全权
check('管理员不受权限影响',(await call('/api/settings','PATCH',{countdownDays:14},adminCookie)).status===200);

// 8) 停用提示与删除账号
const tempName='del'+stamp,tempPassword='Delete-'+stamp+'-Password!';
check('创建待删除账号',(await call('/api/users','POST',{username:tempName,name:'待删除同学',password:tempPassword},adminCookie)).status===201);
const allUsers=await json(await fetch(base+'/api/users',{headers:{cookie:adminCookie}}));
const tempUser=allUsers.users.find(account=>account.username===tempName);
check('停用这个账号',(await call('/api/users/'+tempUser.id,'PATCH',{role:'member',disabled:true},adminCookie)).status===200);
const disabledLogin=await call('/api/login','POST',{username:tempName,password:tempPassword});
const disabledBody=await json(disabledLogin);
check('停用账号登录会得到明确提示',disabledLogin.status===403&&/停用/.test(disabledBody.error||''),disabledLogin.status+' '+JSON.stringify(disabledBody));
check('密码错误仍然只提示密码不正确',(await call('/api/login','POST',{username:tempName,password:'Wrong-'+stamp+'-Password!'})).status===401);
check('不能删除自己的账号',(await call('/api/users/'+adminMe.user.id,'DELETE',undefined,adminCookie)).status===400);
const primaryAdmin=allUsers.users.find(account=>account.username==='admin');
if(primaryAdmin)check('主管理员账号不能被删除',(await call('/api/users/'+primaryAdmin.id,'DELETE',undefined,adminCookie)).status===400);
else console.log('SKIP :: 这个数据库里没有名为 admin 的主管理员账号');
const removedUser=await call('/api/users/'+tempUser.id,'DELETE',undefined,adminCookie);
check('可以删除账号',removedUser.status===200,JSON.stringify(await json(removedUser)));
const afterDelete=await json(await fetch(base+'/api/users',{headers:{cookie:adminCookie}}));
check('删除后账号不再出现在列表',!afterDelete.users.some(account=>account.username===tempName));
check('重复删除返回 404',(await call('/api/users/'+tempUser.id,'DELETE',undefined,adminCookie)).status===404);

console.log('权限检查：'+checks.filter(Boolean).length+'/'+checks.length+' 通过');
const failed=checks.filter(ok=>!ok).length;
process.exit(failed?1:0);