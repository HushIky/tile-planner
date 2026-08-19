// Shared state, units, room geometry, and tile layout algorithms.
const $=id=>document.getElementById(id);
const NS='http://www.w3.org/2000/svg';

// ===== Unit conversion (tile dims & offsets shown in mm; state stored in cm) =====
const cmToMm = cm => Math.round((+cm || 0) * 100) / 10;  // round to 0.1mm precision
const mmToCm = mm => (+mm || 0) / 10;

// ===== Analytics event tracking (GoatCounter) =====
// Silent no-op if GoatCounter not loaded (offline, blocked, or YOUR_GC_CODE unfilled).
function gcEvent(name, title){
  try {
    if(typeof window.goatcounter !== 'undefined' && window.goatcounter.count){
      window.goatcounter.count({path: name, title: title || name, event: true});
    }
  } catch(e){ /* never break the app due to analytics */ }
}

// ===== Theme management =====
const THEME_KEY = 'tile-planner-theme';
const THEME_ORDER = ['light', 'dark'];
const THEME_LABEL = { light: '淺色', dark: '深色' };
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('theme-toggle');
  if(btn) btn.textContent = '主題: ' + THEME_LABEL[t];
}
let _currentTheme = (function(){
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEME_ORDER.includes(saved) ? saved : 'light';
  }
  catch(e){ return 'light'; }
})();
applyTheme(_currentTheme);
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(_currentTheme);  // sync button text after DOM ready
  const btn = document.getElementById('theme-toggle');
  if(btn) btn.addEventListener('click', () => {
    _currentTheme = THEME_ORDER[(THEME_ORDER.indexOf(_currentTheme) + 1) % THEME_ORDER.length];
    try { localStorage.setItem(THEME_KEY, _currentTheme); } catch(e){}
    applyTheme(_currentTheme);
  });
});
const SCALE = 1.0; // plan is in cm directly (1px = 1cm visually for simple sizing)

// State
let state = {
  room: { length: 280, width: 180, wallHeight: 270, installHeight: 240 },
  tiles: { wallW: 60, wallH: 30, floorW: 30, floorH: 30, groutMm: 3, groutWallMm: 3, groutFloorMm: 3, bondMode: 'aligned', floorBondMode: 'aligned', dimStyle: 'plain', cuttingMode: 'naive', offsetX: { W1: 0, W2: 0, W3: 0, W4: 0 }, offsetY: 0, floorOffset: { x: 0, y: 0 } },
  openings: [
    { id:'D1', wall:'W2', type:'door',   width:75, height:200, left:30, bottom:0, hinge:'s', swing:'l' },
    { id:'C1', wall:'W3', type:'window', width:90, height:60,  left:80, bottom:130 }
  ],
  threshold: null, // { width:6, axis:'y', offset:0 } when enabled
  drain: null,     // kept for legacy — use drains[] below
  drains: [],      // [{ id, x, y }] — multiple drains, each 10×10 cm
  drainDimMode: 'edge',
  trimStripLen: 240,
  materials: { location:'', wallTileModel:'', floorTileModel:'', groutWallModel:'', groutFloorModel:'' }, // 'edge' | 'center' — what the dimension lines measure to
  shafts: [],      // [{ id, wall:'W1', offsetAlong, lenAlong, depth }]  pipe-shaft footprints (always wall-attached)
  selected: null,  // {kind:'wall'|'opening'|'threshold'|'shaft', id}
  oCnt: 100,
  sCnt: 0,
  mode: 'edit'  // 'edit' | 'addOp' | 'addThr'
};
let pendingOp = null; // {type, width, height} when addOp mode
let lastEditedField = null;

const grout  = () => (state.tiles.groutWallMm  || state.tiles.groutMm || 3) / 10;
const groutF = () => (state.tiles.groutFloorMm || state.tiles.groutMm || 3) / 10;

