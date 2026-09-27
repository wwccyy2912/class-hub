// 聊天（班级大群 + 一对一私聊）端到端检查
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const origin=base;
const adminPassword=process.env.ADMIN_PASSWORD||'E2E-Admin-Password-827!';
const pick=res=>(res.headers.getSetCookie?res.headers.getSetCookie().join('; '):res.headers.get('set-cookie'))||'';
const call=async(path,method,body,cookie)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',origin,...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
const json=async res=>{try{return await res.json()}catch(error){return {}}};
const stamp=Date.now().toString(36).slice(-6);
const checks=[];
const check=(name,ok,extra)=>{checks.push(ok);console.log((ok?'PASS':'FAIL')+' :: '+name+(extra?' :: '+String(extra).slice(0,200):''))};

// 管理员会话：优先用环境变量里的密码；网站还没初始化时先初始化
let adminCookie='';
if((await json(await fetch(base+'/api/me'))).setup){
 const ready=await call('/api/setup','POST',{school:'聊天检查中学',className:'聊天检查班',username:'chatadmin'+stamp,name:'聊天管理员',password:adminPassword,password2:adminPassword});
 check('初始化网站',ready.status===201,'status='+ready.status);
 adminCookie=pick(ready);
}else{
 let used='';
 for(const password of [adminPassword,'Local-New-Password-827!','Local-Test-Password-827!']){
  const attempt=await call('/api/login','POST',{username:process.env.ADMIN_USER||'admin',password});
  if(attempt.status===200){adminCookie=pick(attempt);used=password;break}
 }
 if(!adminCookie){console.log('SKIP :: 无法用已知密码登录管理员，跳过聊天检查（可设置 ADMIN_PASSWORD）');process.exit(0)}
 const me=await json(await fetch(base+'/api/me',{headers:{cookie:adminCookie}}));
 if(me.user&&me.user.mustChange){
  const changed=await call('/api/password','POST',{oldPassword:used,password:'Local-New-Password-827!'},adminCookie);
  if(changed.status===200){adminCookie=pick(changed)}else{console.log('SKIP :: 管理员仍需要先改初始密码（可用 ADMIN_PASSWORD 指定新密码）');process.exit(0)}
 }
}

// 准备三个账号
const makeUser=async(prefix,perm)=>{
 const username=(prefix+stamp).slice(0,20),password='Chat-'+stamp+'-Password!';
 const created=await call('/api/users','POST',{username,name:prefix.toUpperCase(),password,permissions:perm||[]},adminCookie);
 return {username,password,status:created.status};
};
const alice=await makeUser('alice'),bob=await makeUser('bob');
check('创建两个聊天账号',alice.status===201&&bob.status===201,alice.status+'/'+bob.status);
const signIn=async(account)=>{const r=await call('/api/login','POST',{username:account.username,password:account.password});let cookie=pick(r);const me=await json(await fetch(base+'/api/me',{headers:{cookie}}));if(me.user&&me.user.mustChange){cookie=pick(await call('/api/password','POST',{oldPassword:account.password,password:account.password.slice(0,-1)+'X'},cookie))}return cookie};
let aliceCookie=await signIn(alice),bobCookie=await signIn(bob);
check('两个账号都能登录',!!aliceCookie&&!!bobCookie);

// 班级大群
const rooms=await json(await fetch(base+'/api/chat/rooms',{headers:{cookie:aliceCookie}}));
const group=rooms.rooms.find(room=>room.room==='class');
check('大群出现在会话列表',!!group&&group.kind==='group','rooms='+rooms.rooms.length);
const sent=await call('/api/chat/messages','POST',{room:'class',body:'大家好，这是第一条群消息'},aliceCookie);
check('在大群发送消息',sent.status===201,'status='+sent.status);
const bobView=await json(await fetch(base+'/api/chat/rooms',{headers:{cookie:bobCookie}}));
const bobGroup=bobView.rooms.find(room=>room.room==='class');
check('另一位同学看到未读',bobGroup&&bobGroup.unread>=1&&/第一条群消息/.test(bobGroup.last?bobGroup.last.body:''),JSON.stringify(bobGroup&&{unread:bobGroup.unread,last:bobGroup.last&&bobGroup.last.body}));
const bobMessages=await json(await fetch(base+'/api/chat/messages?room=class',{headers:{cookie:bobCookie}}));
check('另一位同学可以读到群消息',bobMessages.messages.some(message=>message.body==='大家好，这是第一条群消息'&&message.senderName),'count='+bobMessages.messages.length);
const lastId=bobMessages.messages[bobMessages.messages.length-1].created;
await call('/api/chat/read','POST',{room:'class',at:lastId},bobCookie);
const afterRead=await json(await fetch(base+'/api/chat/rooms',{headers:{cookie:bobCookie}}));
check('标记已读后未读清零',afterRead.rooms.find(room=>room.room==='class').unread===0,'unread='+afterRead.rooms.find(room=>room.room==='class').unread);
const unread=await json(await fetch(base+'/api/chat/unread',{headers:{cookie:bobCookie}}));
check('未读汇总接口可用',typeof unread.unread==='number','unread='+unread.unread);
const incremental=await json(await fetch(base+'/api/chat/messages?room=class&after='+lastId,{headers:{cookie:bobCookie}}));
check('增量拉取不重复旧消息',incremental.messages.length===0,'count='+incremental.messages.length);

