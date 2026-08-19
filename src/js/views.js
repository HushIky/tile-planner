// Editor panels, tile previews, unfolded view, and aggregate statistics.
function renderEditPanel(){
  const ep=$('edit-panel'), tit=$('ep-title'), body=$('ep-body');
  if(!state.selected){ep.style.display='none';return;}
  ep.style.display='block';
  body.innerHTML='';
  if(state.selected.kind==='wall'){
    const name=state.selected.id;
    tit.textContent=name+' ('+wallLengthOf(name)+' cm)';
    body.innerHTML=`<p style="font-size:13px;color:var(--muted);margin:0">直接點 SVG 上的牆名數字編輯,或從上面「房間」設定改 ${(name==='W1'||name==='W3')?'長':'寬'}。</p>`;
    return;
  }
  if(state.selected.kind==='drain'){
    const dr = state.drains.find(x => x.id === state.selected.id);
    if(!dr){ep.style.display='none';return;}
    const r = state.room;
    const hs = 5;
    const mode = state.drainDimMode;
    const isEdge = mode === 'edge';
    tit.textContent = '方形地排 10×10 cm — ' + dr.id;
    body.innerHTML = `
      <div class="row" style="margin-top:4px">
        <label>中心 X <input id="dr-x" type="number" value="${dr.x}"/> cm</label>
        <label>中心 Y <input id="dr-y" type="number" value="${dr.y}"/> cm</label>
      </div>
      <div class="actions-row">
        <button class="del" id="drain-del">移除地排</button>
      </div>
    `;
    $('drain-del').onclick = () => {
      state.drains = state.drains.filter(x => x.id !== dr.id);
      state.selected = null;
      render();
    };
    ['dr-x','dr-y'].forEach(id => {
      $(id) && $(id).addEventListener('input', () => {
        const nx = +$('dr-x').value, ny = +$('dr-y').value;
        if(!isNaN(nx)) dr.x = Math.max(hs, Math.min(r.length-hs, Math.round(nx)));
        if(!isNaN(ny)) dr.y = Math.max(hs, Math.min(r.width-hs,  Math.round(ny)));
        render({skipEditPanel:true});
      });
    });
    return;
  }
  if(state.selected.kind==='threshold'){
    const t=state.threshold;
    if(!t){ep.style.display='none';return;}
    const r=state.room;
    const isY = t.axis==='y';
    const totalLen = isY ? r.length : r.width;
    const d1 = t.offset;
    const d2 = totalLen - t.offset - t.width;
    const lab1 = isY ? '離左' : '離上';
    const lab2 = isY ? '離右' : '離下';
    const dirLabel = isY ? '直立(平行短邊)' : '橫向(平行長邊)';
    tit.textContent='人造石門檻 — '+dirLabel;
    body.innerHTML=`
      <div class="row">
        <label>${lab1} <input id="thr-d1" type="number" value="${d1}"/></label>
        <label>${lab2} <input id="thr-d2" type="number" value="${d2}"/></label>
        <label>寬度 <input id="thr-w" type="number" value="${t.width}"/> cm</label>
      </div>
      <div class="actions-row">
        <button id="thr-rotate">↻ 旋轉 90°</button>
        <button id="thr-apply">套用</button>
        <button class="del" id="thr-del">移除門檻</button>
      </div>
    `;
    // two-way reactive preview
    $('thr-d1').addEventListener('input',()=>{
      const w=+$('thr-w').value, d=+$('thr-d1').value;
      if(!isNaN(w)&&!isNaN(d)) $('thr-d2').value = totalLen-w-d;
    });
    $('thr-d2').addEventListener('input',()=>{
      const w=+$('thr-w').value, d=+$('thr-d2').value;
      if(!isNaN(w)&&!isNaN(d)) $('thr-d1').value = totalLen-w-d;
    });
    $('thr-w').addEventListener('input',()=>{
      const w=+$('thr-w').value, d=+$('thr-d1').value;
      if(!isNaN(w)&&!isNaN(d)) $('thr-d2').value = totalLen-w-d;
    });
    $('thr-rotate').onclick=()=>{ rotateThreshold(); render(); };
    $('thr-apply').onclick=()=>{
      const w=Math.max(1, +$('thr-w').value);
      let d=Math.max(0, +$('thr-d1').value);
      if(d+w>totalLen) d=Math.max(0, totalLen-w);
      state.threshold={axis:t.axis, width:w, offset:d};
      render();
    };
    $('thr-del').onclick=()=>{state.threshold=null; state.selected=null; render();};
    return;
  }
  if(state.selected.kind==='shaft'){
    const s=state.shafts.find(x=>x.id===state.selected.id);
    if(!s){ep.style.display='none';return;}
    const wallLen = wallLengthOf(s.wall);
    const r = state.room;
    const perpLen = (s.wall==='W1'||s.wall==='W3') ? r.width : r.length;
    tit.textContent = '管道間 — 貼 '+s.wall;
    const labels = {W1:['左下','右下'], W2:['左下','左上'], W3:['左上','右上'], W4:['右上','右下']}[s.wall] || ['A端','B端'];
    const atStart = s.offsetAlong < 0.5;
    body.innerHTML=`
      <div class="row">
        <label>沿牆長 <input id="sh-len" type="number" value="${s.lenAlong}"/> cm</label>
        <label>深度 <input id="sh-dep" type="number" value="${s.depth}"/> cm</label>
      </div>
      <div class="row">
        <label>角落
          <select id="sh-corner">
            <option value="start" ${atStart?'selected':''}>${labels[0]}</option>
            <option value="end" ${!atStart?'selected':''}>${labels[1]}</option>
          </select>
        </label>
      </div>
      <div class="actions-row">
        <button class="del" id="sh-del">移除管道間</button>
      </div>
    `;
    function applyShaftEdit(){
      const len = Math.max(5, Math.min(+$('sh-len').value || s.lenAlong, wallLen));
      const dep = Math.max(5, Math.min(+$('sh-dep').value || s.depth, perpLen));
      const corner = $('sh-corner').value;
      const off = (corner === 'start') ? 0 : Math.max(0, wallLen - len);
      s.lenAlong = len; s.depth = dep; s.offsetAlong = off;
      render({skipEditPanel:true});
    }
    $('sh-len').addEventListener('change', applyShaftEdit);
    $('sh-dep').addEventListener('change', applyShaftEdit);
    $('sh-corner').addEventListener('change', applyShaftEdit);
    $('sh-del').onclick=()=>{
      state.shafts = state.shafts.filter(x => x.id !== s.id);
      state.selected = null;
      render();
    };
    return;
  }
  // opening
  const o=state.openings.find(x=>x.id===state.selected.id);
  if(!o){ep.style.display='none';return;}
  const wW=wallLengthOf(o.wall);
  const right=wW-o.left-o.width;
  tit.textContent=o.id+'・'+(o.type==='door'?'門':'窗')+'・在 '+o.wall+' 上(牆 '+wW+'cm)';
  const isWin=o.type==='window';
  body.innerHTML=`
    <div class="row">
      <label>左距 <input id="op-l" type="number" value="${o.left}"/></label>
      <label>右距 <input id="op-r" type="number" value="${right}"/></label>
      <label>寬度 <input id="op-w" type="number" value="${o.width}"/></label>
    </div>
    <div class="row">
      ${isWin
        ? `<label>台度 <input id="op-b-or-h" type="number" value="${o.bottom}"/></label>
           <label>窗高 <input id="op-h2" type="number" value="${o.height}"/></label>`
        : `<label>門高 <input id="op-b-or-h" type="number" value="${o.height}"/></label>`
      }
    </div>
    <div class="actions-row">
      ${o.type==='door'?'<button id="op-cyc">↻ 換方向</button>':''}
      <button class="del" id="op-del">刪除</button>
    </div>
  `;

  // Live-apply: update state on every input event, preserve focus by skipping edit panel re-render
  function applyOpFields(){
    const wL = wallLengthOf(o.wall);
    const newW = +$('op-w').value;
    if(!isNaN(newW) && newW > 0) o.width = Math.max(1, Math.min(wL, newW));
    const newLeft = +$('op-l').value;
    if(!isNaN(newLeft)) o.left = Math.max(0, Math.min(wL - o.width, newLeft));
    if(isWin){
      const b = +$('op-b-or-h').value; if(!isNaN(b)) o.bottom = Math.max(0, b);
      const h = +$('op-h2').value; if(!isNaN(h) && h > 0) o.height = Math.max(1, h);
    } else {
      const h = +$('op-b-or-h').value; if(!isNaN(h) && h > 0) o.height = Math.max(1, h);
      o.bottom = 0;
    }
    // Sync the dependent right-distance display (don't touch the field user is typing in)
    if(document.activeElement && document.activeElement.id !== 'op-r'){
      $('op-r').value = wL - o.left - o.width;
    }
    render({skipEditPanel: true});
  }

  ['op-w', 'op-l', 'op-b-or-h', 'op-h2'].forEach(id => {
    const el = $(id);
    if(el) el.addEventListener('input', applyOpFields);
  });

  // op-r (right distance): edits convert to op-l (left = wallLen - width - right)
  const opR = $('op-r');
  if(opR){
    opR.addEventListener('input', () => {
      const wL = wallLengthOf(o.wall);
      const w = +$('op-w').value || o.width;
      const r = +opR.value;
      if(!isNaN(r)){
        const newL = Math.max(0, Math.min(wL - w, wL - w - r));
        $('op-l').value = newL;
      }
      applyOpFields();
    });
  }

  if(o.type==='door' && $('op-cyc')){
    $('op-cyc').onclick=()=>{cycleDoor(o); render();};
  }
  $('op-del').onclick=()=>{
    state.openings=state.openings.filter(x=>x.id!==o.id);
    state.selected=null; render();
  };
}

