const assetInfo=(()=>{try{const node=document.querySelector('meta[name=class-hub-assets]');return node?JSON.parse(node.getAttribute('content')||'{}'):{}}catch(error){return {}}})();
const pdfVersion=assetInfo.pdf||'';
const versioned=path=>pdfVersion?path+'?v='+pdfVersion:path;
export const pdfOptions={isEvalSupported:false,cMapUrl:'/pdf-assets/'+(pdfVersion?pdfVersion+'/':'')+'cmaps/',cMapPacked:true,standardFontDataUrl:'/pdf-assets/'+(pdfVersion?pdfVersion+'/':'')+'standard_fonts/',wasmUrl:'/pdf-assets/'+(pdfVersion?pdfVersion+'/':'')+'wasm/'};
let library,densityCap=2;
export function setDensityCap(value){densityCap=Number(value)>0?Number(value):2}
export async function pdfjs(){if(!library){library=await import(versioned('/pdf.mjs'));library.GlobalWorkerOptions.workerSrc=versioned('/pdf.worker.mjs')}return library}
export async function loadPdf(source){const lib=await pdfjs();return lib.getDocument({...pdfOptions,...source}).promise}
export function viewerMarkup(){return `<div class="toolbar"><button type="button" data-prev>上一页</button><label class="sr-only">页码</label><input data-page-number aria-label="页码" type="number" min="1" value="1"><span data-page-total></span><button type="button" data-next>下一页</button><label class="sr-only">缩放</label><select data-zoom aria-label="缩放比例"><option value="fit">适合宽度</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select><span data-status class="smalltext" role="status">正在载入…</span></div><div class="canvaswrap"><canvas aria-label="文档原始页面"></canvas></div><details class="spaced"><summary>查看本页文字</summary><p data-text class="page-text"></p></details>`}
export function mountPdfViewer(root,pdf,onPage=()=>{}){
 const q=s=>root.querySelector(s),canvas=q('canvas'),wrap=q('.canvaswrap');let current=1,zoom='fit',serial=0,task=null,closed=false,resizeTimer;
 q('[data-page-total]').textContent='/ '+pdf.numPages;q('[data-page-number]').max=pdf.numPages;
 async function render(n){if(closed)return;current=Math.max(1,Math.min(pdf.numPages,Math.floor(Number(n)||1)));const page=current,call=++serial;const previous=task;if(previous){previous.cancel();try{await previous.promise}catch{}}if(call!==serial||closed)return;
  q('[data-page-number]').value=page;q('[data-prev]').disabled=page===1;q('[data-next]').disabled=page===pdf.numPages;q('[data-status]').textContent='正在显示…';
  try{const p=await pdf.getPage(page);if(call!==serial||closed)return;const base=p.getViewport({scale:1}),available=Math.max(100,wrap.clientWidth-24),scale=zoom==='fit'?available/base.width:Number(zoom)*96/72;const viewport=p.getViewport({scale});const density=Math.min(devicePixelRatio||1,densityCap,Math.sqrt(16000000/(viewport.width*viewport.height)));canvas.width=Math.max(1,Math.floor(viewport.width*density));canvas.height=Math.max(1,Math.floor(viewport.height*density));canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
   task=p.render({canvasContext:canvas.getContext('2d'),viewport,transform:density===1?undefined:[density,0,0,density,0,0]});await task.promise;if(call!==serial||closed)return;q('[data-status]').textContent='第 '+page+' 页';onPage(page);const text=await p.getTextContent();if(call===serial&&!closed)q('[data-text]').textContent=text.items.map(i=>i.str+(i.hasEOL?'\n':' ')).join('');
  }catch(e){if(e.name!=='RenderingCancelledException'&&!closed)q('[data-status]').textContent='页面显示失败，请下载原文件查看。'}
 }
 q('[data-prev]').onclick=()=>render(current-1);q('[data-next]').onclick=()=>render(current+1);q('[data-page-number]').onchange=e=>render(e.target.value);q('[data-zoom]').onchange=e=>{zoom=e.target.value;render(current)};
 const observer=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(zoom==='fit')render(current)},150)});observer.observe(wrap);render(1);
 return {goTo:render,async destroy(){closed=true;++serial;observer.disconnect();clearTimeout(resizeTimer);task?.cancel();try{await task?.promise}catch{}await pdf.destroy()}};
}