// ===== Wall identification (W1=south/bottom, W2=west/left, W3=north/top, W4=east/right) =====
function getWallByName(name){
  // returns {name, length, openings:[...], a:'corner', b:'corner'}
  const r = state.room;
  if(name==='W1') return { name, length:r.length };
  if(name==='W2') return { name, length:r.width };
  if(name==='W3') return { name, length:r.length };
  if(name==='W4') return { name, length:r.width };
}
function wallLengthOf(wallName){return getWallByName(wallName).length;}

function openingsOnWall(wallName){
  return state.openings.filter(o=>o.wall===wallName).map(o=>({
    ...o,
    sx: o.left, sy: o.bottom, sw: o.width, sh: o.height
  }));
}

// ===== Tile algorithms =====
function rectsOverlap(a,b){return !(a.x+a.w<=b.x||a.x>=b.x+b.w||a.y+a.h<=b.y||a.y>=b.y+b.h);}
function subtractRect(rect,hole){
  if(!rectsOverlap(rect,hole)) return [rect];
  const pieces=[];
  if(rect.y<hole.y) pieces.push({x:rect.x,y:rect.y,w:rect.w,h:hole.y-rect.y});
  if(rect.y+rect.h>hole.y+hole.h) pieces.push({x:rect.x,y:hole.y+hole.h,w:rect.w,h:rect.y+rect.h-hole.y-hole.h});
  const yT=Math.max(rect.y,hole.y),yB=Math.min(rect.y+rect.h,hole.y+hole.h);
  if(yT<yB){
    if(rect.x<hole.x) pieces.push({x:rect.x,y:yT,w:hole.x-rect.x,h:yB-yT});
    if(rect.x+rect.w>hole.x+hole.w) pieces.push({x:hole.x+hole.w,y:yT,w:rect.x+rect.w-hole.x-hole.w,h:yB-yT});
  }
  return pieces;
}
function buildTiles(width,height,tw,th,gr,startNum,holes,bondMode,offsetX,offsetY){
  bondMode = bondMode || 'aligned';
  offsetX = offsetX || 0;
  offsetY = offsetY || 0;
  const tiles=[]; let num=startNum;
  const stepX=tw+gr,stepY=th+gr;

  // ── Vertical bond: stagger each column in Y direction ─────────────────
  if(bondMode==='v-half' || bondMode==='v-third'){
    const offForX = offsetX > 0.001 ? (offsetX + gr) : 0;
    const offModX = ((offForX % stepX) + stepX) % stepX;
    const offForY = offsetY > 0.001 ? (offsetY + gr) : 0;
    const offModY = ((offForY % stepY) + stepY) % stepY;
    // Collect all tile positions first (for row-order numbering)
    const positions = [];
    let sx = offModX; while(sx > 0) sx -= stepX;
    let col = 0;
    while(sx < width - 0.001){
      const tileLeft  = Math.max(0, sx);
      const tileRight = Math.min(width, sx + tw);
      const w = tileRight - tileLeft;
      if(w > 0.1){
        const vPhase = (bondMode==='v-half') ? (col%2)*(th/2) : (col%3)*(th/3);
        let sy = offModY - vPhase; while(sy > 0) sy -= stepY;
        while(sy < height - 0.001){
          const tileTop = Math.max(0, sy);
          const tileBot = Math.min(height, sy + th);
          const h = tileBot - tileTop;
          if(h > 0.1) positions.push({sx, tileLeft, sy, tileTop, w, h, col});
          sy += stepY;
        }
      }
      sx += stepX; col++;
    }
    // Sort row-first, then col — consistent numbering matching horizontal modes
    positions.sort((a,b)=>{
      const ar = Math.round(a.sy/stepY), br = Math.round(b.sy/stepY);
      return ar !== br ? ar - br : a.sx - b.sx;
    });
    for(const pos of positions){
      const baseRect={x:pos.tileLeft, y:pos.tileTop, w:pos.w, h:pos.h};
      let pieces=[baseRect];
      for(const hole of holes){
        const next=[]; for(const p of pieces) next.push(...subtractRect(p,hole)); pieces=next;
      }
      if(pieces.length===0) continue;
      const isFull=(Math.abs(pos.w-tw)<.01 && Math.abs(pos.h-th)<.01 && pieces.length===1 &&
                   Math.abs(pieces[0].w-pos.w)<.01 && Math.abs(pieces[0].h-pos.h)<.01);
      const usedArea=pieces.reduce((a,p)=>a+p.w*p.h,0);
      tiles.push({number:num++,full:isFull,pieces,usedArea,baseW:tw,baseH:th,baseRect});
    }
    return tiles;
  }

  // ── Horizontal bond (original logic) ──────────────────────────────────
  // Plan B: offset value = desired cut tile width; convert to internal "first full tile" position
  const offForY = offsetY > 0.001 ? (offsetY + gr) : 0;
  const offModY = ((offForY % stepY) + stepY) % stepY;
  let y = offModY;
  while(y > 0) y -= stepY;
  let row = 0;
  while(y < height-0.001){
    const tileTop = Math.max(0, y);
    const tileBot = Math.min(height, y+th);
    const h = tileBot - tileTop;
    if(h <= 0.1){ y += stepY; row++; continue; }
    const phase = (bondMode==='half') ? (row%2)*(tw/2) :
                  (bondMode==='third') ? (row%3)*(tw/3) : 0;
    const offForX = offsetX > 0.001 ? (offsetX + gr) : 0;
    const offModX = ((offForX % stepX) + stepX) % stepX;
    let x = offModX - phase;
    while(x > 0) x -= stepX;
    while(x < width-0.001){
      const tileLeft = Math.max(0, x);
      const tileRight = Math.min(width, x+tw);
      const w = tileRight - tileLeft;
      if(w<=0.1){ x += stepX; continue; }
      const baseRect={x:tileLeft,y:tileTop,w,h};
      let pieces=[baseRect];
      for(const hole of holes){
        const next=[];
        for(const p of pieces) next.push(...subtractRect(p,hole));
        pieces=next;
      }
      if(pieces.length===0){ x += stepX; continue; }
      const isFull=(Math.abs(w-tw)<.01 && Math.abs(h-th)<.01 && pieces.length===1 &&
                    Math.abs(pieces[0].w-w)<.01 && Math.abs(pieces[0].h-h)<.01);
      const usedArea=pieces.reduce((a,p)=>a+p.w*p.h,0);
      tiles.push({number:num++,full:isFull,pieces,usedArea,baseW:tw,baseH:th,baseRect});
      x += stepX;
    }
    y += stepY;
    row++;
  }
  return tiles;
}

