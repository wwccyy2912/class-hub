import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
await fs.mkdir('generated',{recursive:true});
await import('./icons.mjs');
// PDF 资源（cmaps / 标准字体 / wasm）只在打开 PDF 时按需取用：这里压成 gzip + base64，Worker 首次用到时再解压。
const resources={};
for(const folder of ['cmaps','standard_fonts','wasm'])for(const file of await fs.readdir('node_modules/pdfjs-dist/'+folder)){if(!/\.(bcmap|ttf|pfb|wasm|js)$/.test(file)&&!file.startsWith('LICENSE'))continue;resources[folder+'/'+file]=(await fs.readFile('node_modules/pdfjs-dist/'+folder+'/'+file)).toString('base64')}
await fs.writeFile('generated/pdf-resources.gz.txt',zlib.gzipSync(Buffer.from(JSON.stringify(resources),'utf8'),{level:9}).toString('base64'));
// PDF.js 源码按需压缩（体积约减半），仍然作为文本随 Worker 一起发布
const minified=new Map();
const minifyJs=async file=>{if(minified.has(file))return minified.get(file);const out=await build({stdin:{contents:await fs.readFile(file,'utf8'),loader:'js',sourcefile:file},bundle:false,minify:true,write:false,charset:'utf8',legalComments:'none'});const text=out.outputFiles[0].text;minified.set(file,text);return text};
// 客户端：minify + UTF-8 输出（不再把中文转成 \uXXXX 转义，包更小）
await build({entryPoints:['src/client/client.mjs'],bundle:true,format:'esm',outfile:'generated/app.txt',minify:true,charset:'utf8',external:['/pdf.mjs']});
// 静态资源指纹：HTML 里带上 ?v=hash，静态资源即可长期缓存（immutable）
// CSS 压缩：Worker 内联与静态路由都用压缩后的版本（源文件保持可读）
const cssMinified=(await build({stdin:{contents:await fs.readFile('assets/style.css','utf8'),loader:'css',sourcefile:'style.css'},minify:true,write:false,charset:'utf8'})).outputFiles[0].text;
await fs.writeFile('generated/style.min.css',cssMinified);
const stamp=text=>createHash('sha256').update(text).digest('hex').slice(0,8);
const stampBuffer=buffer=>createHash('sha256').update(buffer).digest('hex').slice(0,8);
const iconFiles=['favicon.ico','icon.svg','icon-16.png','icon-32.png','icon-48.png','icon-192.png','icon-512.png','apple-touch-icon.png'];
const iconHash=stampBuffer(Buffer.concat(await Promise.all(iconFiles.map(async file=>await fs.readFile('generated/icons/'+file)))));
const versions={app:stamp(await fs.readFile('generated/app.txt','utf8')),icons:iconHash,css:stamp(await fs.readFile('generated/style.min.css','utf8')),theme:stamp(await fs.readFile('assets/theme.js','utf8')),pdf:stamp(await minifyJs('node_modules/pdfjs-dist/build/pdf.mjs')),worker:stamp(await minifyJs('node_modules/pdfjs-dist/build/pdf.worker.mjs'))};
await fs.writeFile('generated/versions.json',JSON.stringify(versions));
await fs.rm('dist',{recursive:true,force:true});await fs.mkdir('dist/server',{recursive:true});
await build({entryPoints:['src/server/worker.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',outfile:'dist/server/index.js',loader:{'.html':'text','.css':'text','.txt':'text','.pdf':'base64','.png':'base64','.ico':'base64','.svg':'text'},plugins:[{name:'pdfjs-as-text',setup(b){b.onLoad({filter:/pdf(?:\.worker)?\.mjs$/},async a=>({contents:await minifyJs(a.path),loader:'text'}))}},{name:'theme-as-text',setup(b){b.onLoad({filter:/assets[\/]theme\.js$/},async a=>({contents:await fs.readFile(a.path,'utf8'),loader:'text'}))}}]});
await fs.cp('drizzle','dist/drizzle',{recursive:true});
console.log('Built Worker and database migrations.','versions',JSON.stringify(versions));