export const fileTypes={
 pdf:{label:'PDF',mime:'application/pdf'},
 doc:{label:'Word',mime:'application/msword'},
 docx:{label:'Word',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
 xls:{label:'Excel',mime:'application/vnd.ms-excel'},
 xlsx:{label:'Excel',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
 ppt:{label:'PowerPoint',mime:'application/vnd.ms-powerpoint'},
 pptx:{label:'PowerPoint',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
 txt:{label:'文本',mime:'text/plain; charset=utf-8'},
 md:{label:'Markdown',mime:'text/markdown; charset=utf-8'},
 zip:{label:'压缩包',mime:'application/zip'},
 jpg:{label:'图片',mime:'image/jpeg'},jpeg:{label:'图片',mime:'image/jpeg'},png:{label:'图片',mime:'image/png'},
 gif:{label:'动图',mime:'image/gif'},webp:{label:'图片',mime:'image/webp'},bmp:{label:'图片',mime:'image/bmp'},avif:{label:'图片',mime:'image/avif'},
 mp4:{label:'视频',mime:'video/mp4'},m4v:{label:'视频',mime:'video/x-m4v'},mov:{label:'视频',mime:'video/quicktime'},webm:{label:'视频',mime:'video/webm'},
 mkv:{label:'视频',mime:'video/x-matroska'},avi:{label:'视频',mime:'video/x-msvideo'},wmv:{label:'视频',mime:'video/x-ms-wmv'},
 flv:{label:'视频',mime:'video/x-flv'},mpg:{label:'视频',mime:'video/mpeg'},mpeg:{label:'视频',mime:'video/mpeg'},
 ts:{label:'视频',mime:'video/mp2t'},m2ts:{label:'视频',mime:'video/mp2t'},'3gp':{label:'视频',mime:'video/3gpp'},ogv:{label:'视频',mime:'video/ogg'},
 mp3:{label:'音频',mime:'audio/mpeg'},m4a:{label:'音频',mime:'audio/mp4'},m4b:{label:'音频',mime:'audio/mp4'},aac:{label:'音频',mime:'audio/aac'},
 wav:{label:'音频',mime:'audio/wav'},ogg:{label:'音频',mime:'audio/ogg'},oga:{label:'音频',mime:'audio/ogg'},opus:{label:'音频',mime:'audio/opus'},
 flac:{label:'音频',mime:'audio/flac'},weba:{label:'音频',mime:'audio/webm'},mka:{label:'音频',mime:'audio/x-matroska'},
 wma:{label:'音频',mime:'audio/x-ms-wma'},amr:{label:'音频',mime:'audio/amr'},aif:{label:'音频',mime:'audio/aiff'},
 aiff:{label:'音频',mime:'audio/aiff'},ac3:{label:'音频',mime:'audio/ac3'},mid:{label:'音频',mime:'audio/midi'}
};
export const imageExtensions=['jpg','jpeg','png','gif','webp','bmp','avif'];
export const videoExtensions=['mp4','m4v','mov','webm','mkv','avi','wmv','flv','mpg','mpeg','ts','m2ts','3gp','ogv'];
export const audioExtensions=['mp3','m4a','m4b','aac','wav','ogg','oga','opus','flac','weba','mka','wma','amr','aif','aiff','ac3','mid'];
export const officeExtensions=['doc','docx','xls','xlsx','ppt','pptx'];
export const textExtensions=['txt','md'];
export const siteKinds={
 files:{label:'文件站点',badge:'文件',hint:'PDF、Office、TXT、Markdown；除 Office 外都能在线预览',extensions:['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md']},
 folder:{label:'文件夹站点',badge:'文件夹',hint:'上传 ZIP 压缩包，成员可以在线浏览压缩包里的文件',extensions:['zip']},
 gallery:{label:'图册站点',badge:'媒体',hint:'图片、视频与音频；图片上传时自动转 WEBP、下载时自动转 PNG，音视频在自带播放器里播放（支持进度、倍速、循环、画中画、播放列表），浏览器无法解码的格式可以直接下载',extensions:[...imageExtensions,...videoExtensions,...audioExtensions]}
};
export const kindOf=kind=>siteKinds[kind]?kind:'files';
export const allowedExtensions=kind=>siteKinds[kindOf(kind)].extensions;
export const isImage=ext=>imageExtensions.includes(ext);
export const isVideo=ext=>videoExtensions.includes(ext);
export const isAudio=ext=>audioExtensions.includes(ext);
export const mediaMime=ext=>fileTypes[ext]?.mime||'';
// 上传体积上限：视频/音频 200 MB，图片与文档 20 MB（与服务端一致）
export const uploadLimits={video:200*1024*1024,audio:200*1024*1024,image:20*1024*1024,document:20*1024*1024,archive:20*1024*1024};
export function uploadLimitFor(kind,ext){const site=kindOf(kind);if(site==='gallery'){if(isVideo(ext))return uploadLimits.video;if(isAudio(ext))return uploadLimits.audio;return uploadLimits.image}if(site==='folder')return uploadLimits.archive;return uploadLimits.document}
export const limitText=bytes=>Math.round(Number(bytes||0)/1024/1024)+' MB';
export const chunkSize=8*1024*1024;
export const canPreview=ext=>ext==='pdf'||textExtensions.includes(ext);
export function extension(name){return String(name).split('.').at(-1).toLowerCase()}
const starts=(bytes,signature)=>signature.every((value,index)=>bytes[index]===value);
const ascii=(bytes,start,end)=>String.fromCharCode(...bytes.subarray(start,end));
const ebml=bytes=>starts(bytes,[0x1a,0x45,0xdf,0xa3]);
const ebmlKind=bytes=>{const head=bytes.subarray(0,Math.min(bytes.length,64));for(let i=0;i<head.length-4;i++){const tag=ascii(head,i,i+4);if(tag==='webm')return 'webm';if(tag==='matr')return 'mkv'}return 'webm'};
export function detectType(bytes){
 const head=bytes.subarray(0,16);
 if(starts(head,[0x25,0x50,0x44,0x46,0x2d]))return 'pdf';
 if(starts(head,[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))return 'ole';
 if(starts(head,[0x50,0x4b])&&[3,5,7].includes(head[2])&&[4,6,8].includes(head[3]))return 'zip';
 if(starts(head,[0xff,0xd8,0xff]))return 'jpg';
 if(starts(head,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))return 'png';
 if(starts(head,[0x47,0x49,0x46,0x38]))return 'gif';
 if(starts(head,[0x42,0x4d]))return 'bmp';
 if(ebml(bytes))return ebmlKind(bytes);
 if(starts(head,[0x52,0x49,0x46,0x46])&&ascii(head,8,12)==='WEBP')return 'webp';
 if(starts(head,[0x52,0x49,0x46,0x46])&&ascii(head,8,12)==='WAVE')return 'wav';
 if(starts(head,[0x52,0x49,0x46,0x46])&&ascii(head,8,12)==='AVI ')return 'avi';
 if(ascii(head,0,4)==='FORM'&&['AIFF','AIFC'].includes(ascii(head,8,12)))return 'aiff';
 if(starts(head,[0x30,0x26,0xb2,0x75,0x8e,0x66,0xcf,0x11]))return 'asf';
 if(starts(head,[0x46,0x4c,0x56,0x01]))return 'flv';
 if(starts(head,[0x00,0x00,0x01,0xba]))return 'mpeg';
 if(head[0]===0x47&&bytes.length>189&&bytes[188]===0x47)return 'ts';
 if(starts(head,[0x23,0x21,0x41,0x4d,0x52]))return 'amr';
 if(starts(head,[0x0b,0x77]))return 'ac3';
 if(starts(head,[0x4f,0x67,0x67,0x53]))return 'ogg';
 if(starts(head,[0x66,0x4c,0x61,0x43]))return 'flac';
 if(starts(head,[0x4d,0x54,0x68,0x64]))return 'mid';
 if(starts(head,[0x49,0x44,0x33])||(head[0]===0xff&&(head[1]&0xe0)===0xe0))return 'mp3';
 if(ascii(head,4,8)==='ftyp'){
  const brand=ascii(head,8,12);
  if(['avif','avis','mif1','msf1','heic','heix','hevc','heim'].includes(brand))return 'avif';
  if(['M4A ','M4B '].includes(brand))return 'm4a';
  if(brand.startsWith('3g'))return '3gp';
  return 'mp4';
 }
 return '';
}
export function looksLikeText(bytes){
 if(!bytes.length)return false;
 const sample=bytes.subarray(0,Math.min(bytes.length,4096));
 for(const value of sample)if(value===0)return false;
 try{new TextDecoder('utf-8',{fatal:true}).decode(sample);return true}catch{return false}
}
// 扩展名 → 允许的文件头类型（每个条目可以对应多种头部）
const signatures={
 pdf:['pdf'],doc:['ole'],xls:['ole'],ppt:['ole'],docx:['zip'],xlsx:['zip'],pptx:['zip'],zip:['zip'],
 jpg:['jpg'],jpeg:['jpg'],png:['png'],gif:['gif'],webp:['webp'],bmp:['bmp'],avif:['avif'],
 mp4:['mp4'],m4v:['mp4'],mov:['mp4'],'3gp':['3gp'],mkv:['mkv','webm'],webm:['webm','mkv'],avi:['avi'],
 wmv:['asf'],flv:['flv'],mpg:['mpeg'],mpeg:['mpeg'],ts:['ts','mpeg'],m2ts:['ts'],ogv:['ogg'],
 mp3:['mp3'],m4a:['m4a','mp4'],m4b:['m4a','mp4'],aac:['m4a','mp4'],wav:['wav'],ogg:['ogg'],oga:['ogg'],
 opus:['ogg'],flac:['flac'],weba:['webm','mkv'],mka:['mkv','webm'],wma:['asf'],amr:['amr'],aif:['aiff'],aiff:['aiff'],ac3:['ac3'],mid:['mid']
};
export function validateFile(bytes,name,kind='files'){
 const site=kindOf(kind),ext=extension(name),allowed=allowedExtensions(site);
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(!fileTypes[ext])throw Error('仅支持 '+allowed.join('、')+' 格式');
 if(!allowed.includes(ext))throw Error(siteKinds[site].label+'不支持 '+ext.toUpperCase()+' 格式（可用：'+allowed.join('、')+'）');
 const detected=detectType(data);
 const ok=textExtensions.includes(ext)?looksLikeText(data):(signatures[ext]||[]).includes(detected);
 if(!ok)throw Error('文件内容与扩展名不匹配，请选择有效文件');
 return ext;
}