// Number formatting: integer when whole, 1 decimal otherwise
function fmt(n){
  if(Math.abs(n - Math.round(n)) < 0.1) return String(Math.round(n));
  return n.toFixed(1);
}

// Get tile width segments along a row (for dim annotations)
function getRowSegments(wallLen, tileW, gr, bondMode, row, offsetX){
  offsetX = offsetX || 0;
  const phase = (bondMode==='half') ? (row%2)*(tileW/2) :
                (bondMode==='third') ? (row%3)*(tileW/3) : 0;
  const stepX = tileW + gr;
  const offFor = offsetX > 0.001 ? (offsetX + gr) : 0;
  const offMod = ((offFor % stepX) + stepX) % stepX;
  const segments = [];
  let x = offMod - phase;
  while(x > 0) x -= stepX;
  while(x < wallLen - 0.001){
    const tileLeft = Math.max(0, x);
    const tileRight = Math.min(wallLen, x+tileW);
    const w = tileRight - tileLeft;
    if(w > 0.1) segments.push({start:tileLeft, end:tileRight, width:w});
    x += stepX;
  }
  return segments;
}

// Get tile height segments along a column (optional colPhase for v-bond stagger)
function getColSegments(installH, tileH, gr, offsetY, colPhase){
  offsetY = offsetY || 0;
  colPhase = colPhase || 0;
  const stepY = tileH + gr;
  const offFor = offsetY > 0.001 ? (offsetY + gr) : 0;
  const offMod = ((offFor % stepY) + stepY) % stepY;
  const segments = [];
  let y = offMod - colPhase;
  while(y > 0) y -= stepY;
  while(y < installH - 0.001){
    const top = Math.max(0, y);
    const bot = Math.min(installH, y+tileH);
    const h = bot - top;
    if(h > 0.1) segments.push({start:top, end:bot, height:h});
    y += stepY;
  }
  return segments;
}

