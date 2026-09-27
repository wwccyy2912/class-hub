// 压缩包读取：解析中央目录无需解压，取单个条目时用 DecompressionStream 解压（浏览器与 Worker 通用）。
const EOCD=0x06054b50,CENTRAL=0x02014b50,LOCAL=0x04034b50;
export function zipEntries(bytes){
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(data.length<22)return null;
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
 let eocd=-1;
 for(let index=data.length-22;index>=Math.max(0,data.length-66000);index--){if(view.getUint32(index,true)===EOCD){eocd=index;break}}
 if(eocd<0)return null;
 const count=view.getUint16(eocd+10,true),start=view.getUint32(eocd+16,true);
 if(count===0xffff||start>=data.length)return null;
 const entries=[];
 let offset=start;
 for(let index=0;index<count;index++){
  if(offset+46>data.length||view.getUint32(offset,true)!==CENTRAL)return entries.length?entries:null;
  const method=view.getUint16(offset+10,true),compressed=view.getUint32(offset+20,true),size=view.getUint32(offset+24,true);
  const nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true);
  const localOffset=view.getUint32(offset+42,true);
  const name=new TextDecoder('utf-8').decode(data.subarray(offset+46,offset+46+nameLength));
  if(name.length<=300&&localOffset<data.length)entries.push({name,method,compressed,size,offset:localOffset,directory:name.endsWith('/')});
  offset+=46+nameLength+extraLength+commentLength;
 }
 return entries;
}
export async function readZipEntry(bytes,entry){
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
 const offset=entry.offset;
 if(view.getUint32(offset,true)!==LOCAL)throw Error('压缩包结构异常');
 const nameLength=view.getUint16(offset+26,true),extraLength=view.getUint16(offset+28,true);
 const start=offset+30+nameLength+extraLength,length=entry.compressed||0;
 if(start+length>data.length)throw Error('压缩包数据不完整');
 const chunk=data.subarray(start,start+length);
 if(entry.method===0)return chunk.slice();
 if(entry.method!==8)throw Error('不支持的压缩方式（仅支持 store/deflate）');
 const stream=new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}
export function zipSummary(entries){
 const files=(entries||[]).filter(entry=>!entry.directory);
 return {count:files.length,size:files.reduce((sum,entry)=>sum+entry.size,0)};
}
