import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {request,raw,adminSession} from './helpers.mjs';
const cookie=await adminSession();
const file=await fs.readFile('tests/fixtures/class-note.docx');
const slug='o'+Date.now().toString(36);
const site=await request('/sites',{method:'POST',cookie,body:{name:'Office 测试站点',slug,description:'临时站点'}});assert.equal(site.status,201,JSON.stringify(site.data));
const form=new FormData();form.set('file',new File([file],'班级资料.docx'));form.set('title','Office 原件检查');form.set('siteId',site.data.site.id);form.set('metadata',JSON.stringify({pages:0,items:[],mode:'original'}));
let response=await request('/upload',{method:'POST',cookie,body:form});assert.equal(response.status,201,JSON.stringify(response.data));const id=response.data.id;
const list=await request('/documents',{cookie});const d=list.data.documents.find(x=>x.id===id);
assert.equal(d.file_type,'docx');assert.equal(d.mode,'original');assert.equal(d.pages,0);assert.deepEqual(d.outline,[]);
response=await request('/documents/'+id+'/file',{cookie});assert.match(response.headers.get('content-disposition'),/^attachment/);assert.match(response.headers.get('content-type'),/wordprocessingml/);assert.deepEqual(Buffer.from(response.data),file);
for(const path of ['/pdf-assets/cmaps/Adobe-GB1-UCS2.bcmap','/pdf-assets/standard_fonts/LiberationSans-Regular.ttf','/pdf-assets/wasm/openjpeg.wasm']){const asset=await raw(path);assert.equal(asset.status,200,path)}
assert.equal((await request('/documents/'+id+'/file')).status,401);
console.log('PASS: Office original upload/download integrity, forced attachment, metadata, access restrictions, PDF font and image resources.');