// Draw width annotation row(s) below a wall + total width dim
function drawWidthDim(svg, baseX, topY, wallLen, scale, tileW, tileH, gr, bondMode, dimStyle, offsetX){
  if(dimStyle === 'off') return;
  offsetX = offsetX || 0;
  const numRows = (bondMode==='aligned'||bondMode==='v-half'||bondMode==='v-third') ? 1 :
                  (bondMode==='half') ? 2 : 3;
  const rowH = (dimStyle==='arch') ? 20 : 14;
  let yCur = topY;
  for(let r=0; r<numRows; r++){
    const segs = getRowSegments(wallLen, tileW, gr, bondMode, r, offsetX);
    if(dimStyle==='arch'){
      const dimY = yCur + 9;
      svg.appendChild(ml({x:baseX, y:dimY},{x:baseX+wallLen*scale, y:dimY},'dim-line'));
      // ticks at all segment boundaries
      const bs = new Set(); bs.add(0); bs.add(wallLen);
      for(const s2 of segs){ bs.add(s2.start); bs.add(s2.end); }
      for(const b of bs){
        svg.appendChild(ml({x:baseX+b*scale, y:dimY-3},{x:baseX+b*scale, y:dimY+3},'dim-tick'));
      }
      for(const s2 of segs){
        const cx = baseX + ((s2.start+s2.end)/2)*scale;
        svg.appendChild(mt(cx, dimY+11, fmt(s2.width), 'dim-label'));
      }
    } else {
      for(const s2 of segs){
        const cx = baseX + ((s2.start+s2.end)/2)*scale;
        svg.appendChild(mt(cx, yCur+8, fmt(s2.width), 'dim-label'));
      }
    }
    yCur += rowH;
  }
  // total
  if(dimStyle==='arch'){
    const dimY = yCur + 9;
    svg.appendChild(ml({x:baseX, y:dimY},{x:baseX+wallLen*scale, y:dimY},'dim-line total'));
    svg.appendChild(ml({x:baseX, y:dimY-3},{x:baseX, y:dimY+3},'dim-tick'));
    svg.appendChild(ml({x:baseX+wallLen*scale, y:dimY-3},{x:baseX+wallLen*scale, y:dimY+3},'dim-tick'));
    svg.appendChild(mt(baseX + wallLen*scale/2, dimY+11, fmt(wallLen), 'dim-label total'));
  } else {
    svg.appendChild(mt(baseX + wallLen*scale/2, yCur+8, fmt(wallLen), 'dim-label total'));
  }
}

