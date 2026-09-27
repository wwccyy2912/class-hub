// 生成站点图标（PNG / ICO / SVG）。全部用几何图形绘制，不依赖字体，保证 Firefox 与 Chrome 显示一致。
import fs from 'node:fs/promises';
import zlib from 'node:zlib';

const crcTable=(()=>{const table=new Uint32Array(256);for(let index=0;index<256;index++){let value=index;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;table[index]=value>>>0}return table})();
const crc32=buffer=>{let value=0xffffffff;for(const byte of buffer)value=crcTable[(value^byte)&0xff]^(value>>>8);return (value^0xffffffff)>>>0};

function png(width,height,rgba){
 const raw=Buffer.alloc((width*4+1)*height);
 for(let y=0;y<height;y++){raw[y*(width*4+1)]=0;rgba.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4)}
 const chunk=(type,data)=>{const length=Buffer.alloc(4);length.writeUInt32BE(data.length,0);const body=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body),0);return Buffer.concat([length,body,crc])};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}

// 圆角方块 + 白色“1”（几何绘制，4×4 超采样做抗锯齿）
function draw(size){
 const rgba=Buffer.alloc(size*size*4),samples=4,radius=size*0.22;
 const inside=(x,y)=>{ // 圆角矩形
  const left=size*0.06,top=size*0.06,right=size*0.94,bottom=size*0.94,r=radius;
  const cx=Math.min(Math.max(x,left+r),right-r),cy=Math.min(Math.max(y,top+r),bottom-r);
  return Math.hypot(x-cx,y-cy)<=r;
 };
 const glyph=(x,y)=>{ // 数字 1：立柱 + 斜起笔 + 底座
  const barLeft=size*0.44,barRight=size*0.58,barTop=size*0.24,barBottom=size*0.74;
  if(x>=barLeft&&x<=barRight&&y>=barTop&&y<=barBottom)return true;
  const flagTop=size*0.24,flagBottom=size*0.34,flagLeft=size*0.28,flagRight=barLeft;
  if(y>=flagTop&&y<=flagBottom){const shift=(y-flagTop)/(flagBottom-flagTop)*(barLeft-flagLeft);if(x>=flagLeft+shift-size*0.02&&x<=barRight)return true}
  const baseTop=size*0.74,baseBottom=size*0.8;
  if(y>=baseTop&&y<=baseBottom&&x>=size*0.3&&x<=size*0.7)return true;
  return false;
 };
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let cover=0,ink=0;
  for(let sy=0;sy<samples;sy++)for(let sx=0;sx<samples;sx++){
   const px=x+(sx+0.5)/samples,py=y+(sy+0.5)/samples;
   if(!inside(px,py))continue;
   cover++;
   if(glyph(px,py))ink++;
  }
  const total=samples*samples,alpha=cover/total,white=cover?ink/cover:0,offset=(y*size+x)*4;
  if(alpha<=0){rgba[offset]=0;rgba[offset+1]=0;rgba[offset+2]=0;rgba[offset+3]=0;continue}
  const top=[47,109,246],bottom=[27,70,168],blend=y/size;
  const red=Math.round(top[0]*(1-blend)+bottom[0]*blend),green=Math.round(top[1]*(1-blend)+bottom[1]*blend),blue=Math.round(top[2]*(1-blend)+bottom[2]*blend);
  const r=Math.round(red*(1-white)+255*white),g=Math.round(green*(1-white)+255*white),b=Math.round(blue*(1-white)+255*white);
  rgba[offset]=r;rgba[offset+1]=g;rgba[offset+2]=b;rgba[offset+3]=Math.round(alpha*255);
 }
 return rgba;
}

function ico(images){
 const header=Buffer.alloc(6);header.writeUInt16LE(0,0);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);
 let offset=6+images.length*16;const entries=[];
 for(const image of images){const entry=Buffer.alloc(16);entry[0]=image.size>=256?0:image.size;entry[1]=image.size>=256?0:image.size;entry[2]=0;entry[3]=0;entry.writeUInt16LE(1,4);entry.writeUInt16LE(32,6);entry.writeUInt32LE(image.data.length,8);entry.writeUInt32LE(offset,12);entries.push(entry);offset+=image.data.length}
 return Buffer.concat([header,...entries,...images.map(image=>image.data)]);
}

const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="班级网站图标">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6df6"/><stop offset="1" stop-color="#1b46a8"/></linearGradient></defs>
<rect x="4" y="4" width="56" height="56" rx="14" fill="url(#g)"/>
<path d="M18 22 L28 15 L28 21 L37 21 L37 47 L27 47 L27 29 L19 32 Z" fill="#fff"/>
<rect x="19" y="47" width="26" height="4" rx="2" fill="#fff"/>
</svg>
`;

await fs.mkdir('generated/icons',{recursive:true});
const sizes=[16,32,48,180,192,512];
for(const size of sizes){
 const file=size===180?'apple-touch-icon.png':'icon-'+size+'.png';
 await fs.writeFile('generated/icons/'+file,png(size,size,draw(size)));
}
const small=[[16,'icon-16.png'],[32,'icon-32.png'],[48,'icon-48.png']];
await fs.writeFile('generated/icons/favicon.ico',ico(await Promise.all(small.map(async([size,file])=>({size,data:await fs.readFile('generated/icons/'+file)})))));
await fs.writeFile('generated/icons/icon.svg',svg);
console.log('图标已生成：'+sizes.map(size=>size+'px').join(' / ')+' + favicon.ico + icon.svg');
