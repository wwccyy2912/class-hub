// 测试用二进制夹具：PNG 图片、极简 PDF 与 ZIP 压缩包（含 store 与 deflate 两种条目）
import zlib from 'node:zlib';
const table=(()=>{const values=new Uint32Array(256);for(let index=0;index<256;index++){let value=index;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;values[index]=value>>>0}return values})();
export function crc32(buffer){let value=0xffffffff;for(const byte of buffer)value=table[(value^byte)&0xff]^(value>>>8);return (value^0xffffffff)>>>0}
const chunk=(type,data)=>{const length=Buffer.alloc(4);length.writeUInt32BE(data.length,0);const body=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body),0);return Buffer.concat([length,body,crc])};
export function png(width=2,height=2,color=[255,80,120]){
 const raw=Buffer.alloc((width*3+1)*height);
 for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;for(let x=0;x<width;x++){const offset=y*(width*3+1)+1+x*3;raw[offset]=color[0];raw[offset+1]=color[1];raw[offset+2]=color[2]}}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export function wav(seconds=1,rate=8000,freq=440){
 const samples=Math.floor(seconds*rate),data=Buffer.alloc(samples*2);
 for(let index=0;index<samples;index++)data.writeInt16LE(Math.round(Math.sin(2*Math.PI*freq*index/rate)*12000),index*2);
 const header=Buffer.alloc(44);
 header.write('RIFF',0);header.writeUInt32LE(36+data.length,4);header.write('WAVE',8);header.write('fmt ',12);
 header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);
 header.write('data',36);header.writeUInt32LE(data.length,40);
 return Buffer.concat([header,data]);
}

// 极简但结构合法的 PDF（只用于上传/下载往返，页面内容由前端元数据描述）
export function pdf(pages=1){
 const objects=['<</Type/Catalog/Pages 2 0 R>>','<</Type/Pages/Count '+pages+'/Kids['+Array.from({length:pages},(_,index)=>(index+3)+' 0 R').join(' ')+']>>'];
 for(let index=0;index<pages;index++)objects.push('<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>');
 let text='%PDF-1.7\n';
 objects.forEach((body,index)=>{text+=(index+1)+' 0 obj\n'+body+'\nendobj\n'});
 text+='trailer\n<</Size '+(objects.length+1)+'/Root 1 0 R>>\nstartxref\n0\n%%EOF\n';
 return Buffer.from(text,'latin1');
}

export function zip(files){
 const locals=[],centrals=[];let offset=0;
 for(const file of files){
  const name=Buffer.from(file.name,'utf8'),data=Buffer.from(file.data),method=file.deflate===false?0:8;
  const stored=method===8?zlib.deflateRawSync(data):data,crc=crc32(data);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(method,8);
  local.writeUInt16LE(0,10);local.writeUInt16LE(0,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(stored.length,18);local.writeUInt32LE(data.length,22);
  local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);
  locals.push(local,name,stored);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0,8);central.writeUInt16LE(method,10);
  central.writeUInt16LE(0,12);central.writeUInt16LE(0,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(stored.length,20);central.writeUInt32LE(data.length,24);
  central.writeUInt16LE(name.length,28);central.writeUInt16LE(0,30);central.writeUInt16LE(0,32);central.writeUInt16LE(0,34);central.writeUInt16LE(0,36);
  central.writeUInt32LE(0,38);central.writeUInt32LE(offset,42);
  centrals.push(central,name);
  offset+=local.length+name.length+stored.length;
 }
 const centralBuffer=Buffer.concat(centrals),eocd=Buffer.alloc(22);
 eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(0,4);eocd.writeUInt16LE(0,6);eocd.writeUInt16LE(files.length,8);eocd.writeUInt16LE(files.length,10);
 eocd.writeUInt32LE(centralBuffer.length,12);eocd.writeUInt32LE(offset,16);eocd.writeUInt16LE(0,20);
 return Buffer.concat([...locals,centralBuffer,eocd]);
}

// 扩展媒体容器的极小夹具（只保留文件头，用于格式校验）
const pad=(size)=>Buffer.alloc(size);
export const ebml=(docType='webm')=>Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),pad(8),Buffer.from(docType,'ascii'),pad(24)]);
export const webmBytes=ebml('webm');
export const mkvBytes=ebml('matroska');
export const aviBytes=Buffer.concat([Buffer.from('RIFF'),Buffer.from([0x24,0,0,0]),Buffer.from('AVI '),pad(24)]);
export const asfBytes=Buffer.concat([Buffer.from([0x30,0x26,0xb2,0x75,0x8e,0x66,0xcf,0x11]),pad(24)]);
export const aiffBytes=Buffer.concat([Buffer.from('FORM'),Buffer.from([0,0,0,0x20]),Buffer.from('AIFF'),pad(24)]);
export const flvBytes=Buffer.concat([Buffer.from([0x46,0x4c,0x56,0x01]),pad(24)]);
export const mpegPsBytes=Buffer.concat([Buffer.from([0x00,0x00,0x01,0xba]),pad(24)]);
export const mpegTsBytes=(()=>{const bytes=Buffer.alloc(200);bytes[0]=0x47;bytes[188]=0x47;return bytes})();
export const amrBytes=Buffer.concat([Buffer.from('#!AMR\n','ascii'),pad(24)]);
export const ac3Bytes=Buffer.concat([Buffer.from([0x0b,0x77]),pad(24)]);
export const midiBytes=Buffer.concat([Buffer.from('MThd','ascii'),pad(24)]);
export const threeGpBytes=Buffer.concat([Buffer.from([0,0,0,0x18]),Buffer.from('ftyp3gp4','ascii'),pad(16)]);
export const oggBytes=Buffer.concat([Buffer.from('OggS','ascii'),pad(30)]);