// Draw height annotation column on the left or right side of a wall
function drawHeightDim(svg, dx, topY, fullH, installH, scale, side, tileH, gr, dimStyle, offsetY, bondMode){
  if(dimStyle === 'off') return;
  offsetY = offsetY || 0;
  bondMode = bondMode || 'aligned';
  const wallBottomY = topY + fullH * scale;
  const tilesTopY = topY + (fullH - installH) * scale;
  const tickDir = (side==='left') ? -1 : 1;

  // ── V-bond: show 2 interleaved column patterns (even/odd) ─────────────
  if(bondMode==='v-half' || bondMode==='v-third'){
    const numCols = bondMode==='v-half' ? 2 : 3;
    const subW = (dimStyle==='arch') ? 18 : 14;
    for(let c=0; c<numCols; c++){
      const phase = (bondMode==='v-half') ? c*(tileH/2) : c*(tileH/3);
      const segs = getColSegments(installH, tileH, gr, offsetY, phase);
      const subDx = dx + tickDir * (c * subW + subW/2);
      if(dimStyle==='arch'){
        svg.appendChild(ml({x:subDx, y:tilesTopY},{x:subDx, y:wallBottomY},'dim-line'));
        for(const s2 of segs){
          const cy = wallBottomY - ((s2.start+s2.end)/2)*scale;
          svg.appendChild(mt(subDx + tickDir*8, cy, fmt(s2.height), 'dim-label'));
        }
      } else {
        for(const s2 of segs){
          const cy = wallBottomY - ((s2.start+s2.end)/2)*scale;
          svg.appendChild(mt(subDx, cy, fmt(s2.height), 'dim-label'));
        }
      }
    }
    // Total height (once, shared)
    const totalDx = dx + tickDir * (numCols * subW + (dimStyle==='arch'?10:8));
    if(dimStyle==='arch'){
      svg.appendChild(ml({x:totalDx, y:tilesTopY},{x:totalDx, y:wallBottomY},'dim-line total'));
      svg.appendChild(ml({x:totalDx, y:tilesTopY},{x:totalDx+tickDir*3, y:tilesTopY},'dim-tick'));
      svg.appendChild(ml({x:totalDx, y:wallBottomY},{x:totalDx+tickDir*3, y:wallBottomY},'dim-tick'));
      svg.appendChild(mt(totalDx+tickDir*11, (tilesTopY+wallBottomY)/2, fmt(installH), 'dim-label total'));
    } else {
      svg.appendChild(mt(totalDx, (tilesTopY+wallBottomY)/2, fmt(installH), 'dim-label total'));
    }
    return;
  }

  // ── Standard horizontal bond (original logic) ──────────────────────────
  const segs = getColSegments(installH, tileH, gr, offsetY);
  if(dimStyle==='arch'){
    svg.appendChild(ml({x:dx, y:tilesTopY},{x:dx, y:wallBottomY},'dim-line'));
    const bs = new Set(); bs.add(0); bs.add(installH);
    for(const s2 of segs){ bs.add(s2.start); bs.add(s2.end); }
    for(const b of bs){
      const y = wallBottomY - b*scale;
      svg.appendChild(ml({x:dx, y:y},{x:dx + tickDir*3, y:y},'dim-tick'));
    }
    for(const s2 of segs){
      const cy = wallBottomY - ((s2.start+s2.end)/2)*scale;
      svg.appendChild(mt(dx + tickDir*11, cy, fmt(s2.height), 'dim-label'));
    }
    const totalDx = dx + tickDir*22;
    svg.appendChild(ml({x:totalDx, y:tilesTopY},{x:totalDx, y:wallBottomY},'dim-line total'));
    svg.appendChild(ml({x:totalDx, y:tilesTopY},{x:totalDx + tickDir*3, y:tilesTopY},'dim-tick'));
    svg.appendChild(ml({x:totalDx, y:wallBottomY},{x:totalDx + tickDir*3, y:wallBottomY},'dim-tick'));
    svg.appendChild(mt(totalDx + tickDir*11, (tilesTopY+wallBottomY)/2, fmt(installH), 'dim-label total'));
  } else {
    for(const s2 of segs){
      const cy = wallBottomY - ((s2.start+s2.end)/2)*scale;
      svg.appendChild(mt(dx + tickDir*8, cy, fmt(s2.height), 'dim-label'));
    }
    svg.appendChild(mt(dx + tickDir*22, (tilesTopY+wallBottomY)/2, fmt(installH), 'dim-label total'));
  }
}
// Draw plan outer dimensions — per-tile segments + overall room length/width.
// Mirrors drawWidthDim/drawHeightDim: 'off' = nothing, 'plain' = numbers only,
// 'arch' = dim line + ticks + labels. W2/W4 (vertical) labels read along the line.
function drawPlanOuterDim(g, scale, pad, dimStyle){
  if(dimStyle === 'off') return;
  const arch = dimStyle === 'arch';
  const r = state.room;
  const L = r.length * scale;
  const W = r.width * scale;
  const left = pad, right = pad + L;
  const top  = pad, bottom = pad + W;
  const gr = grout();
  const fW = state.tiles.floorW;
  const fH = state.tiles.floorH;
  const fOx = (state.tiles.floorOffset && state.tiles.floorOffset.x) || 0;
  const fOy = (state.tiles.floorOffset && state.tiles.floorOffset.y) || 0;
  const off1 = arch ? 22 : 14;  // segments offset from edge
  const off2 = arch ? 44 : 30;  // total offset from edge

  // ===== Bottom: per-tile width row + total =====
  const ySeg = bottom + off1;
  const yTot = bottom + off2;
  const segsX = getRowSegments(r.length, fW, gr, 'aligned', 0, fOx);
  if(arch){
    g.appendChild(ml({x:left, y:ySeg}, {x:right, y:ySeg}, 'dim-line'));
    const bsX = new Set(); bsX.add(0); bsX.add(r.length);
    for(const s of segsX){ bsX.add(s.start); bsX.add(s.end); }
    for(const b of bsX){
      g.appendChild(ml({x:left+b*scale, y:ySeg-3}, {x:left+b*scale, y:ySeg+3}, 'dim-tick'));
    }
  }
  for(const s of segsX){
    const cx = left + ((s.start+s.end)/2)*scale;
    g.appendChild(mt(cx, ySeg + (arch?11:0), fmt(s.width), 'dim-label'));
  }
  // total row
  if(arch){
    g.appendChild(ml({x:left, y:yTot}, {x:right, y:yTot}, 'dim-line total'));
    g.appendChild(ml({x:left,  y:yTot-3}, {x:left,  y:yTot+3}, 'dim-tick'));
    g.appendChild(ml({x:right, y:yTot-3}, {x:right, y:yTot+3}, 'dim-tick'));
    g.appendChild(ml({x:left,  y:bottom+2}, {x:left,  y:yTot-2}, 'dim-line'));
    g.appendChild(ml({x:right, y:bottom+2}, {x:right, y:yTot-2}, 'dim-line'));
  }
  g.appendChild(mt((left+right)/2, yTot + (arch?11:0), fmt(r.length), 'dim-label total'));

  // ===== Right: per-tile height column + total — labels rotated to read along the line =====
  const xSeg = right + off1;
  const xTot = right + off2;
  const segsY = getColSegments(r.width, fH, gr, fOy);
  if(arch){
    g.appendChild(ml({x:xSeg, y:top}, {x:xSeg, y:bottom}, 'dim-line'));
    const bsY = new Set(); bsY.add(0); bsY.add(r.width);
    for(const s of segsY){ bsY.add(s.start); bsY.add(s.end); }
    for(const b of bsY){
      g.appendChild(ml({x:xSeg-3, y:top+b*scale}, {x:xSeg+3, y:top+b*scale}, 'dim-tick'));
    }
  }
  for(const s of segsY){
    const cy = top + ((s.start+s.end)/2)*scale;
    const lx = xSeg + (arch?11:0);
    const lbl = mt(lx, cy, fmt(s.height), 'dim-label');
    lbl.setAttribute('transform', `rotate(-90 ${lx} ${cy})`);
    g.appendChild(lbl);
  }
  // total column
  if(arch){
    g.appendChild(ml({x:xTot, y:top}, {x:xTot, y:bottom}, 'dim-line total'));
    g.appendChild(ml({x:xTot-3, y:top},    {x:xTot+3, y:top},    'dim-tick'));
    g.appendChild(ml({x:xTot-3, y:bottom}, {x:xTot+3, y:bottom}, 'dim-tick'));
    g.appendChild(ml({x:right+2, y:top},    {x:xTot-2, y:top},    'dim-line'));
    g.appendChild(ml({x:right+2, y:bottom}, {x:xTot-2, y:bottom}, 'dim-line'));
  }
  const totLx = xTot + (arch?11:0);
  const totCy = (top+bottom)/2;
  const lblTot = mt(totLx, totCy, fmt(r.width), 'dim-label total');
  lblTot.setAttribute('transform', `rotate(-90 ${totLx} ${totCy})`);
  g.appendChild(lblTot);
}

