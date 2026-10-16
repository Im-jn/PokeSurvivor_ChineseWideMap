/* PokéSurvivor wide-map UI v1.6. Runs in isolated extension world; no game internals required. */
(() => {
'use strict';
if (window.__psWideMapUI) return;
window.__psWideMapUI = true;
const TAG = '__PS_WIDE_MAP_16__';
const TILE = 32, N = 16;
const types = {
  chest: {name:'小宝箱（击碎）', icon:'▣', color:'#ffd86d'},
  bigchest: {name:'大宝箱（解锁）', icon:'🔒', color:'#bf89ff'},
  altar: {name:'增益祭坛', icon:'▲', color:'#bda7ff'},
  spring: {name:'治疗泉水', icon:'✚', color:'#74eed3'},
  trap: {name:'陷阱', icon:'!', color:'#fa8b91'},
  rock: {name:'岩石', icon:'●', color:'#a8b7c3'},
  tree: {name:'树木', icon:'♣', color:'#4bc983'}
};
let epoch=-1, activeChunks=new Map(), currentSeed=null, camera=null, candidate=null, seenChunks=0;
let terrainCache=new Map(), predMemo=new Map();
let visible = true, collapsed = false, zoom = 2.5, showTiles=true, showPredicted=true;
let centerPan={x:0,y:0};
let displayTypes=new Set(['chest','bigchest','altar','spring']);
let root, canvas, context, status, info, legend, tooltip, toggle, source, bar, mapFrame;
let lastCameraAt=0, lastSnapshotAt=0;
const hash=(x,y,s)=>{
  let h=(Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(s|0,2246822519));
  h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;
  return (h>>>0)/4294967296;
};
function vnoise(x,y,s) {
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash(xi,yi,s),b=hash(xi+1,yi,s),c=hash(xi,yi+1,s),d=hash(xi+1,yi+1,s);
  return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
const fbm=(x,y,s)=>vnoise(x,y,s)*.65+vnoise(x*2.13+17,y*2.13-9,s+1)*.35;
function rawTerrain(tx,ty,seed) {
  const d=Math.hypot(tx,ty);
  if(d<9)return 0;
  const ramp=Math.max(0,Math.min(1,(d-9)/8));
  if(fbm(tx/13,ty/13,seed+101)<.04+.23*ramp)return 2;
  if(fbm(tx/8,ty/8,seed+202)>1-.27*ramp)return 1;
  return 0;
}
function predictedTerrain(tx,ty) {
  if(currentSeed===null)return -1;
  const k=tx+','+ty;
  if (terrainCache.has(k)) return terrainCache.get(k);
  const t=rawTerrain(tx,ty,currentSeed);
  if(terrainCache.size>110000)terrainCache.clear();
  terrainCache.set(k,t);
  return t;
}
function observedTile(tx,ty) {
  const cx=Math.floor(tx/N),cy=Math.floor(ty/N),c=activeChunks.get(cx+','+cy);
  if(!c)return null;
  const ix=tx-cx*N,iy=ty-cy*N;
  return c.terr[iy*N+ix];
}
function getTile(tx,ty) {
  const v=observedTile(tx,ty);
  return v===null ? predictedTerrain(tx,ty) : v;
}
function predictProp(tx,ty) {
  if(currentSeed===null || Math.hypot(tx,ty)<7 || predictedTerrain(tx,ty)!==0)return null;
  const key=tx+','+ty;
  if(predMemo.has(key))return predMemo.get(key);
  let type=null;
  const hs=hash(tx,ty,currentSeed+909),h=hash(tx,ty,currentSeed+404);
  const grove=fbm(tx/10,ty/10,currentSeed+505)>.6;
  if(hs<.0032 && Math.hypot(tx,ty)>12) {
    type=hs<.0004?'altar':hs<.0008?'spring':hs<.0011?'bigchest':'trap';
  } else if(h< (grove?.07:.006)) type='tree';
  else if(h>.992)type='rock';
  else if(h>.985 && h<=.992 && hash(tx,ty,currentSeed+606)<.07)type='chest';
  // Trees/rocks/specials/chests require open 3x3 neighborhood; regular chest is solid too.
  if(type && ['tree','rock','chest','bigchest','spring','altar','trap'].includes(type)) {
    for(let iy=-1;iy<=1;iy++)for(let ix=-1;ix<=1;ix++) {
      if(predictedTerrain(tx+ix,ty+iy)!==0) {type=null;break;}
    }
  }
  const result=type?{type,tx,ty,predicted:true}:null;
  if(predMemo.size>95000)predMemo.clear();
  predMemo.set(key,result);
  return result;
}
function findSeed(input) {
  if(!activeChunks.size || input==null || !Number.isInteger(input) || input<0 || input>=1e6)return false;
  const sample=[];
  // Need to distinguish maps by tiles outside the protected starting clearing.
  for(const c of activeChunks.values()) {
    for(let y=0;y<16;y+=2) for(let x=0;x<16;x+=2) {
      const tx=c.cx*16+x,ty=c.cy*16+y;
      if(Math.hypot(tx,ty)>11)sample.push([tx,ty,c.terr[y*16+x]]);
      if(sample.length>=80)break;
    }
    if(sample.length>=80)break;
  }
  if(sample.length<22)return false;
  let checked=0;
  for(const [x,y,t] of sample) {
    if(rawTerrain(x,y,input)!==t)return false;
    if(++checked>=75)break;
  }
  currentSeed=input;
  terrainCache.clear();predMemo.clear();
  return true;
}
function tryCandidate(){
 if(currentSeed!==null)return;
 if(candidate!==null && findSeed(candidate))return;
 // The official menu backdrop uses a fixed seed. This doesn't claim run prediction.
 if(candidate===null && findSeed(4242))return;
}
window.__psWideMapDiagnostics=()=>({seed:currentSeed,candidate,epoch,chunks:activeChunks.size,seenChunks,camera,cameraAgeMs:lastCameraAt?Date.now()-lastCameraAt:null});
window.addEventListener('message',ev=>{
  if(ev.source!==window || ev.origin!==location.origin)return;
  const d=ev.data;
  if(!d || d.tag!==TAG)return;
  if(typeof d.epoch==='number' && d.epoch!==epoch){
    epoch=d.epoch;activeChunks.clear();terrainCache.clear();predMemo.clear();currentSeed=null;
    centerPan={x:0,y:0};
  }
  if(d.type==='reset') {
    candidate=Number.isInteger(d.candidate)?d.candidate:null;
    return;
  }
  if(d.type!=='snapshot')return;
  if(Number.isInteger(d.candidate))candidate=d.candidate;
  if(Array.isArray(d.changes))for(const c of d.changes) {
    if(!c || !Number.isInteger(c.cx)||!Number.isInteger(c.cy) || !Array.isArray(c.terr) || c.terr.length!==256)continue;
    activeChunks.set(c.cx+','+c.cy,{cx:c.cx,cy:c.cy,terr:new Uint8Array(c.terr),props:Array.isArray(c.props)?c.props:[]});
  }
  if(d.camera && Number.isFinite(d.camera.x) && Number.isFinite(d.camera.y)){
    camera=d.camera;lastCameraAt=Date.now();
  }
  seenChunks=Number.isFinite(d.chunks)?d.chunks:activeChunks.size;
  lastSnapshotAt=Date.now();
  tryCandidate();
  render();
});
const style=String.raw`
#pswm{position:fixed;top:68px;left:14px;width:390px;max-width:calc(100vw - 28px);z-index:2147483646;color:#d9e9e4;font:12px/1.45 system-ui,Arial,sans-serif;user-select:none;filter:drop-shadow(0 10px 20px #0008)}
#pswm *,#pswm *::before,#pswm *::after{box-sizing:border-box}
#pswm .panel{position:relative;display:flex;flex-direction:column;max-height:calc(100vh - 16px);background:#0b1d2326;border:1px solid #47796b;border-radius:13px;overflow:hidden;box-shadow:0 10px 30px #0008}
#pswm .head{flex-shrink:0;touch-action:none;display:flex;align-items:center;gap:8px;background:#193b38a6;border-bottom:1px solid #426f67;padding:9px 12px;cursor:move}
#pswm .head strong{font-size:13px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#pswm button{background:#254b4c;border:1px solid #557d75;color:#e3f6ee;border-radius:7px;padding:5px 9px;cursor:pointer;font:inherit}
#pswm button:hover{background:#377269}
#pswm button.off{background:#1c2c33;border-color:#395159;color:#9cafa9}
#pswm .head button{font-size:16px;font-weight:bold;padding:3px 9px}
#pswm .body{padding:11px 11px 20px;min-height:0;overflow-y:auto;overscroll-behavior:contain}
#pswm .resize-handle{position:absolute;right:3px;bottom:3px;width:18px;height:18px;padding:0;border:0;border-radius:3px;background:linear-gradient(135deg,transparent 45%,#9ad8bd 46%,#9ad8bd 53%,transparent 54%,transparent 65%,#9ad8bd 66%,#9ad8bd 73%,transparent 74%);cursor:nwse-resize;touch-action:none}
#pswm .resize-handle:hover{background-color:#254b4c}
#pswm .resize-handle:focus-visible{outline:2px solid #ffdf73}
#pswm .details-toggle{display:block;width:100%;margin-top:8px}
#pswm canvas{display:block;width:100%;height:auto;aspect-ratio:1;image-rendering:pixelated;background:#0c151b14;cursor:crosshair;border:1px solid #426c68;border-radius:7px;touch-action:none}
#pswm .line{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0}
#pswm .label{color:#a0d3c3;font-weight:700;margin-top:9px}
#pswm .subtitle{color:#b5cac6;font-size:11px;margin-top:4px}
#pswm .source{color:#f6c97e;font-size:11px}
#pswm .legend{display:flex;gap:7px;flex-wrap:wrap;padding-top:5px}
#pswm .legend span{white-space:nowrap}
#pswm .chest-guide{background:#122b30;border:1px solid #345850;border-radius:7px;padding:7px 9px;display:flex;gap:9px;flex-wrap:wrap}
#pswm .chest-guide b{font-size:12px;color:#dce8e5}
#pswm .chest-guide em{font-style:normal;color:#a9bdb9;font-size:11px}
#pswm .dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:3px;vertical-align:middle}
#pswm .fab{position:absolute;top:0;left:0;border:1px solid #52a48f;background:#153830;padding:9px 13px;border-radius:20px;box-shadow:0 8px 22px #0009;cursor:grab;touch-action:none}
#pswm .fab:active{cursor:grabbing}
#pswm [hidden]{display:none!important}`;
function make(){
  if(document.getElementById('pswm'))return;
  const s=document.createElement('style');s.textContent=style;document.documentElement.appendChild(s);
  root=document.createElement('div');root.id='pswm';
  root.innerHTML=`<button class="fab" hidden>🗺 广域地图 · M</button><div class="panel"><div class="head"><strong>🗺 PokéSurvivor · 广域资源地图</strong><button class="min" title="折叠">−</button><button class="close" title="隐藏，可按 M 打开">×</button></div><div class="body"><canvas width="360" height="360"></canvas><div class="subtitle info">正在等待游戏生成地图区块…</div><div class="source">状态：等待地图数据</div><div class="line"><button class="zoomout" title="显示更大的地图范围">－ 更广</button><button class="zoomin">＋ 放大</button><button class="recenter">◎ 居中</button><button class="pred">预测：开</button></div><div class="label">资源图标 · 点击筛选</div><div class="line filters"></div><div class="chest-guide"><span><b>▣ 小宝箱</b> <em>小金箱 · 攻击击碎</em></span><span><b>🔒 大宝箱</b> <em>紫金大箱 · 靠近解锁</em></span></div><div class="subtitle chestStats">当前范围宝箱：等待地图数据</div><div class="label">地形说明</div><div class="legend"><span><i class="dot" style="background:#4d8759"></i>地面</span><span><i class="dot" style="background:#417da9"></i>水域</span><span><i class="dot" style="background:#858b9a"></i>岩壁</span><span><i class="dot" style="background:#182d34"></i>未知</span></div><div class="subtitle">实心标记：已生成区块；空心标记：规则预测。点击图标查看距离。按 M 隐藏/显示，拖动地图平移。</div><div class="subtitle tooltip" style="color:#fbdc8b"></div></div></div>`;
  (document.body||document.documentElement).appendChild(root);
  canvas=root.querySelector('canvas');context=canvas.getContext('2d');
  status=root.querySelector('.info');source=root.querySelector('.source');tooltip=root.querySelector('.tooltip');
  const fab=root.querySelector('.fab');
  const body=root.querySelector('.body'),panel=root.querySelector('.panel');
  const details=document.createElement('div');
  details.id='pswm-details';details.hidden=true;
  // Keep the map visible; group all existing controls and help below it.
  while(canvas.nextSibling)details.appendChild(canvas.nextSibling);
  const detailsToggle=document.createElement('button');
  detailsToggle.type='button';detailsToggle.className='details-toggle';
  detailsToggle.textContent='显示详细信息';
  detailsToggle.setAttribute('aria-controls',details.id);
  detailsToggle.setAttribute('aria-expanded','false');
  detailsToggle.onclick=()=>{
    details.hidden=!details.hidden;
    detailsToggle.textContent=details.hidden?'显示详细信息':'隐藏详细信息';
    detailsToggle.setAttribute('aria-expanded',String(!details.hidden));
    fitPanel();render();
  };
  body.append(detailsToggle,details);

  const SIZE_KEY='ps.widemap.panelWidth.v1';
  let preferredWidth=null;
  try{const saved=Number(localStorage.getItem(SIZE_KEY));if(Number.isFinite(saved)&&saved>=120&&saved<=640)preferredWidth=saved;}catch(_){}
  const defaultWidth=()=>Math.min(390,innerWidth*.3,innerHeight*.45);
  function sizeLimits(){
    const max=Math.max(80,Math.min(640,innerWidth-28,innerHeight-120));
    return {min:Math.min(200,max),max};
  }
  function fitPanel(){
    const {min,max}=sizeLimits();
    root.style.width=Math.max(min,Math.min(max,preferredWidth??defaultWidth()))+'px';
    const shown=panel.hidden?fab:panel;
    root.style.left=Math.max(8,Math.min(Math.max(8,innerWidth-shown.offsetWidth-8),root.offsetLeft))+'px';
    root.style.top=Math.max(8,Math.min(Math.max(8,innerHeight-shown.offsetHeight-8),root.offsetTop))+'px';
  }
  function saveWidth(){try{if(preferredWidth===null)localStorage.removeItem(SIZE_KEY);else localStorage.setItem(SIZE_KEY,String(preferredWidth));}catch(_) {}}
  const resizeHandle=document.createElement('button');
  resizeHandle.type='button';resizeHandle.className='resize-handle';
  resizeHandle.title='拖动调整大小，双击恢复默认';
  resizeHandle.setAttribute('aria-label',resizeHandle.title);
  panel.appendChild(resizeHandle);
  let resizing=null;
  resizeHandle.addEventListener('pointerdown',e=>{
    if(!e.isPrimary||e.button!==0)return;
    resizing={id:e.pointerId,x:e.clientX,y:e.clientY,width:root.offsetWidth};
    resizeHandle.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();
  });
  resizeHandle.addEventListener('pointermove',e=>{
    if(!resizing||e.pointerId!==resizing.id)return;
    const dx=e.clientX-resizing.x,dy=e.clientY-resizing.y;
    const {min,max}=sizeLimits();
    preferredWidth=Math.max(min,Math.min(max,resizing.width+(Math.abs(dx)>=Math.abs(dy)?dx:dy)));
    fitPanel();e.stopPropagation();
  });
  function finishResize(e){
    if(!resizing||e.pointerId!==resizing.id)return;
    resizing=null;saveWidth();
    if(resizeHandle.hasPointerCapture(e.pointerId))resizeHandle.releasePointerCapture(e.pointerId);
    e.stopPropagation();
  }
  for(const event of ['pointerup','pointercancel','lostpointercapture'])resizeHandle.addEventListener(event,finishResize);
  resizeHandle.addEventListener('dblclick',()=>{preferredWidth=null;saveWidth();fitPanel();});
  resizeHandle.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();
    const {min,max}=sizeLimits();
    preferredWidth=e.key==='Home'?null:Math.max(min,Math.min(max,root.offsetWidth+(['ArrowLeft','ArrowUp'].includes(e.key)?-20:20)));
    saveWidth();fitPanel();
  });
  window.addEventListener('resize',fitPanel);
  let dragFab=null, suppressFabClick=false;
  fab.title='点击展开地图，拖动调整位置';
  fab.addEventListener('pointerdown',e=>{
    if(!e.isPrimary || e.button!==0)return;
    suppressFabClick=false;
    dragFab={id:e.pointerId,sx:e.clientX,sy:e.clientY,left:root.offsetLeft,top:root.offsetTop,moved:false};
    fab.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });
  fab.addEventListener('pointermove',e=>{
    if(!dragFab || e.pointerId!==dragFab.id)return;
    const dx=e.clientX-dragFab.sx,dy=e.clientY-dragFab.sy;
    if(!dragFab.moved && Math.hypot(dx,dy)<4)return;
    dragFab.moved=true;
    root.style.left=Math.max(0,Math.min(Math.max(0,innerWidth-fab.offsetWidth),dragFab.left+dx))+'px';
    root.style.top=Math.max(0,Math.min(Math.max(0,innerHeight-fab.offsetHeight),dragFab.top+dy))+'px';
    e.stopPropagation();
  });
  function finishFabDrag(e){
    if(!dragFab || e.pointerId!==dragFab.id)return;
    suppressFabClick=dragFab.moved;
    dragFab=null;
    if(fab.hasPointerCapture(e.pointerId))fab.releasePointerCapture(e.pointerId);
    e.stopPropagation();
  }
  for(const event of ['pointerup','pointercancel','lostpointercapture'])fab.addEventListener(event,finishFabDrag);
  fab.onclick=e=>{
    if(suppressFabClick && e.detail!==0){suppressFabClick=false;e.stopPropagation();return;}
    collapsed=false;visible=true;sync();
  };
  root.querySelector('.min').onclick=()=>{collapsed=!collapsed;sync();};
  root.querySelector('.close').onclick=()=>{visible=false;sync();};
  root.querySelector('.zoomout').onclick=()=>{zoom=Math.max(1.6,zoom/1.35);render();};
  root.querySelector('.zoomin').onclick=()=>{zoom=Math.min(8,zoom*1.35);render();};
  root.querySelector('.recenter').onclick=()=>{centerPan={x:0,y:0};render();};
  root.querySelector('.pred').onclick=ev=>{showPredicted=!showPredicted;ev.currentTarget.textContent='预测：'+(showPredicted?'开':'关');render();};
  const filters=root.querySelector('.filters');
  for (const [id,opt] of Object.entries(types)) {
    const b=document.createElement('button');b.textContent=opt.icon+' '+opt.name;
    b.dataset.type=id;if(!displayTypes.has(id))b.classList.add('off');
    b.onclick=()=>{if(displayTypes.has(id))displayTypes.delete(id);else displayTypes.add(id);b.classList.toggle('off',!displayTypes.has(id));render();};
    filters.appendChild(b);
  }
  const head=root.querySelector('.head');let dragHeader=null;
  head.addEventListener('pointerdown',e=>{
    if(e.target.closest('button'))return;
    dragHeader={sx:e.clientX,sy:e.clientY,left:root.offsetLeft,top:root.offsetTop};
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove',e=>{
    if(!dragHeader)return;
    root.style.left=Math.max(0,Math.min(innerWidth-60,dragHeader.left+e.clientX-dragHeader.sx))+'px';
    root.style.top=Math.max(0,Math.min(innerHeight-40,dragHeader.top+e.clientY-dragHeader.sy))+'px';
  });
  head.addEventListener('pointerup',()=>{dragHeader=null;});
  let dragMap=null;
  canvas.addEventListener('pointerdown',e=>{dragMap={x:e.clientX,y:e.clientY,panX:centerPan.x,panY:centerPan.y,moved:false};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{
    if(!dragMap)return;
    const factor=canvas.width/canvas.getBoundingClientRect().width/zoom;
    const dx=(e.clientX-dragMap.x)*factor,dy=(e.clientY-dragMap.y)*factor;
    if(Math.abs(dx)+Math.abs(dy)>.5)dragMap.moved=true;
    centerPan={x:dragMap.panX-dx*TILE,y:dragMap.panY-dy*TILE};render();
  });
  canvas.addEventListener('pointerup',e=>{
    if(dragMap && !dragMap.moved){
      const b=canvas.getBoundingClientRect(),sx=(e.clientX-b.left)*canvas.width/b.width,sy=(e.clientY-b.top)*canvas.height/b.height;
      chooseNearest(sx,sy);
    }
    dragMap=null;
  });
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(1.6,Math.min(8,zoom*(e.deltaY<0?1.15:1/1.15)));render();},{passive:false});
  window.addEventListener('keydown',e=>{
    const focused=document.activeElement;
    if(e.code!=='KeyM' || e.repeat || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey ||
       /^(INPUT|TEXTAREA|SELECT)$/.test(focused?.tagName||'') || focused?.isContentEditable)return;
    visible=!(visible && !collapsed);
    collapsed=false;
    sync();
  },true);
  function sync(){panel.hidden=!visible || collapsed;fab.hidden=visible && !collapsed;fab.textContent=visible?'🗺 地图（展开）':'🗺 地图（M 开启）';fitPanel();if(visible&&!collapsed)render();}
  sync();
}
let hotspots=[];
function chooseNearest(sx,sy){
  let best=null,dist=15*15;
  for(const p of hotspots){const d=(p.sx-sx)**2+(p.sy-sy)**2;if(d<dist){dist=d;best=p;}}
  if(!best){tooltip.textContent='这里没有资源标记';return;}
  const dst=camera?Math.hypot(best.tx*TILE+16-camera.x,best.ty*TILE+16-camera.y):NaN;
  tooltip.textContent=`${types[best.type].name} · ${best.predicted?'规则预测':'已确认'} · ${Number.isFinite(dst)?'距中心约 '+Math.round(dst)+' 世界单位 · ':''}坐标 (${best.tx}, ${best.ty})`;
}
function render(){
 if(!canvas || !context || !visible || collapsed)return;
 const ctx=context,w=canvas.width,h=canvas.height;
 ctx.clearRect(0,0,w,h);
 if(!camera || Date.now()-lastCameraAt>5000){
   status.textContent='等待游戏的地图绘制数据，请进入实际对局后移动几步';
   source.textContent=`状态：${seenChunks} 个已生成区块 · 尚未定位玩家`;
   const summary=root.querySelector('.chestStats');if(summary)summary.textContent='当前范围宝箱：等待玩家定位';
   return;
 }
 const worldX=camera.x+centerPan.x,worldY=camera.y+centerPan.y;
 const cxTile=worldX/TILE,cyTile=worldY/TILE;
 const left=Math.floor(cxTile-w/2/zoom),right=Math.ceil(cxTile+w/2/zoom);
 const top=Math.floor(cyTile-h/2/zoom),bottom=Math.ceil(cyTile+h/2/zoom);
 ctx.save();ctx.imageSmoothingEnabled=false;
 hotspots=[];
 for(let ty=top;ty<=bottom;ty++)for(let tx=left;tx<=right;tx++){
   const t=getTile(tx,ty),px=w/2+(tx-cxTile)*zoom,py=h/2+(ty-cyTile)*zoom;
   ctx.fillStyle=t===0?'#4b8156':t===1?'#87929b':t===2?'#367ba5':'#13262d';
   ctx.fillRect(Math.floor(px),Math.floor(py),Math.ceil(zoom+1),Math.ceil(zoom+1));
 }
 // Fade terrain as one layer so overlapping tile edges stay evenly translucent.
 ctx.save();ctx.globalCompositeOperation='destination-in';
 ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(0,0,w,h);ctx.restore();
 // Known objects take precedence; no ghost markers on broken or used props.
 const known=new Map();
 const chestCounts={chest:{confirmed:0,predicted:0},bigchest:{confirmed:0,predicted:0}};
 for(const c of activeChunks.values()) {
  const cLeft=c.cx*16,cTop=c.cy*16;
  if(cLeft>right || cLeft+16<left || cTop>bottom || cTop+16<top)continue;
  for(const p of c.props)if(p && types[p.type] && Number.isFinite(p.tx) && Number.isFinite(p.ty))known.set(p.tx+','+p.ty,p);
 }
 function drawGlyph(type,x,y){
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.lineWidth=1;
  if(type==='chest'){
    // Small destructible chest: compact golden crate with a simple buckle.
    ctx.fillStyle='#311c12';ctx.fillRect(-7,-5,14,11);
    ctx.fillStyle='#f9cc64';ctx.fillRect(-6,-4,12,3);  // lid
    ctx.fillStyle='#a5662e';ctx.fillRect(-6,-1,12,6);  // body
    ctx.fillStyle='#eaa54a';ctx.fillRect(-5,0,10,3);
    ctx.fillStyle='#5c3421';ctx.fillRect(-6,-1,12,1);
    ctx.fillStyle='#fff2b1';ctx.fillRect(-1,-1,2,4); // buckle
    ctx.fillStyle='#7a441f';ctx.fillRect(-4,1,1,3);ctx.fillRect(3,1,1,3);
  }else if(type==='bigchest'){
    // Big locked chest: substantially larger, violet-and-gold with a drawn padlock.
    // Pure pixel-art geometry: legible even if the font has no padlock emoji.
    ctx.fillStyle='#261a38';ctx.fillRect(-12,-8,24,17); // dark silhouette
    ctx.fillStyle='#ffdf83';ctx.fillRect(-11,-9,22,4); // massive gold lid
    ctx.fillStyle='#8a4ad1';ctx.fillRect(-11,-5,22,12); // violet body
    ctx.fillStyle='#ab71ef';ctx.fillRect(-9,-3,18,8);
    ctx.fillStyle='#f5c45f';ctx.fillRect(-11,-5,22,2);ctx.fillRect(-11,5,22,2);
    ctx.fillStyle='#f9da8d';ctx.fillRect(-10,-3,2,9);ctx.fillRect(8,-3,2,9);
    // High-contrast padlock (shackle + central body + keyhole).
    ctx.fillStyle='#231d34';ctx.fillRect(-4,-5,8,9);
    ctx.fillStyle='#ffea9b';ctx.fillRect(-3,-6,6,4);
    ctx.fillStyle='#8a4ad1';ctx.fillRect(-1,-5,2,3);
    ctx.fillStyle='#fbd26f';ctx.fillRect(-4,-2,8,7);
    ctx.fillStyle='#462441';ctx.fillRect(-1,0,2,2);ctx.fillRect(0,2,1,2);
    // Bright corners are a second cue in addition to size and color.
    ctx.fillStyle='#ffeaa2';ctx.fillRect(-12,-10,2,2);ctx.fillRect(10,-10,2,2);
  }else if(type==='altar'){
    ctx.fillStyle='#778a94';ctx.fillRect(-5,3,10,3);ctx.fillRect(-3,-1,6,4);
    ctx.fillStyle='#ddadff';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,-2);ctx.lineTo(0,3);ctx.lineTo(-5,-2);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff2ff';ctx.fillRect(0,-5,1,5);
  }else if(type==='spring'){
    ctx.fillStyle='#175b6d';ctx.beginPath();ctx.ellipse(0,1,7,4,0,0,6.29);ctx.fill();
    ctx.strokeStyle='#7cefe7';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,1,5,2.5,0,0,6.29);ctx.stroke();
    ctx.fillStyle='#ccffff';ctx.fillRect(-1,-6,2,5);
  }else if(type==='trap'){
    ctx.fillStyle='#ff8585';ctx.fillRect(-5,-5,10,10);ctx.strokeStyle='#541c27';ctx.beginPath();ctx.moveTo(-3,-3);ctx.lineTo(3,3);ctx.moveTo(3,-3);ctx.lineTo(-3,3);ctx.stroke();
  }else if(type==='rock'){
    ctx.fillStyle='#b4bdc3';ctx.beginPath();ctx.moveTo(-5,1);ctx.lineTo(-3,-4);ctx.lineTo(3,-5);ctx.lineTo(6,0);ctx.lineTo(3,5);ctx.lineTo(-4,4);ctx.closePath();ctx.fill();
  }else if(type==='tree'){
    ctx.fillStyle='#754d32';ctx.fillRect(-1,0,3,6);ctx.fillStyle='#6ede94';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(6,2);ctx.lineTo(-6,2);ctx.closePath();ctx.fill();
  }
  ctx.restore();
 }
 function drawIcon(p,predicted){
  if(!displayTypes.has(p.type) || (predicted&&!showPredicted))return;
  if(p.used || p.hp<=0 || (p.type==='spring'&&p.charge<.15))return;
  const sx=w/2+((p.tx+.5)-cxTile)*zoom,sy=h/2+((p.ty+.5)-cyTile)*zoom;
  if(sx<0||sy<0||sx>=w||sy>=h)return;
  const opt=types[p.type],r=p.type==='bigchest'?14:p.type==='chest'?8.8:(p.type==='tree'||p.type==='rock'?5.2:7.4);
  ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);
  ctx.fillStyle=predicted?'#15252b':opt.color;ctx.fill();
  ctx.lineWidth=predicted?1.8:.9;ctx.strokeStyle=opt.color;ctx.stroke();
  // Dashed outer ring means an inferred marker; solid ring means known chunk.
  if(predicted){ctx.save();ctx.setLineDash([2,3]);ctx.beginPath();ctx.arc(sx,sy,r+2,0,Math.PI*2);ctx.stroke();ctx.restore();}
  drawGlyph(p.type,sx,sy);
  hotspots.push({...p,predicted,sx,sy});
  if(chestCounts[p.type])chestCounts[p.type][predicted?'predicted':'confirmed']++;

 }
 // Only the already-generated chunks are authoritative; remote marks are predictions.
 for(let ty=top;ty<=bottom;ty++)for(let tx=left;tx<=right;tx++){
  const c=activeChunks.get(Math.floor(tx/16)+','+Math.floor(ty/16));
  if(c || currentSeed===null || !showPredicted)continue;
  const p=predictProp(tx,ty);
  if(p)drawIcon(p,true);
 }
 for(const p of known.values())drawIcon(p,false);
 const cs=chestCounts.chest,cb=chestCounts.bigchest;
 const summary=root.querySelector('.chestStats');
 if(summary)summary.textContent=`当前范围：小宝箱 ${cs.confirmed} 已确认${cs.predicted?' + '+cs.predicted+' 预测':''} · 大宝箱 ${cb.confirmed} 已确认${cb.predicted?' + '+cb.predicted+' 预测':''}`;
 // Draw the actual game viewport rectangle based on renderer's camera dimensions.
 const rectW=camera.w/TILE*zoom,rectH=camera.h/TILE*zoom;
 const playerX=w/2-centerPan.x/TILE*zoom,playerY=h/2-centerPan.y/TILE*zoom;
 ctx.strokeStyle='#eafdf099';ctx.lineWidth=1;ctx.setLineDash([4,3]);ctx.strokeRect(playerX-rectW/2,playerY-rectH/2,rectW,rectH);ctx.setLineDash([]);
 ctx.beginPath();ctx.arc(playerX,playerY,5,0,Math.PI*2);ctx.fillStyle='#ffdf73';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#0a2634';ctx.stroke();
 ctx.fillStyle='#f0fff9';ctx.font='bold 11px system-ui';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText('N ↑',7,7);
 ctx.restore();
 const range=Math.round((w/zoom)*32),screens=(range/camera.w).toFixed(1);
 status.textContent=`显示范围：约 ${range} × ${range} 世界单位（横向约 ${screens} 个游戏屏幕）`;
 source.textContent=currentSeed===null ? `数据来源：已生成区块 ${activeChunks.size} · 种子未确认，未知区域不标记` :
   `数据来源：${activeChunks.size} 个真实区块 + 地形/资源生成规则 · 远处为预测标记`;
}
function initialize(){if(document.getElementById('pswm'))return;make();render();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