// ===== Tile preview rendering =====
function renderTilePreview(){
  // walls preview: 4 walls side by side
  const svgW=$('tile-walls');
  while(svgW.firstChild) svgW.removeChild(svgW.firstChild);
  const r=state.room;
  const fullH = r.wallHeight;
  const installH_pre = Math.min(state.room.installHeight, fullH);
  // Build a timeline per room wall: each wall is split into a flat sequence of
  // tile-able sub-segments so that pipe shafts produce visible side+front faces
  // inline at their position, and corner-perpendicular walls get a "hidden"
  // placeholder where the shaft sits behind them.
  const eps = 0.5;
  function buildHoleSlice(wallName, fromX, segLen){
    const installH = installH_pre;
    const out = [];
    for(const o of openingsOnWall(wallName)){
      if(o.bottom >= installH) continue;
      const ox1 = Math.max(o.left, fromX);
      const ox2 = Math.min(o.left + o.width, fromX + segLen);
      if(ox1 >= ox2) continue;
      out.push({x: ox1 - fromX, y: o.bottom, w: ox2 - ox1, h: Math.min(o.height, installH - o.bottom)});
    }
    return out;
  }
  function buildWallTimeline(wallName){
    const wallLen = wallLengthOf(wallName);
    const features = [];
    for(const s of state.shafts){
      if(s.wall === wallName){
        const atStart = s.offsetAlong < eps;
        const atEnd = s.offsetAlong + s.lenAlong > wallLen - eps;
        // Corner-only constraint: shafts always sit at a corner so atStart || atEnd
        // is expected to be true. The non-corner case is just defensive.
        features.push({kind:'primary', shaft:s, left:s.offsetAlong, width:s.lenAlong, atStart, atEnd});
      } else {
        for(const seg of shaftWallSegments(s)){
          if(seg.wall === wallName) features.push({kind:'perp', shaft:s, left:seg.left, width:seg.width});
        }
      }
    }
    features.sort((a,b) => a.left - b.left);
    const segs = [];
    let cursor = 0;
    for(const f of features){
      if(f.left > cursor + eps){
        segs.push({wall:wallName, kind:'wall', length:f.left-cursor, fromX:cursor,
                   holes:buildHoleSlice(wallName, cursor, f.left-cursor),
                   offsetX:state.tiles.offsetX[wallName] || 0, label:wallName});
      }
      if(f.kind === 'primary'){
        // Project the shaft's FRONT face onto its primary wall, replacing the
        // shaft footprint segment. The side face goes onto the perpendicular
        // corner wall (handled in the perp branch below for that wall).
        const s = f.shaft;
        segs.push({wall:wallName, kind:'shaft-face', length:s.lenAlong, fromX:f.left, holes:[], offsetX:0, shaftId:s.id, label:s.id+'·面'});
      } else { // perp-corner: project the SIDE face here (replaces what would be hidden)
        const s = f.shaft;
        segs.push({wall:wallName, kind:'shaft-face', length:f.width, fromX:f.left, holes:[], offsetX:0, shaftId:s.id, label:s.id+'·側'});
      }
      cursor = f.left + f.width;
    }
    if(cursor < wallLen - eps){
      segs.push({wall:wallName, kind:'wall', length:wallLen-cursor, fromX:cursor,
                 holes:buildHoleSlice(wallName, cursor, wallLen-cursor),
                 offsetX:state.tiles.offsetX[wallName] || 0, label:wallName});
    }
    if(segs.length) segs[segs.length-1].isLastInWall = true;
    return segs;
  }
  const wallSpecs = ['W1','W2','W3','W4'].flatMap(buildWallTimeline);
  const totalLen = wallSpecs.reduce((acc, s) => acc + s.length, 0);
  const pad=20, gap=14;
  const ws=document.querySelector('.col:last-child');
  const cw=ws?ws.clientWidth:720;
  const dimsOn = state.tiles.dimStyle !== 'off';
  const _numRows = (state.tiles.bondMode==='aligned'||state.tiles.bondMode==='v-half'||state.tiles.bondMode==='v-third') ? 1 : (state.tiles.bondMode==='half') ? 2 : 3;
  const _rowH = (state.tiles.dimStyle==='arch') ? 20 : 14;
  const _dimBotH = dimsOn ? ((_numRows + 1) * _rowH + 8) : 8;
  // v-bond needs wider side space for 2 interleaved height dim sub-columns
  const _isVBond = state.tiles.bondMode==='v-half'||state.tiles.bondMode==='v-third';
  const _vCols = state.tiles.bondMode==='v-third' ? 3 : 2;
  const _dimSideW = dimsOn ? (_isVBond ? (_vCols*14+18) : (state.tiles.dimStyle==='arch' ? 50 : 36)) : 8;
  const targetW = Math.max(420, cw - pad*2 - gap*3 - 28 - _dimSideW*2);
  const scaleW = Math.min(targetW/totalLen, (280 - _dimBotH)/fullH);
  const W = totalLen*scaleW + pad*2 + gap*3 + _dimSideW*2;
  const H = fullH*scaleW + pad*2 + _dimBotH + 8;
  svgW.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgW.style.maxHeight = '440px';

  // Adjust dim sizing
  const numDimRows = (state.tiles.bondMode==='aligned'||state.tiles.bondMode==='v-half'||state.tiles.bondMode==='v-third') ? 1 : (state.tiles.bondMode==='half') ? 2 : 3;
  const dimRowH = (state.tiles.dimStyle==='arch') ? 20 : 14;
  const dimBottomH = (numDimRows + 1) * dimRowH + 8;
  const isVBond = state.tiles.bondMode==='v-half'||state.tiles.bondMode==='v-third';
  const vCols2 = state.tiles.bondMode==='v-third' ? 3 : 2;
  const dimSideW = isVBond ? (vCols2*14+18) : (state.tiles.dimStyle==='arch' ? 50 : 36);

  let ox = pad + dimSideW;
  let allWallTiles = [];
  const wallTilesList = [];   // per spec index; empty array for hidden segments
  let nextWallNum = 1;        // cumulative across all tile-able segments
  wallSpecs.forEach(spec => {
    if(spec.kind === 'hidden'){
      wallTilesList.push([]);
      return;
    }
    const tiles = buildTiles(spec.length, installH_pre, state.tiles.wallW, state.tiles.wallH, grout(), nextWallNum, spec.holes, state.tiles.bondMode, spec.offsetX, state.tiles.offsetY || 0);
    nextWallNum += tiles.length;
    wallTilesList.push(tiles);
    allWallTiles = allWallTiles.concat(tiles);
  });
  const wallCuts0 = allWallTiles.filter(t => !t.full);
  const wallPairResult = pairCutTiles(wallCuts0, state.tiles.wallW, state.tiles.wallH);

  wallSpecs.forEach((spec, idx) => {
    const segLen = spec.length;
    const installH = installH_pre;

    if(spec.kind === 'hidden'){
      // Placeholder for the room wall section sitting behind the shaft. No
      // tiles, just a gray hatched panel so users see "this part is hidden".
      svgW.appendChild(mr({x:ox, y:pad, width:segLen*scaleW, height:fullH*scaleW,
                           fill:'rgba(120,120,110,0.12)', stroke:'var(--border2)', 'stroke-width':1, 'stroke-dasharray':'4 3'}));
      svgW.appendChild(ml({x:ox, y:pad}, {x:ox+segLen*scaleW, y:pad+fullH*scaleW}, 'preview-shaft-hatch'));
      svgW.appendChild(ml({x:ox+segLen*scaleW, y:pad}, {x:ox, y:pad+fullH*scaleW}, 'preview-shaft-hatch'));
      const lblH = mt(ox + segLen*scaleW/2, pad - 4, spec.label, 'preview-label');
      lblH.setAttribute('font-size', '9');
      svgW.appendChild(lblH);
      ox += segLen * scaleW;
      if(spec.isLastInWall && idx !== wallSpecs.length - 1) ox += gap;
      return;
    }

    const tiles = wallTilesList[idx];
    const isShaftFace = spec.kind === 'shaft-face';
    // segment outline (slightly thicker on shaft faces for clear division)
    svgW.appendChild(mr({x:ox, y:pad, width:segLen*scaleW, height:fullH*scaleW,
                         fill:'none',
                         stroke: isShaftFace ? 'var(--info)' : 'var(--border2)',
                         'stroke-width': isShaftFace ? 1.4 : 1}));
    for(const t of tiles){
      for(const p of t.pieces){
        const py = (fullH - p.y - p.h)*scaleW;
        const cls = 'tile'+(t.full?'':' cut')+(isShaftFace ? ' shaft' : '');
        svgW.appendChild(mr({x:ox+p.x*scaleW, y:pad+py, width:p.w*scaleW, height:p.h*scaleW}, cls));
      }
      if(t.pieces.length){
        const main = t.pieces.reduce((a,p) => p.w*p.h > a.w*a.h ? p : a);
        const minDimPx = Math.min(main.w, main.h) * scaleW;
        const fs = Math.max(5, Math.min(8, minDimPx * 0.4));
        let displayNum;
        if(state.tiles.cuttingMode === 'optimized' && !t.full && t.donorCount > 1){
          displayNum = t.donorPrimaryNumber + '-' + t.donorPos;
        } else {
          displayNum = String(t.number);
        }
        const numEl = mt(ox+(main.x+main.w/2)*scaleW, pad+(fullH-main.y-main.h/2)*scaleW, displayNum, 'tile-num');
        numEl.setAttribute('font-size', fs);
        svgW.appendChild(numEl);
      }
    }
    svgW.appendChild(ml(
      {x:ox, y:pad+(fullH-installH)*scaleW},
      {x:ox+segLen*scaleW, y:pad+(fullH-installH)*scaleW},
      'install-line'));
    // openings (only on actual wall segments) — clip them to this segment's local x
    if(spec.kind === 'wall'){
      const fromX = spec.fromX || 0;
      openingsOnWall(spec.wall).forEach(o => {
        const ox1 = Math.max(o.left, fromX);
        const ox2 = Math.min(o.left + o.width, fromX + segLen);
        if(ox1 >= ox2) return;
        const rx = ox + (ox1-fromX)*scaleW;
        const ry = pad + (fullH-o.bottom-o.height)*scaleW;
        const rw = (ox2-ox1)*scaleW;
        const rh = o.height*scaleW;
        // Extend fill 3px beyond opening bounds to fully cover adjacent tile stroke lines
        svgW.appendChild(mr({x:rx, y:ry-3, width:rw, height:rh+6, fill:'var(--bg2)', stroke:'none'}));
        // Small type label at center — no border lines at all
        const labelText = o.type === 'door' ? '門' : '窗';
        const lbl = mt(rx+rw/2, ry+rh/2, labelText, 'preview-label');
        lbl.setAttribute('font-size', Math.max(7, Math.min(11, Math.min(rw,rh)*0.3)));
        lbl.setAttribute('opacity', '0.5');
        svgW.appendChild(lbl);
      });
    }
    // Label above every segment so users can match wall preview to plan view:
    //   - wall segment -> W1 / W2 / W3 / W4
    //   - shaft face   -> P1·面 / P1·側
    if(spec.kind === 'wall' || isShaftFace){
      const lbl = mt(ox + segLen*scaleW/2, pad - 4, spec.label, 'preview-label');
      lbl.setAttribute('font-size', '9');
      lbl.setAttribute('font-weight', spec.kind === 'wall' ? '600' : '500');
      svgW.appendChild(lbl);
    }
    drawWidthDim(svgW, ox, pad + fullH*scaleW + 4, segLen, scaleW,
                 state.tiles.wallW, state.tiles.wallH, grout(),
                 state.tiles.bondMode, state.tiles.dimStyle, spec.offsetX);
    if(idx === 0){
      drawHeightDim(svgW, ox - 6, pad, fullH, installH, scaleW, 'left',
                    state.tiles.wallH, grout(), state.tiles.dimStyle, state.tiles.offsetY || 0, state.tiles.bondMode);
    }
    ox += segLen * scaleW;
    if(idx === wallSpecs.length - 1){
      drawHeightDim(svgW, ox + 6, pad, fullH, installH, scaleW, 'right',
                    state.tiles.wallH, grout(), state.tiles.dimStyle, state.tiles.offsetY || 0, state.tiles.bondMode);
    }
    // Only add a gap when crossing from one wall's last segment to the next wall.
    if(spec.isLastInWall && idx !== wallSpecs.length - 1) ox += gap;
  });

  // Build floor tile data (for stats only — drawing happens in renderPlan via g-tiles)
  const thr=thresholdRect();
  const fHoles = thr ? [thr] : [];
  for(const s of state.shafts) fHoles.push(shaftFloorRect(s));
  const floorTiles=buildTiles(r.length, r.width, state.tiles.floorW, state.tiles.floorH, groutF(), 1, fHoles, state.tiles.floorBondMode, state.tiles.floorOffset.x, state.tiles.floorOffset.y);
  const floorCuts0 = floorTiles.filter(t => !t.full);
  const floorPairResult = pairCutTiles(floorCuts0, state.tiles.floorW, state.tiles.floorH);

  return {wallTiles:allWallTiles, wallSpecs, wallTilesList, floorTiles, wallPair: wallPairResult, floorPair: floorPairResult};
}