function thresholdRect(){
  const t=state.threshold; if(!t) return null;
  const r=state.room;
  if(t.axis==='y') return {x:t.offset, y:0, w:t.width, h:r.width};
  return {x:0, y:t.offset, w:r.length, h:t.width};
}

// Pipe-shaft helpers ---------------------------------------------------------
// shaft = {wall, offsetAlong, lenAlong, depth}. Always wall-attached.
// Floor coords: x along W1/W3 (room.length), y along W2/W4 (room.width). (0,0) = top-left = W3-W2 corner.
function shaftFloorRect(s){
  const r = state.room;
  switch(s.wall){
    case 'W1': return {x:s.offsetAlong, y:r.width-s.depth, w:s.lenAlong, h:s.depth};
    case 'W3': return {x:s.offsetAlong, y:0, w:s.lenAlong, h:s.depth};
    case 'W2': return {x:0, y:r.width-s.offsetAlong-s.lenAlong, w:s.depth, h:s.lenAlong};
    case 'W4': return {x:r.length-s.depth, y:s.offsetAlong, w:s.depth, h:s.lenAlong};
  }
}
// For each shaft, returns array of {wall, left, width} indicating which wall regions
// are blocked by it. Primary wall always blocked at offsetAlong; if shaft sits at
// either end of its wall, the perpendicular adjacent wall is also blocked over depth cm.
const SHAFT_CORNER_MAP = {
  'W1@0':   {wall:'W2', anchor:'start'},
  'W1@end': {wall:'W4', anchor:'end'},
  'W2@0':   {wall:'W1', anchor:'start'},
  'W2@end': {wall:'W3', anchor:'start'},
  'W3@0':   {wall:'W2', anchor:'end'},
  'W3@end': {wall:'W4', anchor:'start'},
  'W4@0':   {wall:'W3', anchor:'end'},
  'W4@end': {wall:'W1', anchor:'end'}
};
function shaftWallSegments(s){
  const segs = [{wall:s.wall, left:s.offsetAlong, width:s.lenAlong, shaftId:s.id}];
  const wallLen = wallLengthOf(s.wall);
  const eps = 0.5;
  if(s.offsetAlong < eps){
    const c = SHAFT_CORNER_MAP[s.wall+'@0'];
    if(c){
      const adjLen = wallLengthOf(c.wall);
      const left = c.anchor === 'end' ? Math.max(0, adjLen - s.depth) : 0;
      segs.push({wall:c.wall, left, width:Math.min(s.depth, adjLen), shaftId:s.id});
    }
  }
  if(s.offsetAlong + s.lenAlong > wallLen - eps){
    const c = SHAFT_CORNER_MAP[s.wall+'@end'];
    if(c){
      const adjLen = wallLengthOf(c.wall);
      const left = c.anchor === 'end' ? Math.max(0, adjLen - s.depth) : 0;
      segs.push({wall:c.wall, left, width:Math.min(s.depth, adjLen), shaftId:s.id});
    }
  }
  return segs;
}
function shaftSegmentsOnWall(wallName){
  const out = [];
  for(const s of state.shafts){
    for(const seg of shaftWallSegments(s)){
      if(seg.wall === wallName) out.push(seg);
    }
  }
  return out;
}
// Returns the visible inward-facing faces of every shaft, each tileable like a
// normal wall. A shaft has 4 footprint edges; the one shared with its primary
// wall is hidden, and either side edge is hidden when the shaft sits at a
// corner of that primary wall.
function shaftVisibleFaces(){
  const faces = [];
  const eps = 0.5;
  for(const s of state.shafts){
    const wallLen = wallLengthOf(s.wall);
    const atStart = s.offsetAlong < eps;
    const atEnd = s.offsetAlong + s.lenAlong > wallLen - eps;
    // Front face (parallel to the primary wall, length = lenAlong) — always visible
    faces.push({shaftId:s.id, label:s.id+'·面', length:s.lenAlong, kind:'front'});
    // Side at offsetAlong=0 end (perpendicular, length = depth) — hidden if at start corner
    if(!atStart) faces.push({shaftId:s.id, label:s.id+'·側A', length:s.depth, kind:'sideA'});
    // Side at the other end — hidden if at end corner
    if(!atEnd) faces.push({shaftId:s.id, label:s.id+'·側B', length:s.depth, kind:'sideB'});
  }
  return faces;
}
function estimatePurchase(tiles,singleArea){
  const fullCount=tiles.filter(t=>t.full).length;
  const cutArea=tiles.filter(t=>!t.full).reduce((a,t)=>a+t.usedArea,0);
  return fullCount + Math.ceil(cutArea/singleArea);
}

