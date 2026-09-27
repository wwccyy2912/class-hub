import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFile,fileTypes,siteKinds,detectType,allowedExtensions,isImage,isVideo,isAudio,mediaMime,videoExtensions,audioExtensions} from '../src/shared/file-types.mjs';
import {png,zip,wav,ebml,webmBytes,mkvBytes,aviBytes,asfBytes,aiffBytes,flvBytes,mpegPsBytes,mpegTsBytes,amrBytes,ac3Bytes,midiBytes,threeGpBytes,oggBytes} from './fixtures.mjs';

const pdf=Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const ole=Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1,0,0,0,0]);
const docx=zip([{name:'word/document.xml',data:'<w:document/>'}]);
const jpg=Buffer.from([0xff,0xd8,0xff,0xe0,0,0x10,0x4a,0x46,0x49,0x46,0,1,0,0,1,0,1,0,0]);
const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.from([0x20,0,0,0]),Buffer.from('WEBP'),Buffer.from('VP8 '),Buffer.alloc(16)]);
const mp4=Buffer.concat([Buffer.from([0,0,0,0x18]),Buffer.from('ftypisom'),Buffer.alloc(16)]);
const webm=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.alloc(16)]);
const text=Buffer.from('# 标题\n正文 with UTF-8 中文\n','utf8');

test('三种站点类型各自的允许格式',()=>{
 assert.ok(siteKinds.files.extensions.includes('pdf')&&siteKinds.files.extensions.includes('md')&&siteKinds.files.extensions.includes('docx'));
 assert.deepEqual(siteKinds.folder.extensions,['zip']);
 assert.ok(siteKinds.gallery.extensions.includes('webp')&&siteKinds.gallery.extensions.includes('mp4')&&siteKinds.gallery.extensions.includes('png'));
 assert.ok(!siteKinds.gallery.extensions.includes('pdf'));
 assert.equal(Object.keys(siteKinds).length,3);
 assert.ok(isImage('webp')&&isVideo('mp4')&&!isVideo('webp'));
});

test('文件站点：PDF、Office、TXT、Markdown 放行，图片与压缩包被拒',()=>{
 assert.equal(validateFile(pdf,'通知.pdf','files'),'pdf');
 assert.equal(validateFile(docx,'报告.docx','files'),'docx');
 assert.equal(validateFile(ole,'表格.xls','files'),'xls');
 assert.equal(validateFile(text,'说明.txt','files'),'txt');
 assert.equal(validateFile(text,'README.md','files'),'md');
 assert.equal(validateFile(pdf,'大写.PDF','files'),'pdf','扩展名大小写不敏感');
 assert.throws(()=>validateFile(png(1,1),'图.png','files'),/不支持/);
 assert.throws(()=>validateFile(zip([{name:'a.txt',data:'hi'}]),'包.zip','files'),/不支持/);
});

test('文件夹站点只接受 ZIP',()=>{
 assert.equal(validateFile(zip([{name:'readme.txt',data:'hello'}]),'资料.zip','folder'),'zip');
 assert.throws(()=>validateFile(pdf,'a.pdf','folder'),/文件夹站点不支持/);
 assert.throws(()=>validateFile(png(1,1),'a.png','folder'),/文件夹站点不支持/);
});

test('图册站点：图片与视频放行，文档被拒',()=>{
 assert.equal(validateFile(png(2,2),'照片.png','gallery'),'png');
 assert.equal(validateFile(jpg,'照片.jpg','gallery'),'jpg');
 assert.equal(validateFile(webp,'照片.webp','gallery'),'webp');
 assert.equal(validateFile(mp4,'片段.mp4','gallery'),'mp4');
 assert.equal(validateFile(webm,'片段.webm','gallery'),'webm');
 assert.throws(()=>validateFile(pdf,'文档.pdf','gallery'),/图册站点不支持/);
 assert.throws(()=>validateFile(text,'说明.txt','gallery'),/图册站点不支持/);
});