// ===== Unfolded box view =====
// Floor in center, 4 walls splayed outward (like an open cardboard box).
// Coordinate system (in cm, before scale):
//   total area = (L + 2*H) × (W + 2*H), where H = installHeight
//   floor occupies (H, H) to (H+L, H+W)
//   W1 (bottom): unfolds DOWN, occupies (H, H+W) to (H+L, H+W+H)
//   W3 (top): unfolds UP, occupies (H, 0) to (H+L, H), with vertical flip
//   W2 (left): unfolds LEFT, rotated 90°
//   W4 (right): unfolds RIGHT, rotated 90°
function renderUnfolded(allTiles){
  const svg = document.getElementById('tile-unfolded');
  if(!svg) return;
  while(svg.firstChild) svg.removeChild(svg.firstChild);
  const r = state.room;
  const L = r.length, W = r.width, H = r.installHeight;

  // Layout dims (cm)
  const totalCmW = L + 2*H;
  const totalCmH = W + 2*H;

  // Scale to fit container
  const container = svg.parentElement || document.querySelector('.col:last-child');
  const cwUF = container ? container.clientWidth : 700;
  const padUF = 24;  // extra padding for outer wall labels
  const targetW = Math.max(360, cwUF - padUF*2 - 28);
  const targetH = 540;
  const scale = Math.min(targetW / totalCmW, targetH / totalCmH);

  const FW = totalCmW * scale + padUF*2;
  const FH = totalCmH * scale + padUF*2;
  svg.setAttribute('viewBox', `0 0 ${FW} ${FH}`);
  svg.style.maxHeight = (targetH + padUF*2) + 'px';

  const ox = padUF, oy = padUF;
  const cmRect = (x, y, w, h, cls) => mr({x: ox + x*scale, y: oy + y*scale, width: w*scale, height: h*scale}, cls);
  const cmText = (x, y, text, cls) => {
    const e = mt(ox + x*scale, oy + y*scale, text, cls);
    return e;
  };

  // Tile label helper (handles optimized-mode pairing)
  function tileLabel(t, isFloor){
    const prefix = isFloor ? 'F' : '';
    if(state.tiles.cuttingMode === 'optimized' && !t.full && t.donorCount > 1){
      return prefix + t.donorPrimaryNumber + '-' + t.donorPos;
    }
    return prefix + t.number;
  }

  // Generic tile + number drawer
  function drawTileWithNum(tile, uX, uY, uW, uH, isFloor){
    const cls = (isFloor ? 'uf-floor' : 'uf-wall') + (tile.full ? '' : ' cut');
    svg.appendChild(cmRect(uX, uY, uW, uH, cls));
    // Number text — sized based on rendered tile dimensions
    const minPx = Math.min(uW, uH) * scale;
    const fs = Math.max(4, Math.min(8, minPx * 0.32));
    if(fs >= 4.5){
      const numEl = cmText(uX + uW/2, uY + uH/2, tileLabel(tile, isFloor), 'uf-tile-num');
      numEl.setAttribute('font-size', fs);
      svg.appendChild(numEl);
    }
  }

  // Transform wall-local tile → unfolded coords (returns {x,y,w,h} in cm)
  function w1Tile(tx, ty, tw, th){ return {x: H + tx,            y: H + W + ty,             w: tw, h: th}; }
  function w3Tile(tx, ty, tw, th){ return {x: H + tx,            y: H - ty - th,            w: tw, h: th}; }
  function w2Tile(tx, ty, tw, th){ return {x: H - ty - th,       y: H + W - tx - tw,        w: th, h: tw}; }
  function w4Tile(tx, ty, tw, th){ return {x: H + L + ty,        y: H + tx,                 w: th, h: tw}; }
  const tileTransform = { W1: w1Tile, W2: w2Tile, W3: w3Tile, W4: w4Tile };

  // ---------- WALL TILES (segmented; reuses the wall-preview wallSpecs so
  // shaft visible faces show up here too, recolored as .uf-wall.shaft) ----------
  if(allTiles && allTiles.wallSpecs && allTiles.wallTilesList){
    allTiles.wallSpecs.forEach((spec, i) => {
      if(spec.kind === 'hidden') return; // defensive; corner-only doesn't emit hidden
      if(!tileTransform[spec.wall]) return; // skip non-wall groups
      const tx = tileTransform[spec.wall];
      const tiles = allTiles.wallTilesList[i] || [];
      const isShaftFace = spec.kind === 'shaft-face';
      const fromX = spec.fromX || 0;
      for(const t of tiles){
        for(const p of t.pieces){
          const u = tx(p.x + fromX, p.y, p.w, p.h);
          const cls = (t.full ? 'uf-wall' : 'uf-wall cut') + (isShaftFace ? ' shaft' : '');
          svg.appendChild(cmRect(u.x, u.y, u.w, u.h, cls));
          // Number text — same sizing logic as drawTileWithNum
          const minPx = Math.min(u.w, u.h) * scale;
          const fs = Math.max(4, Math.min(8, minPx * 0.32));
          if(fs >= 4.5){
            const numEl = cmText(u.x + u.w/2, u.y + u.h/2, tileLabel(t, false), 'uf-tile-num');
            numEl.setAttribute('font-size', fs);
            svg.appendChild(numEl);
          }
        }
      }
    });
  }

  // ---------- FLOOR TILES ----------
  if(allTiles && allTiles.floorTiles){
    for(const t of allTiles.floorTiles){
      for(const p of t.pieces){
        drawTileWithNum(t, H + p.x, H + p.y, p.w, p.h, true);
      }
    }
  }

  // ---------- OPENINGS ----------
  function openingUnfolded(o){
    const {wall, left, width, bottom, height} = o;
    if(wall === 'W1') return {x: H + left,                y: H + W + bottom,         w: width, h: height};
    if(wall === 'W3') return {x: H + left,                y: H - bottom - height,    w: width, h: height};
    if(wall === 'W2') return {x: H - bottom - height,     y: H + W - left - width,   w: height, h: width};
    if(wall === 'W4') return {x: H + L + bottom,          y: H + left,               w: height, h: width};
    return null;
  }
  for(const o of state.openings){
    const u = openingUnfolded(o);
    if(!u) continue;
    svg.appendChild(cmRect(u.x, u.y, u.w, u.h, 'uf-opening'));
    // Opening label (Door / Window)
    const labelText = o.type === 'door' ? '門' : '窗';
    const labelEl = cmText(u.x + u.w/2, u.y + u.h/2, labelText, 'uf-opening-label');
    labelEl.setAttribute('font-size', Math.max(8, Math.min(13, Math.min(u.w, u.h) * scale * 0.25)));
    svg.appendChild(labelEl);
  }

  // ---------- THRESHOLD ----------
  const thr = thresholdRect();
  if(thr){
    svg.appendChild(cmRect(H + thr.x, H + thr.y, thr.w, thr.h, 'uf-thr'));
  }

  // ---------- PIPE SHAFTS (floor footprint, matches plan-view styling) ----------
  for(const s of state.shafts){
    const fr = shaftFloorRect(s);
    const sx = ox + (H + fr.x) * scale;
    const sy = oy + (H + fr.y) * scale;
    const sw = fr.w * scale, sh = fr.h * scale;
    svg.appendChild(mr({x:sx, y:sy, width:sw, height:sh}, 'uf-shaft'));
    svg.appendChild(ml({x:sx, y:sy}, {x:sx+sw, y:sy+sh}, 'uf-shaft-hatch'));
    svg.appendChild(ml({x:sx+sw, y:sy}, {x:sx, y:sy+sh}, 'uf-shaft-hatch'));
    const fs = Math.max(8, Math.min(11, Math.min(sw, sh) * 0.18));
    const lbl = mt(sx+sw/2, sy+sh/2, s.lenAlong+'×'+s.depth, 'uf-shaft-label');
    lbl.setAttribute('font-size', fs);
    svg.appendChild(lbl);
  }

  // ---------- FLOOR DRAINS ----------
  for(const dr of (state.drains || [])){
    const DS = 10, hs = DS / 2;
    const drUx = H + dr.x - hs;  // top-left in unfolded cm coords
    const drUy = H + dr.y - hs;
    const drPx = ox + drUx * scale;
    const drPy = oy + drUy * scale;
    const drSz = DS * scale;
    const drCpx = drPx + drSz / 2;
    const drCpy = drPy + drSz / 2;
    // Square
    svg.appendChild(mr({x:drPx, y:drPy, width:drSz, height:drSz}, 'uf-drain-rect'));
    // Cross
    svg.appendChild(ml({x:drPx, y:drCpy}, {x:drPx+drSz, y:drCpy}, 'uf-drain-cross'));
    svg.appendChild(ml({x:drCpx, y:drPy}, {x:drCpx, y:drPy+drSz}, 'uf-drain-cross'));
    // Label ID
    const dlbl = mt(drCpx, drPy - 3, dr.id, 'uf-drain-label');
    dlbl.setAttribute('font-size', 7);
    svg.appendChild(dlbl);
  }

  // ---------- OUTLINES (last → on top) ----------
  svg.appendChild(cmRect(H, H + W, L, H, 'uf-wall-bound'));   // W1
  svg.appendChild(cmRect(H, 0, L, H, 'uf-wall-bound'));       // W3
  svg.appendChild(cmRect(0, H, H, W, 'uf-wall-bound'));       // W2
  svg.appendChild(cmRect(H + L, H, H, W, 'uf-wall-bound'));   // W4
  svg.appendChild(cmRect(H, H, L, W, 'uf-floor-bound'));      // Floor

  // ---------- WALL LENGTH LABELS (outside each wall region) ----------
  // W1 below, W3 above, W2 to left, W4 to right
  const lblFontSize = 12;
  // W1 label below W1 region
  const w1Lbl = cmText(H + L/2, H + W + H + 14/scale, `W1 ${L}cm`, 'uf-wall-label');
  w1Lbl.setAttribute('font-size', lblFontSize);
  svg.appendChild(w1Lbl);
  // W3 label above W3 region
  const w3Lbl = cmText(H + L/2, -14/scale, `W3 ${L}cm`, 'uf-wall-label');
  w3Lbl.setAttribute('font-size', lblFontSize);
  svg.appendChild(w3Lbl);
  // W2 label to left of W2 region (rotated 90° CCW so it reads bottom-up)
  const w2Lbl = mt(ox + (-14), oy + (H + W/2)*scale, `W2 ${W}cm`, 'uf-wall-label');
  w2Lbl.setAttribute('font-size', lblFontSize);
  w2Lbl.setAttribute('transform', `rotate(-90, ${ox + (-14)}, ${oy + (H + W/2)*scale})`);
  svg.appendChild(w2Lbl);
  // W4 label to right of W4 region (rotated 90° CW)
  const w4Lbl = mt(ox + (H + L + H)*scale + 14, oy + (H + W/2)*scale, `W4 ${W}cm`, 'uf-wall-label');
  w4Lbl.setAttribute('font-size', lblFontSize);
  w4Lbl.setAttribute('transform', `rotate(90, ${ox + (H + L + H)*scale + 14}, ${oy + (H + W/2)*scale})`);
  svg.appendChild(w4Lbl);
  // Floor area label (small, in floor center)
  const flLbl = cmText(H + L/2, H + W/2, `Floor ${L}×${W}cm`, 'uf-corner-label');
  flLbl.setAttribute('font-size', Math.max(9, Math.min(13, Math.min(L, W) * scale * 0.04)));
  svg.appendChild(flLbl);
}