// Guillotine remnant pool packing: BFD with 2-cut layout choice.
// Each cut tile is taken from either an existing remnant in the pool, or a new donor.
// After cutting, up to 2 leftover remnants are added back to the pool.
// Result: tiles sharing a donor get donorPos / donorCount / donorPrimaryNumber set.
function packCutTiles(cutTiles, tileW, tileH){
  // reset any previous pack data
  cutTiles.forEach(t => { t.donorId = null; t.donorPos = null; t.donorCount = null; t.donorPrimaryNumber = null; });

  // Sort needs by area, largest first
  const needs = cutTiles.map(t => ({
    tile: t,
    w: t.baseRect.w,
    h: t.baseRect.h
  })).sort((a, b) => (b.w * b.h) - (a.w * a.h));

  const remnants = [];  // pool: each {w, h, donorId}
  let donorCount = 0;
  const donorOccupants = {};  // donorId -> [tile, ...]
  const minUseful = 1;  // cm: smaller pieces are discarded as scrap

  for(const need of needs){
    if(need.w > tileW + 0.01 || need.h > tileH + 0.01) continue;  // safety

    // Best-fit: find smallest remnant in pool that fits this need
    let bestIdx = -1, bestArea = Infinity;
    for(let i = 0; i < remnants.length; i++){
      const r = remnants[i];
      if(r.w >= need.w - 0.01 && r.h >= need.h - 0.01){
        const a = r.w * r.h;
        if(a < bestArea){ bestArea = a; bestIdx = i; }
      }
    }

    let donor, donorId;
    if(bestIdx >= 0){
      donor = remnants.splice(bestIdx, 1)[0];
      donorId = donor.donorId;
    } else {
      donorCount++;
      donorId = donorCount;
      donor = { w: tileW, h: tileH, donorId };
    }

    // Track occupants
    if(!donorOccupants[donorId]) donorOccupants[donorId] = [];
    donorOccupants[donorId].push(need.tile);

    // Compute the two layout options for cutting `need` out of `donor`
    const W = donor.w, H = donor.h, w = need.w, h = need.h;
    // Layout A: vertical cut first → vertical strip + offcut
    const remA1 = { w: W - w, h: H };       // right: full-height strip
    const remA2 = { w: w,     h: H - h };   // top of left strip
    // Layout B: horizontal cut first → horizontal strip + offcut
    const remB1 = { w: W,     h: H - h };   // top: full-width strip
    const remB2 = { w: W - w, h: h };       // right of bottom strip

    // Pick layout that preserves the larger single remnant
    const maxA = Math.max(remA1.w * remA1.h, remA2.w * remA2.h);
    const maxB = Math.max(remB1.w * remB1.h, remB2.w * remB2.h);
    const newRems = (maxA >= maxB) ? [remA1, remA2] : [remB1, remB2];

    for(const r of newRems){
      if(r.w >= minUseful && r.h >= minUseful){
        r.donorId = donorId;
        remnants.push(r);
      }
    }
  }

  // Set donor info on tiles (deterministic numbering by tile.number ascending)
  for(const did in donorOccupants){
    const tiles = donorOccupants[did].sort((a, b) => a.number - b.number);
    tiles.forEach((t, i) => {
      t.donorPos = i + 1;
      t.donorCount = tiles.length;
      t.donorPrimaryNumber = tiles[0].number;
    });
  }

  return { purchaseCount: donorCount, donorOccupants };
}

// Backward-compat alias (renderTilePreview & updateStats still call pairCutTiles)
const pairCutTiles = packCutTiles;