test('图册站点支持音频（wav/mp3/ogg/flac/m4a）',()=>{
 const wavFile=wav(0.2);
 assert.equal(validateFile(wavFile,'提示音.wav','gallery'),'wav');
 assert.equal(detectType(wavFile),'wav');
 const mp3=Buffer.concat([Buffer.from([0x49,0x44,0x33,3,0,0,0,0,0,0]),Buffer.alloc(24)]);
 assert.equal(validateFile(mp3,'歌.mp3','gallery'),'mp3');
 const ogg=Buffer.concat([Buffer.from('OggS'),Buffer.alloc(30)]);
 assert.equal(validateFile(ogg,'录音.ogg','gallery'),'ogg');
 const flac=Buffer.concat([Buffer.from('fLaC'),Buffer.alloc(30)]);
 assert.equal(validateFile(flac,'无损.flac','gallery'),'flac');
 const m4a=Buffer.concat([Buffer.from([0,0,0,0x18]),Buffer.from('ftypM4A '),Buffer.alloc(16)]);
 assert.equal(validateFile(m4a,'音频.m4a','gallery'),'m4a');
 assert.ok(isAudio('mp3')&&!isAudio('mp4')&&!isAudio('png'));
 assert.throws(()=>validateFile(wavFile,'冒充.wav','files'),/不支持/,'文件站点不收音频');
 assert.throws(()=>validateFile(Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(26)]),'坏.wav','gallery'),/不匹配/);
});

test('内容与扩展名不一致、非文本内容都会被拒绝',()=>{
 assert.throws(()=>validateFile(png(1,1),'假图.jpg','gallery'),/不匹配/);
 assert.throws(()=>validateFile(new TextEncoder().encode('<html>bad'),'bad.docx','files'),/不匹配/);
 assert.throws(()=>validateFile(Buffer.from([0x50,0x4b,0x03,0x04]),'bad.pdf','files'),/不匹配/);
 assert.throws(()=>validateFile(Buffer.from([0x68,0x69,0x00,0x01]),'坏.txt','files'),/不匹配/);
 assert.throws(()=>validateFile(text,'文件.exe','files'),/仅支持/);
 assert.equal(detectType(png(1,1)),'png');
 assert.equal(detectType(mp4),'mp4');
 assert.equal(detectType(webm),'webm');
 assert.equal(allowedExtensions('nonsense').length,siteKinds.files.extensions.length,'未知类型按文件站点处理');
 assert.ok(Object.keys(fileTypes).length>=16);
});

test('新增视频容器：mkv/avi/wmv/flv/mpeg/ts/3gp/ogv 都能识别并通过校验',()=>{
 const cases=[[mkvBytes,'影片.mkv','mkv'],[aviBytes,'影片.avi','avi'],[asfBytes,'影片.wmv','wmv'],[flvBytes,'影片.flv','flv'],
  [mpegPsBytes,'影片.mpg','mpg'],[mpegTsBytes,'影片.ts','ts'],[threeGpBytes,'影片.3gp','3gp'],[oggBytes,'影片.ogv','ogv'],[webmBytes,'影片.webm','webm']];
 for(const [bytes,name,ext] of cases)assert.equal(validateFile(bytes,name,'gallery'),ext,name);
 assert.equal(detectType(mkvBytes),'mkv');
 assert.equal(detectType(webmBytes),'webm');
 assert.equal(detectType(aviBytes),'avi');
 assert.equal(detectType(asfBytes),'asf');
 assert.equal(detectType(mpegTsBytes),'ts');
});

test('新增音频格式：wma/amr/aiff/ac3/weba/mka/midi 都能识别并通过校验',()=>{
 const cases=[[asfBytes,'歌曲.wma','wma'],[amrBytes,'录音.amr','amr'],[aiffBytes,'录音.aiff','aiff'],[aiffBytes,'录音.aif','aif'],
  [ac3Bytes,'音轨.ac3','ac3'],[webmBytes,'歌曲.weba','weba'],[mkvBytes,'音轨.mka','mka'],[midiBytes,'铃声.mid','mid']];
 for(const [bytes,name,ext] of cases)assert.equal(validateFile(bytes,name,'gallery'),ext,name);
 assert.throws(()=>validateFile(asfBytes,'伪装.mp4','gallery'),/不匹配/,'容器不匹配仍会被拒绝');
 assert.throws(()=>validateFile(mkvBytes,'伪装.wav','gallery'),/不匹配/);
});

test('媒体 MIME 与媒体类型判断覆盖新格式',()=>{
 assert.equal(mediaMime('mkv'),'video/x-matroska');
 assert.equal(mediaMime('avi'),'video/x-msvideo');
 assert.equal(mediaMime('wma'),'audio/x-ms-wma');
 assert.equal(mediaMime('aiff'),'audio/aiff');
 assert.ok(isVideo('mkv')&&isVideo('avi')&&!isVideo('wma'));
 assert.ok(isAudio('wma')&&isAudio('amr')&&!isAudio('mkv'));
 assert.ok(videoExtensions.includes('mpeg')&&audioExtensions.includes('flac'));
});