// 一对一私聊
const directory=await json(await fetch(base+'/api/users',{headers:{cookie:adminCookie}}));
const bobId=(directory.users.find(account=>account.username===bob.username)||{}).id;
const people=await json(await fetch(base+'/api/chat/rooms',{headers:{cookie:aliceCookie}}));
const aliceToBob=people.rooms.find(room=>room.kind==='direct'&&room.userId===bobId);
check('会话列表里有和同学的私聊',!!aliceToBob,aliceToBob&&aliceToBob.room);
const directSent=await call('/api/chat/messages','POST',{room:aliceToBob.room,body:'悄悄话：明天值日'},aliceCookie);
check('发送私聊消息',directSent.status===201,'status='+directSent.status);
const bobDirect=await json(await fetch(base+'/api/chat/messages?room='+encodeURIComponent(aliceToBob.room),{headers:{cookie:bobCookie}}));
check('对方能看到私聊消息',bobDirect.messages.some(message=>message.body==='悄悄话：明天值日'));
const carol=await makeUser('carol');
const carolCookie=await signIn(carol);
const intruder=await call('/api/chat/messages','POST',{room:aliceToBob.room,body:'偷看'},carolCookie);
check('第三者不能往别人的私聊里发消息',intruder.status===404||intruder.status===403,'status='+intruder.status);
const intruderRead=await fetch(base+'/api/chat/messages?room='+encodeURIComponent(aliceToBob.room),{headers:{cookie:carolCookie}});
check('第三者读不到别人的私聊',intruderRead.status===404||intruderRead.status===403,'status='+intruderRead.status);
const groupStill=await json(await fetch(base+'/api/chat/messages?room=class',{headers:{cookie:carolCookie}}));
check('第三者仍能看班级大群',Array.isArray(groupStill.messages));

// 校验与限制
check('空消息被拒',(await call('/api/chat/messages','POST',{room:'class',body:'   '},aliceCookie)).status===400);
check('超长消息被拒',(await call('/api/chat/messages','POST',{room:'class',body:'x'.repeat(501)},aliceCookie)).status===400);
check('不存在的会话被拒',(await call('/api/chat/messages','POST',{room:'dm:zzz:yyy',body:'hi'},aliceCookie)).status===400||(await call('/api/chat/messages','POST',{room:'dm:zzz:yyy',body:'hi'},aliceCookie)).status===404);
let throttled=0;
for(let index=0;index<40;index++){const result=await call('/api/chat/messages','POST',{room:'class',body:'压力测试 '+index},bobCookie);if(result.status===429){throttled=1;break}}
check('发送过快会被限流',throttled===1,'第一次 429 出现在 '+(throttled?'40 条内':'未出现'));

// 删除：自己的可以删，别人的只有管理员能删
const mine=await json(await call('/api/chat/messages','POST',{room:'class',body:'这条我会删掉'},aliceCookie));
check('删除自己的消息',(await call('/api/chat/messages/'+mine.message.id,'DELETE',undefined,aliceCookie)).status===200);
const carolMessage=await json(await call('/api/chat/messages','POST',{room:'class',body:'这条由管理员删除'},carolCookie));
check('另一位同学发送了消息',!!(carolMessage.message&&carolMessage.message.id),JSON.stringify(carolMessage).slice(0,80));
const notMine=await call('/api/chat/messages/'+(carolMessage.message||{}).id,'DELETE',undefined,aliceCookie);
check('删除别人的消息被拒',notMine.status===403,'status='+notMine.status);
const byAdmin=await call('/api/chat/messages/'+(carolMessage.message||{}).id,'DELETE',undefined,adminCookie);
check('管理员可以删除别人的消息',byAdmin.status===200,'status='+byAdmin.status);