// ===== Stats =====
function updateStats(allTiles){
  const wallTiles=allTiles.wallTiles, floorTiles=allTiles.floorTiles;
  const wFull=wallTiles.filter(t=>t.full).length;
  const wCut=wallTiles.length-wFull;
  const fFull=floorTiles.filter(t=>t.full).length;
  const fCut=floorTiles.length-fFull;
  // Naive: each cut tile uses one donor
  const wallBuyNaive = wFull + wCut;
  const floorBuyNaive = fFull + fCut;
  // Optimized: use pairing results
  const wallBuyOpt = wFull + (allTiles.wallPair ? allTiles.wallPair.purchaseCount : wCut);
  const floorBuyOpt = fFull + (allTiles.floorPair ? allTiles.floorPair.purchaseCount : fCut);
  const totalNaive = wallBuyNaive + floorBuyNaive;
  const totalOpt = wallBuyOpt + floorBuyOpt;
  const savings = totalNaive - totalOpt;
  const isOpt = state.tiles.cuttingMode === 'optimized';
  const wBuy = isOpt ? wallBuyOpt : wallBuyNaive;
  const fBuy = isOpt ? floorBuyOpt : floorBuyNaive;
  const r=state.room;
  const thr=thresholdRect();
  // Perimeter = room perimeter (all 4 walls, no subtraction)
  const perimeter = 2 * (r.length + r.width);
  // Wall area = installHeight × perimeter, MINUS door/window opening areas
  let openingAreaCm2 = 0;
  for(const o of state.openings){
    const wallLen = wallLengthOf(o.wall);
    if(o.type === 'door'){
      // Tile from floor to install height; door occupies its full height up to wall height
      // Use install height as the door-free height; assume door is full height
      openingAreaCm2 += o.width * r.installHeight;
    } else if(o.type === 'window'){
      // Window: tiles below (0 to bottom) and above (bottom+height to installH)
      // window.bottom = sill height from floor, window height typically installH-bottom-30ish
      // We compute window area as width × (installHeight - bottom) clamped to installH
      const winH = Math.max(0, r.installHeight - (o.bottom || 0));
      openingAreaCm2 += o.width * winH;
    }
  }
  // Shaft visible faces replace equal wall area, so no net change to wall tile count
  const wallArea = Math.max(0, r.installHeight * perimeter - openingAreaCm2) / 10000;
  // Floor area = room minus threshold and all shaft footprints
  let shaftFloorCm2 = 0;
  for(const s of state.shafts){
    const fr = shaftFloorRect(s);
    shaftFloorCm2 += fr.w * fr.h;
  }
  const floorArea = (r.length*r.width - (thr?thr.w*thr.h:0) - shaftFloorCm2) / 10000;
  const wallSavings = wallBuyNaive - wallBuyOpt;
  const floorSavings = floorBuyNaive - floorBuyOpt;
  function buySubText(savings, isOptMode){
    if(savings <= 0) return '片';
    return isOptMode ? `片 / 省 ${savings}` : `片 / 最佳化可省 ${savings}`;
  }
  $('s-w-full').textContent = wFull;
  $('s-w-cut').textContent = wCut;
  $('s-w-buy').textContent = wBuy;
  $('s-w-buy-sub').textContent = buySubText(wallSavings, isOpt);
  $('s-w-area').textContent = wallArea.toFixed(2);
  $('s-w-pin').textContent = (wallArea / 3.30579).toFixed(2);
  $('s-f-full').textContent = fFull;
  $('s-f-cut').textContent = fCut;
  $('s-f-buy').textContent = fBuy;
  $('s-f-buy-sub').textContent = buySubText(floorSavings, isOpt);
  $('s-f-area').textContent = floorArea.toFixed(2);
  $('s-f-pin').textContent = (floorArea / 3.30579).toFixed(2);
  // ── Room dimension stats ─────────────────────────────────────────────
  const roomFloorArea = (r.length * r.width) / 10000;
  if($('s-room-size'))       $('s-room-size').textContent       = `${r.length}×${r.width}`;
  if($('s-perimeter'))       $('s-perimeter').textContent       = perimeter;
  if($('s-wall-h'))          $('s-wall-h').textContent          = r.wallHeight;
  if($('s-install-h'))       $('s-install-h').textContent       = r.installHeight;
  if($('s-floor-area-room')) $('s-floor-area-room').textContent = roomFloorArea.toFixed(2);
  // Floor area badge in plan area
  const fab = $('floor-area-badge');
  if(fab) fab.textContent = roomFloorArea.toFixed(2) + ' m²';
  // per-preview inline
  const ws=$('walls-stats'), fs=$('floor-stats');
  if(ws) ws.innerHTML = `<span>全片<strong>${wFull}</strong></span><span>裁切<strong>${wCut}</strong></span><span>估購<strong>${wBuy}</strong></span><span class="wall-area-badge">${wallArea.toFixed(2)} m²</span>`;
  // Floor stats in fx-ctrl row (top-right of plan)
  $('s-f-full') && ($('s-f-full').textContent = fFull);
  $('s-f-cut')  && ($('s-f-cut').textContent  = fCut);
  $('s-f-buy')  && ($('s-f-buy').textContent  = fBuy);
  $('s-f-buy-sub') && ($('s-f-buy-sub').textContent = buySubText(floorSavings, isOpt));
  const floorBadge = $('floor-area-badge');
  if(floorBadge) floorBadge.textContent = floorArea.toFixed(2) + ' m²';
}

