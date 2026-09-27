import test from 'node:test';
import assert from 'node:assert/strict';
import {zipEntries,readZipEntry,zipSummary} from '../src/shared/zip.mjs';
import {zip,png,crc32} from './fixtures.mjs';

test('解析 ZIP 中央目录并区分压缩方式',()=>{
 const buffer=zip([{name:'readme.txt',data:'你好，班级！',deflate:true},{name:'images/logo.png',data:png(1,1),deflate:false},{name:'docs/',data:''}]);
 const entries=zipEntries(new Uint8Array(buffer));
 assert.equal(entries.length,3);
 const readme=entries.find(entry=>entry.name==='readme.txt');
 assert.equal(readme.method,8);assert.equal(readme.directory,false);
 const logo=entries.find(entry=>entry.name==='images/logo.png');
 assert.equal(logo.method,0);
 assert.equal(entries.find(entry=>entry.name==='docs/').directory,true);
 const summary=zipSummary(entries);
 assert.equal(summary.count,2,'目录不计入文件数');
 assert.ok(summary.size>0);
});

test('取出单个条目（deflate 与 store 都能解压）',async()=>{
 const buffer=new Uint8Array(zip([{name:'a.txt',data:'第一行\n第二行',deflate:true},{name:'b.bin',data:'plain-bytes',deflate:false}]));
 const entries=zipEntries(buffer);
 const text=Buffer.from(await readZipEntry(buffer,entries.find(entry=>entry.name==='a.txt'))).toString('utf8');
 assert.equal(text,'第一行\n第二行');
 const plain=Buffer.from(await readZipEntry(buffer,entries.find(entry=>entry.name==='b.bin'))).toString('utf8');
 assert.equal(plain,'plain-bytes');
});

test('非法数据不会抛异常，返回 null',()=>{
 assert.equal(zipEntries(new Uint8Array([1,2,3,4,5])),null);
 assert.equal(zipEntries(new TextEncoder().encode('%PDF-1.4 not a zip at all')),null);
 assert.equal(crc32(Buffer.from('123456789'))>>>0,0xcbf43926);
});