// —— 禁言（大群 / 私聊 分开）——
const aliceId=(await json(await fetch(base+'/api/users',{headers:{cookie:adminCookie}}))).users.find(account=>account.username===alice.username).id;
const alicePassword=alice.password.slice(0,-1)+'X';
const reloginAlice=async()=>{const r=await call('/api/login','POST',{username:alice.username,password:alicePassword});return pick(r)};
check('管理员可以只禁言大群',(await call('/api/users/'+aliceId,'PATCH',{muteGroup:true,role:'member',disabled:false},adminCookie)).status===200);
aliceCookie=await reloginAlice();
const mutedMe=await json(await fetch(base+'/api/me',{headers:{cookie:aliceCookie}}));
check('被禁言的账号能看到自己的状态',mutedMe.user.muteGroup===true&&mutedMe.user.muteDirect===false,JSON.stringify({group:mutedMe.user.muteGroup,direct:mutedMe.user.muteDirect}));
check('大群发言被拦',(await call('/api/chat/messages','POST',{room:'class',body:'禁言后还能发吗'},aliceCookie)).status===403);
check('私聊仍然可以发言',(await call('/api/chat/messages','POST',{room:aliceToBob.room,body:'私聊不受影响'},aliceCookie)).status===201);
check('再禁言私聊',(await call('/api/users/'+aliceId,'PATCH',{muteDirect:true,muteGroup:true},adminCookie)).status===200);
aliceCookie=await reloginAlice();
check('私聊发言也被拦',(await call('/api/chat/messages','POST',{room:aliceToBob.room,body:'禁言私聊后'},aliceCookie)).status===403);
check('解除禁言',(await call('/api/users/'+aliceId,'PATCH',{muteGroup:false,muteDirect:false},adminCookie)).status===200);
aliceCookie=await reloginAlice();
check('解除后可以正常发言',(await call('/api/chat/messages','POST',{room:'class',body:'解禁了'},aliceCookie)).status===201);