// ===== Master render =====
function renderMaterialSummary(allStats){
  // allStats = { wFull, wCut, wBuy, wallArea, fFull, fCut, fBuy, floorArea } from updateStats
  const trimEl = $('trim-calc-section');
  const el = $('material-summary');
  if(trimEl) trimEl.style.display = 'none'; // legacy, replaced by this
  if(!el) return;

  const r = state.room;
  const H = r.installHeight;
  const STRIP = state.trimStripLen || 240;
  const mat = state.materials || {};
  const windows = (state.openings || []).filter(o => o.type === 'window');
  const shafts  = state.shafts || [];
  const hasTrim = windows.length > 0 || shafts.length > 0;
  const hasThr  = !!state.threshold;

  // Pull tile stats from DOM (updateStats already ran)
  const wBuy  = ($('s-w-buy') || {}).textContent  || '—';
  const wSub  = ($('s-w-buy-sub') || {}).textContent || '';
  const fBuy  = ($('s-f-buy') || {}).textContent  || '—';
  const fSub  = ($('s-f-buy-sub') || {}).textContent || '';
  const wArea = ($('s-w-area') || {}).textContent || '—';
  const fArea = ($('s-f-area') || {}).textContent || '—';

  // ── Trim strip rows ──────────────────────────────────────────────────
  let trimRows = '', trimTotal = 0;
  for(const w of windows){
    const lenW = w.width * 2, lenH = w.height * 2, tot = lenW + lenH;
    const qty = Math.ceil(tot / STRIP);
    trimTotal += qty;
    trimRows += `<div class="msm-row">
      <span class="msm-label">窗 ${w.wall}</span>
      <span class="msm-model" style="font-size:11px;font-weight:400">寬${w.width}×2&nbsp;+&nbsp;高${w.height}×2&nbsp;=&nbsp;${tot}&thinsp;cm</span>
      <span class="msm-qty"><span class="msm-bold">${qty}</span> 條</span>
    </div>`;
  }
  for(const s of shafts){
    const corners = shaftExposedCorners(s);
    const tot = corners * H;
    const qty = Math.ceil(tot / STRIP);
    trimTotal += qty;
    const cornerNote = corners === 1 ? '雙面貼牆 ×1' : '×2 轉角';
    trimRows += `<div class="msm-row">
      <span class="msm-label">管道間 ${s.wall}</span>
      <span class="msm-model" style="font-size:11px;font-weight:400">高${H}&thinsp;cm&nbsp;${cornerNote}&nbsp;=&nbsp;${tot}&thinsp;cm</span>
      <span class="msm-qty"><span class="msm-bold">${qty}</span> 條</span>
    </div>`;
  }

  // ── Threshold rows ───────────────────────────────────────────────────
  let thrRows = '', thrTotal = 0;
  if(hasThr){
    const t = state.threshold;
    const thrLen = t.axis==='y' ? r.width : r.length;
    const qty = Math.ceil(t.width / STRIP) || 1;
    thrTotal += qty;
    thrRows = `<div class="msm-row">
      <span class="msm-label">門檻</span>
      <span class="msm-model" style="font-size:11px;font-weight:400">${t.width}×${thrLen}&thinsp;cm</span>
      <span class="msm-qty"><span class="msm-bold">${qty}</span> 條</span>
    </div>`;
  }

  // ── Assemble HTML ────────────────────────────────────────────────────
  const locLabel = mat.location ? `— ${mat.location}` : '';
  const stripInput = `<input id="msm-strip-len" type="number" min="60" max="600" step="10"
    value="${STRIP}" style="width:42px;padding:1px 4px;border:1px solid var(--line2,#ccc);
    border-radius:3px;font-size:11px;text-align:center;background:var(--bg);color:var(--fg)">`;

  // ── Update inline strip count in plan stats row ───────────────────────
  const totalStrips = trimTotal + thrTotal;
  const stripStatEl = $('strip-stat-count');
  if(stripStatEl) stripStatEl.textContent = totalStrips;
  const stripInlineEl = $('strip-total-inline');
  if(stripInlineEl) stripInlineEl.textContent = totalStrips;

  // Strip length input handler (settings-compact version)
  const si = $('msm-strip-len');
  if(si && !si._bound){
    si._bound = true;
    si.addEventListener('change', e => {
      const v = +e.target.value;
      if(v >= 60){ state.trimStripLen = v; render(); }
    });
  }
}

function renderTrimCalc(){ /* replaced by renderMaterialSummary */ }

function render(opts){
  opts = opts || {};
  if(!opts.skipEditPanel) renderEditPanel();
  const all = renderTilePreview();
  renderPlan({floorTiles: all.floorTiles, floorPair: all.floorPair});
  renderUnfolded(all);
  updateStats(all);
  renderDrainThrTable();
  renderMaterialSummary();
}
