import {adminSession} from './helpers.mjs';
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const origin=base;
const call=async(path,method,body,cookie)=>fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',origin,...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
const json=async res=>{try{return await res.json()}catch(error){return {}}}
const cookie=await adminSession();
const sites=await json(await fetch(base+'/api/sites',{headers:{cookie}}));
let gallery=sites.sites.find(s=>s.kind==='gallery');
if(!gallery){const slug='big-'+Date.now().toString(36).slice(-6);const created=await call('/sites','POST',{name:'大文件视频',slug,kind:'gallery',description:'大文件测试'},cookie);if(created.status!==201){console.log('SKIP :: 无法创建图册站点：'+created.status+' '+JSON.stringify(await json(created)));process.exit(0)}gallery=(await json(await fetch(base+'/api/sites',{headers:{cookie}}))).sites.find(s=>s.slug===slug)}
if(!gallery){console.log('SKIP :: 没有可用的图册站点');process.exit(0)}
console.log('gallery',gallery.id,'slug',gallery.slug);
// 造一个 12MB 的 webm 头 + 填充
const size=12*1024*1024;
const head=Buffer.from([0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0,0,0,0,0]);
const docType=Buffer.from('webm','ascii');
const bytes=Buffer.concat([head,docType,Buffer.alloc(size-head.length-docType.length,7)]);
console.log('file size',(bytes.length/1024/1024).toFixed(1)+'MB');
const init=await call('/upload/large/init','POST',{siteId:gallery.id,title:'大视频测试',filename:'大视频.webm',size:bytes.length},cookie);
const initBody=await json(init);
console.log('init',init.status,JSON.stringify({chunkSize:initBody.chunkSize,limit:initBody.limit,hasKey:!!initBody.key}));
if(init.status!==201)process.exit(1);
const chunkSize=initBody.chunkSize,parts=[];
for(let offset=0,number=1;offset<bytes.length;offset+=chunkSize,number++){
 const slice=bytes.subarray(offset,Math.min(offset+chunkSize,bytes.length));
 const query='?key='+encodeURIComponent(initBody.key)+'&uploadId='+encodeURIComponent(initBody.uploadId)+'&part='+number+'&siteId='+encodeURIComponent(gallery.id)+'&filename='+encodeURIComponent('大视频.webm');
 const response=await fetch(base+'/api/upload/large/part'+query,{method:'POST',headers:{origin,cookie,'Content-Type':'application/octet-stream'},body:slice});
 const part=await json(response);
 if(response.status!==200){console.log('part failed',number,response.status,JSON.stringify(part));process.exit(1)}
 parts.push({partNumber:part.partNumber,etag:part.etag});
 console.log('part',number,'→',response.status,(slice.length/1024/1024).toFixed(1)+'MB');
}
const complete=await call('/upload/large/complete','POST',{key:initBody.key,uploadId:initBody.uploadId,parts,siteId:gallery.id,title:'大视频测试',filename:'大视频.webm',size:bytes.length,metadata:{duration:12.5,original:{name:'大视频.webm',type:'webm',size:bytes.length}}},cookie);
const completeBody=await json(complete);
console.log('complete',complete.status,JSON.stringify(completeBody).slice(0,120));
const docs=await json(await fetch(base+'/api/documents?site='+gallery.id,{headers:{cookie}}));
const doc=docs.documents.find(d=>d.id===completeBody.id);
console.log('document',doc&&{type:doc.file_type,size:doc.size,pages:doc.pages,duration:doc.meta&&doc.meta.duration});
const head2=await fetch(base+'/api/documents/'+completeBody.id+'/file',{headers:{cookie,Range:'bytes=0-1023'}});
console.log('range request',head2.status,head2.headers.get('content-range'),(await head2.arrayBuffer()).byteLength);
const tooBig=await call('/upload/large/init','POST',{siteId:gallery.id,title:'超大',filename:'超大.webm',size:300*1024*1024},cookie);
console.log('300MB 初始化:',tooBig.status,JSON.stringify(await tooBig.json()));
const imageTooBig=await call('/upload/large/init','POST',{siteId:gallery.id,title:'大图',filename:'大图.png',size:60*1024*1024},cookie);
console.log('60MB 图片初始化:',imageTooBig.status,JSON.stringify(await imageTooBig.json()));
const abortInit=await call('/upload/large/init','POST',{siteId:gallery.id,title:'放弃',filename:'放弃.webm',size:9*1024*1024},cookie);
const abortBody=await json(abortInit);
const aborted=await call('/upload/large/abort','POST',{key:abortBody.key,uploadId:abortBody.uploadId},cookie);
console.log('abort',aborted.status,JSON.stringify(await aborted.json()));