// —— 附件（图片 / 文件）——
const pngBytes=Buffer.from('89504e470d0a1a0a0000000d49484452000000020000000208020000004a6c9a3a0000000a4944415408d763f8cfc000000301010018dd8db10000000049454e44ae426082','hex');
const uploadMessage=await (async()=>{
 const form=new FormData();
 form.set('room','class');form.set('body','这是今天的值日表');form.set('file',new File([pngBytes],'值日表.png',{type:'image/png'}));
 const response=await fetch(base+'/api/chat/messages',{method:'POST',headers:{origin,cookie:aliceCookie},body:form});
 return {status:response.status,data:await response.json().catch(()=>({}))};
})();
check('可以发送图片附件',uploadMessage.status===201&&uploadMessage.data.message.attachment&&uploadMessage.data.message.attachment.type==='png',JSON.stringify(uploadMessage.data.message&&uploadMessage.data.message.attachment));
const attachmentId=uploadMessage.data.message.id;
const fetched=await fetch(base+'/api/chat/attachments/'+attachmentId,{headers:{cookie:bobCookie}});
check('同会话的人可以下载附件',fetched.status===200&&/image\/png/.test(fetched.headers.get('content-type')||''),'status='+fetched.status+' type='+fetched.headers.get('content-type'));
const outsiderFile=await fetch(base+'/api/chat/attachments/'+uploadMessage.data.message.id,{headers:{cookie:carolCookie}});
check('大群附件对所有人可见',outsiderFile.status===200,'status='+outsiderFile.status);
const directForm=new FormData();
directForm.set('room',aliceToBob.room);directForm.set('body','私聊里的小文件');
directForm.set('file',new File([Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n')],'说明.pdf',{type:'application/pdf'}));
const directUpload=await (async()=>{const response=await fetch(base+'/api/chat/messages',{method:'POST',headers:{origin,cookie:aliceCookie},body:directForm});return {status:response.status,data:await response.json().catch(()=>({}))}})();
check('可以发送文件附件',directUpload.status===201&&/说明.pdf/.test(JSON.stringify(directUpload.data)),'status='+directUpload.status);
const intruderFile=await fetch(base+'/api/chat/attachments/'+directUpload.data.message.id,{headers:{cookie:carolCookie}});
check('私聊附件第三者拿不到',intruderFile.status===404,'status='+intruderFile.status);
const badType=new FormData();
badType.set('room','class');badType.set('body','可执行文件');
badType.set('file',new File([Buffer.from('MZ\u0000\u0000binary')],'bad.exe',{type:'application/octet-stream'}));
const badUpload=await fetch(base+'/api/chat/messages',{method:'POST',headers:{origin,cookie:aliceCookie},body:badType});
check('不支持的附件类型被拒',badUpload.status===400,'status='+badUpload.status);

// —— @ 提醒 ——
const mentionText='@'+'BOB'+' 明天带跳绳';
const mentionMessage=await json(await call('/api/chat/messages','POST',{room:'class',body:mentionText},aliceCookie));
check('发送带 @ 的消息',mentionMessage.message&&mentionMessage.message.mentions.length>=1,JSON.stringify(mentionMessage.message&&mentionMessage.message.mentions.length));
const bobUnread=await json(await fetch(base+'/api/chat/unread',{headers:{cookie:bobCookie}}));
check('被 @ 的人看到提醒计数',bobUnread.mentions>=1,'mentions='+bobUnread.mentions);
const bobRooms=await json(await fetch(base+'/api/chat/rooms',{headers:{cookie:bobCookie}}));
check('会话列表里标出 @ 数量',bobRooms.rooms.find(room=>room.room==='class').mentions>=1,JSON.stringify(bobRooms.rooms.find(room=>room.room==='class').mentions));
await call('/api/chat/read','POST',{room:'class',at:Date.now()},bobCookie);
check('已读后 @ 计数清零',(await json(await fetch(base+'/api/chat/unread',{headers:{cookie:bobCookie}}))).mentions===0);

// —— 撤回时限 ——
check('关闭撤回（0 分钟）',(await call('/api/settings','PATCH',{chatRecall:0},adminCookie)).status===200);
const recent=await json(await call('/api/chat/messages','POST',{room:'class',body:'这条想撤回'},aliceCookie));
check('时限为 0 时自己不能撤回',(await call('/api/chat/messages/'+recent.message.id,'DELETE',undefined,aliceCookie)).status===403);
check('管理员仍然可以删除',(await call('/api/chat/messages/'+recent.message.id,'DELETE',undefined,adminCookie)).status===200);
check('恢复撤回时限',(await call('/api/settings','PATCH',{chatRecall:10},adminCookie)).status===200);
const recallable=await json(await call('/api/chat/messages','POST',{room:'class',body:'这条可以撤回'},aliceCookie));
check('时限内可以撤回自己的消息',(await call('/api/chat/messages/'+recallable.message.id,'DELETE',undefined,aliceCookie)).status===200);
check('撤回时限参数校验',(await call('/api/settings','PATCH',{chatRecall:5000},adminCookie)).status===400);

// —— 自动清理 ——
check('保存保存天数设置',(await call('/api/settings','PATCH',{chatRetention:30},adminCookie)).status===200);
const cleanupFar=await json(await call('/api/chat/cleanup','POST',{hours:8760},adminCookie));
check('手动清理（远期窗口）不会误删',cleanupFar.removed===0,JSON.stringify(cleanupFar));
const purgeTarget=await json(await call('/api/chat/messages','POST',{room:'class',body:'这条会被清理'},aliceCookie));
const purgeForm=new FormData();
purgeForm.set('room','class');purgeForm.set('body','带附件的旧消息');
purgeForm.set('file',new File([pngBytes],'将被清理.png',{type:'image/png'}));
const purgeAttachment=await (async()=>{const response=await fetch(base+'/api/chat/messages',{method:'POST',headers:{origin,cookie:aliceCookie},body:purgeForm});return await response.json()})();
check('准备一条带附件的消息',!!(purgeAttachment.message&&purgeAttachment.message.id));
await new Promise(resolve=>setTimeout(resolve,2600));
const cleaned=await json(await call('/api/chat/cleanup','POST',{hours:0.0005},adminCookie));
check('清理会删除过期消息',cleaned.removed>=2,'removed='+cleaned.removed);
const goneAttachment=await fetch(base+'/api/chat/attachments/'+purgeAttachment.message.id,{headers:{cookie:aliceCookie}});
check('清理时一起删除附件',goneAttachment.status===404,'status='+goneAttachment.status);
check('清理参数校验',(await call('/api/chat/cleanup','POST',{hours:99999},adminCookie)).status===400);

console.log('聊天检查：'+checks.filter(Boolean).length+'/'+checks.length+' 通过');
process.exit(checks.filter(ok=>!ok).length?1:0);