// Top-down SVG rendering and direct manipulation interactions.
function planScale(){
  const r=state.room;
  const cv=$('cv-container');
  const cw=cv?cv.clientWidth:600;
  const targetW = Math.max(360, cw - 28);
  const targetH = 460;
  const pad = 50;
  return Math.min((targetW - pad*2) / r.length, (targetH - pad*2) / r.width);
}

function ml(a,b,c){const l=document.createElementNS(NS,'line');l.setAttribute('x1',a.x);l.setAttribute('y1',a.y);l.setAttribute('x2',b.x);l.setAttribute('y2',b.y);l.setAttribute('class',c);return l;}
function mc(x,y,r,c){const e=document.createElementNS(NS,'circle');e.setAttribute('cx',x);e.setAttribute('cy',y);e.setAttribute('r',r);e.setAttribute('class',c);return e;}
function mt(x,y,t,c){const e=document.createElementNS(NS,'text');e.setAttribute('x',x);e.setAttribute('y',y);e.setAttribute('class',c);e.setAttribute('text-anchor','middle');e.setAttribute('dominant-baseline','middle');e.textContent=t;return e;}
function mr(attrs,c){const e=document.createElementNS(NS,'rect');for(const k in attrs)e.setAttribute(k,attrs[k]);if(c)e.setAttribute('class',c);return e;}

function makeInlineInput(cx,cy,value,onApply,opts){
  opts=opts||{};
  const w=opts.width||56, h=opts.height||24;
  const fo=document.createElementNS(NS,'foreignObject');
  fo.setAttribute('x',cx-w/2); fo.setAttribute('y',cy-h/2);
  fo.setAttribute('width',w); fo.setAttribute('height',h);
  fo.setAttribute('class','dim-fo');
  const div=document.createElement('div');
  div.className='dim-edit'+(opts.wallStyle?' dim-edit-wall':'');
  const input=document.createElement('input');
  input.type='number'; input.inputMode='numeric'; input.pattern='[0-9]*';
  input.value=Math.round(value);
  input.addEventListener('focus',e=>{e.stopPropagation();setTimeout(()=>input.select(),0);});
  input.addEventListener('click',e=>e.stopPropagation());
  input.addEventListener('mousedown',e=>e.stopPropagation());
  input.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
  input.addEventListener('blur',()=>onApply(parseFloat(input.value)));
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter') input.blur();
    if(e.key==='Escape'){input.value=Math.round(value);input.blur();}
  });
  div.appendChild(input); fo.appendChild(div);
  return fo;
}

// Plan coords: room is at (pad, pad) to (pad+L*scale, pad+W*scale)
// W1 (south) = bottom edge, W2 (west) = left, W3 (north) = top, W4 (east) = right
// In plan coords (svg), y goes DOWN, so W1 is at high y, W3 at low y.
function wallPath(name, scale, pad){
  const r=state.room;
  const L=r.length*scale, W=r.width*scale;
  if(name==='W1') return {a:{x:pad,y:pad+W}, b:{x:pad+L,y:pad+W}};
  if(name==='W2') return {a:{x:pad,y:pad+W}, b:{x:pad,y:pad}};      // bottom-left up to top-left
  if(name==='W3') return {a:{x:pad,y:pad}, b:{x:pad+L,y:pad}};      // top-left to top-right
  if(name==='W4') return {a:{x:pad+L,y:pad}, b:{x:pad+L,y:pad+W}};  // top-right down to bottom-right
}

function renderPlan(floorData){
  const svg=$('canvas');
  const Gw=$('g-w'),Gtiles=$('g-tiles'),Gwalls=$('g-walls'),Go=$('g-o'),Gd=$('g-d'),Ga=$('g-a'),Gc=$('g-c'),
        Gwh=$('g-wh'),Goh=$('g-oh'),Gthr=$('g-thr'),Gdrain=$('g-drain'),Gshaft=$('g-shaft'),Gpdim=$('g-pdim'),Gadd=$('g-add'),Gedit=$('g-edit');
  [Gw,Gtiles,Gwalls,Go,Gd,Ga,Gc,Gwh,Goh,Gthr,Gdrain,Gshaft,Gpdim,Gadd,Gedit].forEach(g=>g.innerHTML='');

  const r=state.room;
  const scale=planScale();
  const pad=80;
  const svgW = r.length*scale + pad*2;
  const svgH = r.width*scale + pad*2;
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.style.maxHeight = '480px';

  // floor background
  Gw.appendChild(mr({x:pad, y:pad, width:r.length*scale, height:r.width*scale, fill:'var(--bg)', stroke:'none'}));

  // floor tiles (drawn before openings/threshold/etc — under everything but floor bg)
  if(floorData && floorData.floorTiles){
    for(const t of floorData.floorTiles){
      for(const p of t.pieces){
        Gtiles.appendChild(mr(
          {x:pad+p.x*scale, y:pad+p.y*scale, width:p.w*scale, height:p.h*scale},
          'plan-tile'+(t.full?'':' cut')
        ));
      }
      if(t.pieces.length){
        const main = t.pieces.reduce((a,p) => p.w*p.h > a.w*a.h ? p : a);
        const minDimPx = Math.min(main.w, main.h) * scale;
        const fs = Math.max(5, Math.min(8, minDimPx * 0.35));
        let displayNum;
        if(state.tiles.cuttingMode === 'optimized' && !t.full && t.donorCount > 1){
          displayNum = t.donorPrimaryNumber + '-' + t.donorPos;
        } else {
          displayNum = String(t.number);
        }
        const numEl = mt(pad+(main.x+main.w/2)*scale, pad+(main.y+main.h/2)*scale, displayNum, 'plan-tile-num');
        numEl.setAttribute('font-size', fs);
        Gtiles.appendChild(numEl);
      }
    }
  }

  // threshold rect on floor (drawn beneath walls/openings)
  if(state.threshold){
    const t=thresholdRect();
    const sel=state.selected && state.selected.kind==='threshold';
    const isDragging = dragging && dragging.kind==='threshold';
    const showDim = sel || isDragging;
    const tr=mr({x:pad+t.x*scale, y:pad+t.y*scale, width:t.w*scale, height:t.h*scale}, 'thr-rect'+(sel?' sel':''));
    tr.dataset.thr='1';
    Gthr.appendChild(tr);
    const lbl = mt(pad+(t.x+t.w/2)*scale, pad+(t.y+t.h/2)*scale, '门槛 '+t.w+'cm', 'preview-label');
    lbl.setAttribute('fill','#80603a');
    lbl.setAttribute('font-weight','700');
    Gthr.appendChild(lbl);

    // Dim lines + inline inputs showing distance to both side walls
    if(showDim){
      const th = state.threshold;
      const isY = th.axis === 'y';   // vertical strip along X axis
      const THR = '#80603a';
      const dim = 28;

      // Helper: amber line
      const aml = (a,b,cls) => { const l=ml(a,b,cls); l.setAttribute('stroke',THR); l.setAttribute('opacity','0.85'); return l; };

      // Helper: amber inline input
      const ami = (x, y, val, cb) => {
        const fo = makeInlineInput(x, y, val, cb, {width:54, height:22});
        const inp = fo.querySelector('input');
        if(inp){ inp.style.borderColor=THR; inp.style.color=THR; inp.style.fontWeight='700'; }
        return fo;
      };

      if(isY){
        // Vertical threshold — shows left / right distances below room
        const sx = pad + th.offset * scale;          // threshold left edge
        const ex = pad + (th.offset + th.width)*scale; // threshold right edge
        const roomBottom = pad + r.width * scale;
        const lineY = roomBottom + dim;

        // Left: from room left edge to threshold left
        Ga.appendChild(aml({x:pad, y:roomBottom},{x:pad, y:lineY},'ot'));
        Ga.appendChild(aml({x:sx,  y:roomBottom},{x:sx,  y:lineY},'ot'));
        Ga.appendChild(aml({x:pad, y:lineY},{x:sx, y:lineY},'od'));
        Gedit.appendChild(ami((pad+sx)/2, lineY+13,
          Math.round(th.offset),
          val => { applyThrDist('start', +val); render(); }));

        // Right: from threshold right to room right
        const rwX = pad + r.length * scale;
        Ga.appendChild(aml({x:ex,  y:roomBottom},{x:ex,  y:lineY},'ot'));
        Ga.appendChild(aml({x:rwX, y:roomBottom},{x:rwX, y:lineY},'ot'));
        Ga.appendChild(aml({x:ex, y:lineY},{x:rwX, y:lineY},'od'));
        Gedit.appendChild(ami((ex+rwX)/2, lineY+13,
          Math.round(r.length - th.offset - th.width),
          val => { applyThrDist('end', +val); render(); }));
      } else {
        // Horizontal threshold — shows top / bottom distances right of room
        const sy = pad + th.offset * scale;
        const ey = pad + (th.offset + th.width)*scale;
        const roomRight = pad + r.length * scale;
        const lineX = roomRight + dim;

        // Top: room top to threshold top
        Ga.appendChild(aml({x:roomRight, y:pad},{x:lineX, y:pad},'ot'));
        Ga.appendChild(aml({x:roomRight, y:sy}, {x:lineX, y:sy}, 'ot'));
        Ga.appendChild(aml({x:lineX, y:pad},{x:lineX, y:sy},'od'));
        Gedit.appendChild(ami(lineX+13, (pad+sy)/2,
          Math.round(th.offset),
          val => { applyThrDist('start', +val); render(); }));

        // Bottom: threshold bottom to room bottom
        const bwY = pad + r.width * scale;
        Ga.appendChild(aml({x:roomRight, y:ey}, {x:lineX, y:ey}, 'ot'));
        Ga.appendChild(aml({x:roomRight, y:bwY},{x:lineX, y:bwY},'ot'));
        Ga.appendChild(aml({x:lineX, y:ey},{x:lineX, y:bwY},'od'));
        Gedit.appendChild(ami(lineX+13, (ey+bwY)/2,
          Math.round(r.width - th.offset - th.width),
          val => { applyThrDist('end', +val); render(); }));
      }
    }
  }

  // pipe shafts on floor
  for(const s of state.shafts){
    const fr = shaftFloorRect(s);
    const sel = state.selected && state.selected.kind==='shaft' && state.selected.id===s.id;
    const rx = pad+fr.x*scale, ry = pad+fr.y*scale, rw = fr.w*scale, rh = fr.h*scale;
    const rect = mr({x:rx, y:ry, width:rw, height:rh}, 'shaft-rect'+(sel?' sel':''));
    rect.dataset.shaftId = s.id;
    Gshaft.appendChild(rect);
    Gshaft.appendChild(ml({x:rx, y:ry}, {x:rx+rw, y:ry+rh}, 'shaft-hatch'));
    Gshaft.appendChild(ml({x:rx+rw, y:ry}, {x:rx, y:ry+rh}, 'shaft-hatch'));
    const fs = Math.max(8, Math.min(11, Math.min(rw, rh) * 0.18));
    const lbl = mt(rx+rw/2, ry+rh/2, s.lenAlong+'×'+s.depth, 'preview-label');
    lbl.setAttribute('font-size', fs);
    Gshaft.appendChild(lbl);

    // When selected: draw paired dim lines from each wall corner to the shaft
    // edges along the shaft's wall, with editable inputs for both distances.
    if(sel){
      const wp = wallPath(s.wall, scale, pad);
      const a = wp.a, b = wp.b;
      const wpLen = Math.hypot(b.x-a.x, b.y-a.y);
      const ux = (b.x-a.x)/wpLen, uy = (b.y-a.y)/wpLen;
      // Outward normal: from room center toward wall midpoint
      const cxR = pad + r.length*scale/2, cyR = pad + r.width*scale/2;
      const wmx = (a.x+b.x)/2, wmy = (a.y+b.y)/2;
      let outX = wmx - cxR, outY = wmy - cyR;
      const oLen = Math.hypot(outX, outY) || 1;
      outX /= oLen; outY /= oLen;
      const dim = 22;
      const oX = outX*dim, oY = outY*dim;
      const sxA = a.x + ux*s.offsetAlong*scale;
      const syA = a.y + uy*s.offsetAlong*scale;
      const sxB = a.x + ux*(s.offsetAlong + s.lenAlong)*scale;
      const syB = a.y + uy*(s.offsetAlong + s.lenAlong)*scale;
      // Dim line + ticks: a-corner → shaft start
      Ga.appendChild(ml({x:a.x+oX, y:a.y+oY}, {x:sxA+oX, y:syA+oY}, 'od'));
      Ga.appendChild(ml({x:a.x, y:a.y}, {x:a.x+oX, y:a.y+oY}, 'ot'));
      Ga.appendChild(ml({x:sxA, y:syA}, {x:sxA+oX, y:syA+oY}, 'ot'));
      // Dim line + ticks: shaft end → b-corner
      Ga.appendChild(ml({x:sxB+oX, y:syB+oY}, {x:b.x+oX, y:b.y+oY}, 'od'));
      Ga.appendChild(ml({x:sxB, y:syB}, {x:sxB+oX, y:syB+oY}, 'ot'));
      Ga.appendChild(ml({x:b.x, y:b.y}, {x:b.x+oX, y:b.y+oY}, 'ot'));
      // Editable distance inputs at the midpoint of each dim line
      const wallLen = wallLengthOf(s.wall);
      const d1 = s.offsetAlong;
      const d2 = wallLen - s.offsetAlong - s.lenAlong;
      Gedit.appendChild(makeInlineInput(
        (a.x + sxA)/2 + oX, (a.y + syA)/2 + oY,
        d1, v => applyShaftDist(s.id, 'start', v),
        {width:54, height:22}));
      Gedit.appendChild(makeInlineInput(
        (sxB + b.x)/2 + oX, (syB + b.y)/2 + oY,
        d2, v => applyShaftDist(s.id, 'end', v),
        {width:54, height:22}));
    }
  }

  // walls
  ['W1','W2','W3','W4'].forEach(name=>{
    const wp=wallPath(name,scale,pad);
    const a=wp.a, b=wp.b;
    const wp_dx=b.x-a.x, wp_dy=b.y-a.y;
    const wpLen=Math.hypot(wp_dx,wp_dy);
    const ux=wp_dx/wpLen, uy=wp_dy/wpLen;
    const sw = state.selected && state.selected.kind==='wall' && state.selected.id===name;

    // gaps from openings
    const ops=openingsOnWall(name).map(o=>({
      sp:o.left*scale, ep:(o.left+o.width)*scale, op:o
    })).sort((p,q)=>p.sp-q.sp);

    let cu=0;
    ops.forEach(g=>{
      if(g.sp>cu){
        Gwalls.appendChild(ml({x:a.x+ux*cu,y:a.y+uy*cu},{x:a.x+ux*g.sp,y:a.y+uy*g.sp},'wall'+(sw?' sel':'')));
      }
      cu=Math.max(cu,g.ep);
    });
    if(cu<wpLen){
      Gwalls.appendChild(ml({x:a.x+ux*cu,y:a.y+uy*cu},b,'wall'+(sw?' sel':'')));
    }

    // wall label or inline input for length
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    const offNX=-uy*16, offNY=ux*16;
    const lblPos = (name==='W1'||name==='W3') ? {x:mx, y:my+ (name==='W1'?20:-20)} : {x:mx+(name==='W2'?-22:22), y:my};
    if(sw){
      Gedit.appendChild(makeInlineInput(lblPos.x, lblPos.y, wallLengthOf(name),
        v=>applyWallLen(name, v),
        {wallStyle:true, width:64, height:26}));
    } else {
      // dim on (plain / arch): outer 标注已含尺寸,wall label 只显示墙名,避免重复
      const lblText = (state.tiles.dimStyle === 'off')
        ? (name+' '+wallLengthOf(name)+' cm')
        : name;
      Gd.appendChild(mt(lblPos.x, lblPos.y, lblText, 'dl'));
    }

    // wall hit area
    const hit=ml(a,b,'wh'); hit.dataset.wname=name; Gwh.appendChild(hit);

    // openings: draw door arc / window double line
    ops.forEach(g=>{
      const o=g.op;
      const sx=a.x+ux*g.sp, sy=a.y+uy*g.sp;
      const ex=a.x+ux*g.ep, ey=a.y+uy*g.ep;
      const wpx=g.ep-g.sp;
      const sl = state.selected && state.selected.kind==='opening' && state.selected.id===o.id;
      if(o.type==='door'){
        // door swing: hinge at start, swing 1/4 arc into the room (perpendicular into bathroom)
        // perpendicular into room from wall a→b direction: (-uy, ux) rotated 90° CCW...
        // For our walls (going CCW around room), perpendicular into room is (-uy, ux) for W1, but (-uy, ux) varies.
        // Easier: swing inward = use (-uy, ux) consistent with floor inside
        // Compute inward normal: point from wall midpoint toward room center
        const cxR = pad + r.length*scale/2, cyR = pad + r.width*scale/2;
        const wmx=(a.x+b.x)/2, wmy=(a.y+b.y)/2;
        let inX = cxR - wmx, inY = cyR - wmy;
        const inLen=Math.hypot(inX,inY)||1;
        inX/=inLen; inY/=inLen;
        // pick perpendicular that has positive dot with (inX,inY)
        let pX=-uy, pY=ux;
        if(pX*inX + pY*inY < 0){pX=uy; pY=-ux;}
        // hinge based on hinge prop (default 's' = start of opening on this wall)
        const hinge=o.hinge||'s', swing=o.swing||'l';
        const hingeAtStart=(hinge==='s');
        const hX=hingeAtStart?sx:ex, hY=hingeAtStart?sy:ey;
        const fX=hingeAtStart?ex:sx, fY=hingeAtStart?ey:sy;
        // swing 'l' = use computed inward (default), 'r' = opposite
        const sgn = swing==='l' ? 1 : -1;
        const ptX=hX+pX*sgn*wpx, ptY=hY+pY*sgn*wpx;
        const cross=(fX-hX)*(ptY-hY)-(fY-hY)*(ptX-hX);
        const sweep=cross>0?1:0;
        const arc=document.createElementNS(NS,'path');
        arc.setAttribute('d',`M ${fX.toFixed(2)},${fY.toFixed(2)} A ${wpx.toFixed(2)},${wpx.toFixed(2)} 0 0 ${sweep} ${ptX.toFixed(2)},${ptY.toFixed(2)}`);
        arc.setAttribute('class','da'+(sl?' sel':''));
        Go.appendChild(arc);
        Go.appendChild(ml({x:hX,y:hY},{x:ptX,y:ptY},'dp'+(sl?' sel':'')));
      } else {
        const px=-uy*3, py=ux*3;
        Go.appendChild(ml({x:sx+px,y:sy+py},{x:ex+px,y:ey+py},'wn'+(sl?' sel':'')));
        Go.appendChild(ml({x:sx-px,y:sy-py},{x:ex-px,y:ey-py},'wn'+(sl?' sel':'')));
      }
      // opening label
      const omx=(sx+ex)/2, omy=(sy+ey)/2;
      const inX=-uy*18, inY=ux*18;
      let lbl=(o.type==='door'?'门':'窗')+' '+o.width;
      if(o.type==='window'&&o.bottom) lbl+=' 台'+o.bottom;
      Go.appendChild(mt(omx-uy*18, omy+ux*18, lbl, 'ol'+(sl?' sel':'')));
      // opening hit
      const oh=ml({x:sx,y:sy},{x:ex,y:ey},'oh'); oh.dataset.oid=o.id; Goh.appendChild(oh);

      // when selected: dim lines + inline editable left/right distances
      if(sl){
        const wallLen=wallLengthOf(name);
        const leftCm=o.left, rightCm=wallLen-o.left-o.width;
        const dim=24;
        const oX=-uy*dim, oY=ux*dim;
        const ds_l={x:a.x+oX,y:a.y+oY}, de_l={x:sx+oX,y:sy+oY};
        Ga.appendChild(ml(ds_l,de_l,'od'));
        Ga.appendChild(ml(a,ds_l,'ot'));
        Ga.appendChild(ml({x:sx,y:sy},de_l,'ot'));
        Gedit.appendChild(makeInlineInput(
          (ds_l.x+de_l.x)/2-uy*9, (ds_l.y+de_l.y)/2+ux*9,
          leftCm, v=>applyOpeningDist(o.id,'left',v),
          {width:50, height:20}));

        const ds_r={x:ex+oX,y:ey+oY}, de_r={x:b.x+oX,y:b.y+oY};
        Ga.appendChild(ml(ds_r,de_r,'od'));
        Ga.appendChild(ml({x:ex,y:ey},ds_r,'ot'));
        Ga.appendChild(ml(b,de_r,'ot'));
        Gedit.appendChild(makeInlineInput(
          (ds_r.x+de_r.x)/2-uy*9, (ds_r.y+de_r.y)/2+ux*9,
          rightCm, v=>applyOpeningDist(o.id,'right',v),
          {width:50, height:20}));

        Ga.appendChild(mc(a.x,a.y,4,'am'));
        Ga.appendChild(mc(b.x,b.y,4,'am'));

        // door swing toggle button (always inside the room, regardless of swing direction)
        if(o.type==='door'){
          const cxR = pad + r.length*scale/2, cyR = pad + r.width*scale/2;
          const wmx=(a.x+b.x)/2, wmy=(a.y+b.y)/2;
          let inX = cxR - wmx, inY = cyR - wmy;
          const inLen=Math.hypot(inX,inY)||1;
          inX/=inLen; inY/=inLen;
          let pX=-uy, pY=ux;
          if(pX*inX + pY*inY < 0){pX=uy; pY=-ux;}
          const btnX = omx + pX*22, btnY = omy + pY*22;
          const cycG=document.createElementNS(NS,'g');
          cycG.style.cursor='pointer';
          cycG.dataset.cycle=o.id;
          cycG.appendChild(mc(btnX,btnY,11,'epF'));
          const ic=mt(btnX,btnY,'↻','et'); ic.setAttribute('font-size','13');
          cycG.appendChild(ic);
          Ga.appendChild(cycG);
        }
      }
    });
  });

  // wire interactions
  Gwh.querySelectorAll('.wh').forEach(el=>{
    el.addEventListener('click',e=>{
      if(state.mode==='addOp') return;
      if(state.mode==='addThr') return;
      e.stopPropagation();
      state.selected = {kind:'wall', id:el.dataset.wname};
      render();
    });
    // Wall drag: W1 (bottom) drags ↕, W4 (right) drags ↔
    const wn = el.dataset.wname;
    if(wn === 'W1' || wn === 'W4'){
      el.addEventListener('pointerdown', e => {
        e.stopPropagation();
        startWallDrag(e, wn);
      });
    }
  });
  Gwh.querySelectorAll('.wh').forEach(el=>{
    el.addEventListener('click',e=>{
      if(state.mode==='addOp'){
        e.stopPropagation();
        const pt=svgPt(e); if(pt) addOpToWall(el.dataset.wname, pt);
      }
    },true);
  });
  Goh.querySelectorAll('.oh').forEach(el=>{
    const oid=el.dataset.oid;
    el.addEventListener('pointerdown', e => startOpDrag(e, oid));
  });
  Gthr.querySelectorAll('[data-thr]').forEach(el=>{
    el.addEventListener('pointerdown', e => startThrDrag(e));
  });
  Gshaft.querySelectorAll('[data-shaft-id]').forEach(el=>{
    const sid = el.dataset.shaftId;
    el.addEventListener('pointerdown', e => startShaftDrag(e, sid));
  });
  Ga.querySelectorAll('g[data-cycle]').forEach(el=>{
    el.addEventListener('click',e=>{
      e.stopPropagation();
      const o=state.openings.find(x=>x.id===el.dataset.cycle); if(!o) return;
      cycleDoor(o);
      render();
    });
  });
  // canvas-level click: addThr placement OR deselect on empty area
  svg.addEventListener('click',e=>{
    if(state.mode==='addThr'){
      const pt=svgPt(e); if(!pt) return;
      placeThreshold(pt, scale, pad);
      return;
    }
    if(state.mode==='addDrain'){
      const pt=svgPt(e); if(!pt) return;
      placeDrain(pt, scale, pad);
      return;
    }
    if(state.mode==='addOp') return;  // ignore in add-opening mode
    // edit mode: empty area click deselects (wall/opening/threshold/cycle handlers
    // call stopPropagation, so they never reach here)
    if(state.selected){
      state.selected = null;
      render();
    }
  });

  // ── Floor drains ─────────────────────────────────────────────────────
  for(const dr of state.drains){
    const DS = 10, hs = DS / 2;
    const drSel = state.selected && state.selected.kind === 'drain' && state.selected.id === dr.id;
    const drx = pad + (dr.x - hs) * scale;
    const dry = pad + (dr.y - hs) * scale;
    const drsz = DS * scale;
    const drCx = pad + dr.x * scale;
    const drCy = pad + dr.y * scale;
    const drRect = mr({x:drx, y:dry, width:drsz, height:drsz}, 'drain-rect' + (drSel?' sel':''));
    drRect.dataset.drainId = dr.id;
    Gdrain.appendChild(drRect);
    Gdrain.appendChild(ml({x:drx, y:drCy}, {x:drx+drsz, y:drCy}, 'drain-cross'));
    Gdrain.appendChild(ml({x:drCx, y:dry}, {x:drCx, y:dry+drsz}, 'drain-cross'));
    // Label ID
    const lbl = mt(drCx, dry - 4, dr.id, 'preview-label');
    lbl.setAttribute('font-size','8'); Gdrain.appendChild(lbl);
    drRect.addEventListener('pointerdown', e => startDrainDrag(e, dr.id));
    drRect.addEventListener('click', e => {
      e.stopPropagation();
      state.selected = {kind:'drain', id:dr.id};
      render();
    });
  }
  // Distances shown in table below plan (renderDrainThrTable) — no SVG dim lines

  // Outer overall dimensions — driven by current dim-style (synced with wall preview)
  drawPlanOuterDim(Gpdim, scale, pad, state.tiles.dimStyle);
}

// ── Drain & Threshold distance annotation table (read-only reference) ──
function renderDrainThrTable(){
  const el = $('drain-thr-table');
  if(!el) return;
  const r = state.room;
  const hasDrains = state.drains && state.drains.length > 0;
  const hasThr    = !!state.threshold;
  if(!hasDrains && !hasThr){ el.style.display='none'; el.innerHTML=''; return; }

  const mode = state.drainDimMode;
  const isEdge = mode === 'edge';
  const hs = 5;
  const modeLabel = isEdge ? '边缘距离' : '中心距离';

  let rows = '';

  // Drain rows
  for(const dr of (state.drains || [])){
    const dL = isEdge ? dr.x - hs        : dr.x;
    const dR = isEdge ? r.length-dr.x-hs : r.length-dr.x;
    const dT = isEdge ? dr.y - hs        : dr.y;
    const dB = isEdge ? r.width-dr.y-hs  : r.width-dr.y;
    const isSel = state.selected && state.selected.kind==='drain' && state.selected.id===dr.id;
    rows += `<tr class="${isSel?'dtt-sel':''}">
      <td class="dtt-name"><span class="dtt-icon">⊕</span> ${dr.id}</td>
      <td>${dL} cm</td><td>${dR} cm</td><td>${dT} cm</td><td>${dB} cm</td>
    </tr>`;
  }

  // Threshold row
  if(hasThr){
    const ts = state.threshold;
    const isY = ts.axis === 'y';
    const thrLen = isY ? r.width : r.length;
    const d1 = ts.offset;
    const d2 = (isY ? r.length : r.width) - ts.offset - ts.width;
    const isSel = state.selected && state.selected.kind==='threshold';
    const cL = isY ? d1+'&thinsp;cm' : '<span class="dtt-na">—</span>';
    const cR = isY ? d2+'&thinsp;cm' : '<span class="dtt-na">—</span>';
    const cT = isY ? '<span class="dtt-na">—</span>' : d1+'&thinsp;cm';
    const cB = isY ? '<span class="dtt-na">—</span>' : d2+'&thinsp;cm';
    rows += `<tr class="${isSel?'dtt-sel':''}">
      <td class="dtt-name"><span class="dtt-icon">▬</span> 门槛 ${ts.width}×${thrLen}cm</td>
      <td>${cL}</td><td>${cR}</td><td>${cT}</td><td>${cB}</td>
    </tr>`;
  }

  el.style.display = 'block';
  el.innerHTML = `
  <div class="dtt-wrap">
    <div class="dtt-header">
      <span class="dtt-title">📐 离墙距离</span>
      <label class="drain-dim-toggle">
        <input type="checkbox" id="dtt-mode-toggle" ${isEdge?'':'checked'}>
        <span class="dtt-mode-lbl">${modeLabel}</span>
      </label>
    </div>
    <table class="dtt">
      <thead><tr>
        <th>项目</th>
        <th>← W2</th><th>W4 →</th><th>↑ W3</th><th>↓ W1</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;

  $('dtt-mode-toggle').addEventListener('change', e => {
    state.drainDimMode = e.target.checked ? 'center' : 'edge';
    render();
  });
}

function svgPt(e){
  const svg=$('canvas');
  const pt=svg.createSVGPoint();
  pt.x=e.clientX; pt.y=e.clientY;
  const ctm=svg.getScreenCTM();
  if(!ctm) return null;
  return pt.matrixTransform(ctm.inverse());
}

// Project SVG point onto a named wall, return distance in cm from wall start (a)
function projectOnWall(wallName, x, y){
  const wp = wallPath(wallName, planScale(), 50);
  const a = wp.a, b = wp.b;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy); if(len === 0) return 0;
  const ux = dx/len, uy = dy/len;
  const t = (x - a.x)*ux + (y - a.y)*uy;
  return t / planScale();
}

// Drag state (global, document-level)
let dragging = null;
const DRAG_THRESH = 5;

let _renderPending = null;
function scheduleRender(){
  if(_renderPending) return;
  _renderPending = requestAnimationFrame(()=>{ _renderPending=null; render(); });
}

function startOpDrag(e, oid){
  if(state.mode !== 'edit') return;
  const op = state.openings.find(x => x.id === oid);
  if(!op) return;
  e.preventDefault();
  e.stopPropagation();
  const pt = svgPt(e); if(!pt) return;
  const projCm = projectOnWall(op.wall, pt.x, pt.y);
  dragging = {
    kind: 'opening',
    opId: oid,
    grabOffset: projCm - op.left,
    startX: e.clientX, startY: e.clientY,
    moved: false
  };
}

// Wall face drag — W1 drags ↕ (changes room width), W4 drags ↔ (changes room length)
function startWallDrag(e, wallName){
  if(state.mode !== 'edit') return;
  e.preventDefault();
  e.stopPropagation();
  dragging = {
    kind: 'walldrag',
    wallName,
    startX: e.clientX, startY: e.clientY,
    startLen: state.room.length,
    startWid: state.room.width,
    moved: false
  };
}

function startThrDrag(e){
  if(state.mode !== 'edit' || !state.threshold) return;
  e.preventDefault();
  e.stopPropagation();
  const pt = svgPt(e); if(!pt) return;
  const r = state.room;
  const scale = planScale();
  const pad = 80;   // must match renderPlan pad
  const fx = (pt.x - pad)/scale, fy = (pt.y - pad)/scale;
  const t = state.threshold;
  const grabOff = (t.axis === 'y') ? (fx - t.offset) : (fy - t.offset);
  dragging = {
    kind: 'threshold',
    grabOff,
    startX: e.clientX, startY: e.clientY,
    moved: false
  };
}

function startShaftDrag(e, sid){
  if(state.mode !== 'edit') return;
  const s = state.shafts.find(x => x.id === sid); if(!s) return;
  e.preventDefault();
  e.stopPropagation();
  const pt = svgPt(e); if(!pt) return;
  const scale = planScale();
  const pad = 50;
  const fx = (pt.x - pad)/scale, fy = (pt.y - pad)/scale;
  // Grab offset along its current wall
  const projAlong = projectOnWall(s.wall, pt.x, pt.y);
  dragging = {
    kind: 'shaft',
    shaftId: sid,
    grabAlong: projAlong - s.offsetAlong,
    grabFx: fx, grabFy: fy,
    startX: e.clientX, startY: e.clientY,
    moved: false
  };
}

// Pick the closest wall to a free floor point (cm coords); returns wall name.
function nearestWall(fx, fy){
  const r = state.room;
  const dists = {
    W1: r.width - fy,   // distance to bottom wall
    W3: fy,             // top
    W2: fx,             // left
    W4: r.length - fx   // right
  };
  return Object.keys(dists).reduce((a,b) => dists[a] < dists[b] ? a : b);
}

// Map a floor point to (wall, offsetAlong) given a shaft's lenAlong (so offset is clamped).
function pickShaftPlacement(fx, fy, lenAlong){
  const r = state.room;
  const wall = nearestWall(fx, fy);
  const wallLen = wallLengthOf(wall);
  let along;
  // For each wall, compute "along" coord using the same a→b convention as projectOnWall
  switch(wall){
    case 'W1': along = fx; break;                        // bottom: a=BL, b=BR
    case 'W2': along = r.width - fy; break;              // left: a=BL, b=TL (going up = +offset)
    case 'W3': along = fx; break;                        // top: a=TL, b=TR
    case 'W4': along = fy; break;                        // right: a=TR, b=BR (going down = +offset)
  }
  let off = Math.round(along - lenAlong/2);
  off = Math.max(0, Math.min(wallLen - lenAlong, off));
  return {wall, offsetAlong: off};
}

// Single global pointer-move/up/cancel handlers
document.addEventListener('pointermove', e => {
  if(!dragging) return;
  const dx = e.clientX - dragging.startX;
  const dy = e.clientY - dragging.startY;
  if(!dragging.moved && Math.hypot(dx, dy) < DRAG_THRESH) return;
  if(!dragging.moved){
    dragging.moved = true;
    document.body.classList.add('dragging');
  }
  const pt = svgPt(e); if(!pt) return;
  if(dragging.kind === 'opening'){
    const op = state.openings.find(x => x.id === dragging.opId); if(!op) return;
    const projCm = projectOnWall(op.wall, pt.x, pt.y);
    let newLeft = Math.round(projCm - dragging.grabOffset);
    const wallLen = wallLengthOf(op.wall);
    newLeft = Math.max(0, Math.min(wallLen - op.width, newLeft));
    if(op.left !== newLeft){
      op.left = newLeft;
      state.selected = {kind:'opening', id:op.id};
      scheduleRender();
    }
  } else if(dragging.kind === 'drain'){
    const dr = state.drains.find(x => x.id === dragging.drainId); if(!dr) return;
    const r = state.room;
    const scale = planScale();
    const pad = 80;
    const fx = (pt.x - pad) / scale;
    const fy = (pt.y - pad) / scale;
    const hs = 5;
    let nx = Math.round(fx - dragging.grabDx);
    let ny = Math.round(fy - dragging.grabDy);
    nx = Math.max(hs, Math.min(r.length - hs, nx));
    ny = Math.max(hs, Math.min(r.width  - hs, ny));
    if(dr.x !== nx || dr.y !== ny){
      dr.x = nx; dr.y = ny;
      state.selected = {kind:'drain', id:dr.id};
      scheduleRender();
    }
  } else if(dragging.kind === 'walldrag'){
    const scale = planScale();
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    if(dragging.wallName === 'W1'){
      // W1 = bottom wall: drag down → room gets taller
      const newWid = Math.max(60, Math.min(1500, Math.round(dragging.startWid + dy / scale)));
      if(state.room.width !== newWid){
        state.room.width = newWid;
        $('rw') && ($('rw').value = newWid);
        scheduleRender();
      }
    } else if(dragging.wallName === 'W4'){
      // W4 = right wall: drag right → room gets wider
      const newLen = Math.max(60, Math.min(1500, Math.round(dragging.startLen + dx / scale)));
      if(state.room.length !== newLen){
        state.room.length = newLen;
        $('rl') && ($('rl').value = newLen);
        scheduleRender();
      }
    } else if(dragging.wallName === 'W3'){
      // W3 = top wall: drag down shifts top edge — treat as reducing room width from top
      // Not common; treat as W4-like X resize or ignore
    }
  } else if(dragging.kind === 'threshold' && state.threshold){
    const r = state.room;
    const scale = planScale();
    const pad = 80;   // must match renderPlan and startThrDrag
    const fx = (pt.x - pad)/scale, fy = (pt.y - pad)/scale;
    const t = state.threshold;
    let newOff = Math.round(((t.axis === 'y') ? fx : fy) - dragging.grabOff);
    const max = (t.axis === 'y') ? (r.length - t.width) : (r.width - t.width);
    newOff = Math.max(0, Math.min(max, newOff));
    if(t.offset !== newOff){
      t.offset = newOff;
      state.selected = {kind:'threshold'};
      scheduleRender();
    }
  } else if(dragging.kind === 'shaft'){
    const s = state.shafts.find(x => x.id === dragging.shaftId); if(!s) return;
    const scale = planScale();
    const pad = 50;
    const fx = (pt.x - pad)/scale, fy = (pt.y - pad)/scale;
    // Decide whether to switch wall: pick nearest, but require a small bias to
    // prevent jitter when fingers are right between two walls.
    const targetWall = nearestWall(fx, fy);
    const r = state.room;
    function alongFor(wall){
      switch(wall){
        case 'W1': return fx;
        case 'W2': return r.width - fy;
        case 'W3': return fx;
        case 'W4': return fy;
      }
    }
    // Corner-only: snap offsetAlong to 0 (start corner) or wallLen-lenAlong (end corner)
    if(targetWall !== s.wall) s.wall = targetWall;
    const wallLenN = wallLengthOf(s.wall);
    const along = alongFor(s.wall);
    const snappedOff = (along < wallLenN/2) ? 0 : Math.max(0, wallLenN - s.lenAlong);
    if(s.offsetAlong !== snappedOff) s.offsetAlong = snappedOff;
    state.selected = {kind:'shaft', id:s.id};
    scheduleRender();
  }
});

document.addEventListener('pointerup', e => {
  if(!dragging) return;
  document.body.classList.remove('dragging');
  // Click semantics if not dragged
  if(!dragging.moved){
    if(dragging.kind === 'opening'){
      const op = state.openings.find(x => x.id === dragging.opId);
      if(op){
        const isReSelected = state.selected && state.selected.kind === 'opening' && state.selected.id === op.id;
        if(isReSelected && op.type === 'door'){ cycleDoor(op); }
        else { state.selected = {kind:'opening', id:op.id}; }
        render();
      }
    } else if(dragging.kind === 'threshold'){
      state.selected = {kind:'threshold'};
      render();
    } else if(dragging.kind === 'walldrag'){
      state.selected = {kind:'wall', id:dragging.wallName};
      render();
    } else if(dragging.kind === 'shaft'){
      state.selected = {kind:'shaft', id:dragging.shaftId};
      render();
    }
  } else {
    // After drag: ensure final render
    render();
  }
  dragging = null;
});

document.addEventListener('pointercancel', () => {
  if(!dragging) return;
  document.body.classList.remove('dragging');
  dragging = null;
});

function cycleDoor(o){
  o.hinge=o.hinge||'s'; o.swing=o.swing||'l';
  const cur=o.hinge+o.swing;
  if(cur==='sl') o.swing='r';
  else if(cur==='sr') o.hinge='e';
  else if(cur==='er') o.swing='l';
  else { o.hinge='s'; o.swing='l'; }
}

function rotateThreshold(){
  const t=state.threshold; if(!t) return;
  const r=state.room;
  if(t.axis==='y'){
    t.axis='x';
    t.offset=Math.max(0, Math.round(r.width/2 - t.width/2));
  } else {
    t.axis='y';
    t.offset=Math.max(0, Math.round(r.length/2 - t.width/2));
  }
}

function ensureShaftDefault(){
  const r = state.room;
  // Default 40 (沿墙) × 30 (深) at the bottom-left corner (W1, offsetAlong=0).
  // Clamp if room is unusually small.
  const lenAlong = Math.min(40, Math.max(10, r.length));
  const depth = Math.min(30, Math.max(10, r.width));
  state.sCnt++;
  const s = {
    id: 'P' + state.sCnt,
    wall: 'W1',
    offsetAlong: 0,
    lenAlong,
    depth
  };
  state.shafts.push(s);
  return s;
}

function ensureThresholdDefault(){
  const r=state.room, w=6;
  state.threshold={
    axis:'y',
    width:w,
    offset: Math.max(0, Math.round(r.length/2 - w/2))
  };
}

function applyThrDist(side, value){
  if(isNaN(value) || value<0) return;
  const t=state.threshold; if(!t) return;
  const r=state.room;
  const totalLen = (t.axis==='y') ? r.length : r.width;
  let newOffset;
  if(side==='start') newOffset = value;
  else newOffset = totalLen - value - t.width;
  if(newOffset<0 || newOffset+t.width>totalLen) return;
  t.offset = Math.round(newOffset);
  render();
}

function applyShaftDist(shaftId, side, value){
  if(isNaN(value) || value<0) return;
  const s = state.shafts.find(x => x.id === shaftId); if(!s) return;
  const wallLen = wallLengthOf(s.wall);
  // Corner-only: snap whatever the user typed to the nearest corner.
  const target = (side === 'start') ? value : (wallLen - value - s.lenAlong);
  s.offsetAlong = (target < wallLen/2) ? 0 : Math.max(0, wallLen - s.lenAlong);
  render();
}

// Returns 1 if shaft is in a corner (one side against adjacent wall) else 2
function shaftExposedCorners(s){
  const wallLen = wallLengthOf(s.wall);
  const atStart = s.offsetAlong < 1;
  const atEnd   = (s.offsetAlong + s.lenAlong) > wallLen - 1;
  return (atStart || atEnd) ? 1 : 2;
}

function applyWallLen(name, cm){
  if(isNaN(cm)||cm<30||cm>2000) return;
  if(name==='W1'||name==='W3') state.room.length = Math.round(cm);
  else state.room.width = Math.round(cm);
  $('rl').value=state.room.length;
  $('rw').value=state.room.width;
  // clamp openings
  for(const o of state.openings){
    const wW=wallLengthOf(o.wall);
    if(o.left + o.width > wW) o.left = Math.max(0, wW - o.width);
  }
  if(state.threshold){
    const r=state.room;
    if(state.threshold.axis==='y' && state.threshold.offset+state.threshold.width>r.length)
      state.threshold.offset=Math.max(0,r.length-state.threshold.width);
    if(state.threshold.axis==='x' && state.threshold.offset+state.threshold.width>r.width)
      state.threshold.offset=Math.max(0,r.width-state.threshold.width);
  }
  for(const s of state.shafts){
    const wallLen = wallLengthOf(s.wall);
    const perpLen = (s.wall==='W1'||s.wall==='W3') ? state.room.width : state.room.length;
    s.lenAlong = Math.max(5, Math.min(s.lenAlong, wallLen));
    s.depth = Math.max(5, Math.min(s.depth, perpLen));
    // Corner-only: snap to whichever corner is closer
    s.offsetAlong = (s.offsetAlong < wallLen/2) ? 0 : Math.max(0, wallLen - s.lenAlong);
  }
  render();
}

function applyOpeningDist(opId, kind, value){
  if(isNaN(value)||value<0) return;
  const o=state.openings.find(x=>x.id===opId); if(!o) return;
  const wW=wallLengthOf(o.wall);
  let newLeft;
  if(kind==='left') newLeft=value;
  else newLeft=wW-value-o.width;
  if(newLeft<0||newLeft+o.width>wW) return;
  o.left=Math.round(newLeft);
  render();
}

function addOpToWall(wallName, pt){
  if(!pendingOp) return;
  const wp=wallPath(wallName, planScale(), 50);
  const a=wp.a, b=wp.b;
  const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy);
  const ux=dx/len, uy=dy/len;
  const t=(pt.x-a.x)*ux + (pt.y-a.y)*uy;
  const tCm=t/planScale();
  const wallLen=wallLengthOf(wallName);
  const w=pendingOp.width;
  if(wallLen<w+10){alert('墙太短');exitMode();return;}
  let left=Math.round(tCm-w/2);
  left=Math.max(0, Math.min(wallLen-w, left));
  state.oCnt++;
  const id=(pendingOp.type==='door'?'D':'C')+state.oCnt;
  const newOp={id, wall:wallName, type:pendingOp.type, width:w, height:pendingOp.height, left, bottom:pendingOp.bottom};
  if(pendingOp.type==='door'){newOp.hinge='s'; newOp.swing='l';}
  state.openings.push(newOp);
  state.selected={kind:'opening', id};
  exitMode();
}

function placeThreshold(pt, scale, pad){
  const r=state.room;
  const fx=(pt.x-pad)/scale, fy=(pt.y-pad)/scale;
  if(fx<0||fx>r.length||fy<0||fy>r.width){exitMode();return;}
  // detect closest wall to determine orientation/position
  const dToW1=r.width-fy, dToW3=fy, dToW2=fx, dToW4=r.length-fx;
  const m=Math.min(dToW1,dToW3,dToW2,dToW4);
  const W=6;
  if(m===dToW1){state.threshold={axis:'x', offset:r.width-W, width:W};} // along bottom
  else if(m===dToW3){state.threshold={axis:'x', offset:0, width:W};} // along top
  else if(m===dToW2){state.threshold={axis:'y', offset:0, width:W};} // along left
  else {state.threshold={axis:'y', offset:r.length-W, width:W};} // along right
  state.selected={kind:'threshold'};
  exitMode();
}

function placeDrain(pt, scale, pad){
  const r = state.room;
  const hs = 5;
  let fx = (pt.x - pad) / scale;
  let fy = (pt.y - pad) / scale;
  if(fx < 0 || fx > r.length || fy < 0 || fy > r.width){ exitMode(); return; }
  fx = Math.max(hs, Math.min(r.length - hs, Math.round(fx)));
  fy = Math.max(hs, Math.min(r.width  - hs, Math.round(fy)));
  state.oCnt = (state.oCnt || 0) + 1;
  const id = 'DR' + state.oCnt;
  state.drains.push({ id, x: fx, y: fy });
  state.selected = { kind: 'drain', id };
  exitMode();
}

function startDrainDrag(e, drainId){
  if(state.mode !== 'edit') return;
  const dr = state.drains.find(x => x.id === drainId); if(!dr) return;
  e.preventDefault();
  e.stopPropagation();
  const pt = svgPt(e); if(!pt) return;
  const scale = planScale();
  const pad = 80;
  const fx = (pt.x - pad) / scale;
  const fy = (pt.y - pad) / scale;
  dragging = {
    kind: 'drain',
    drainId,
    grabDx: fx - dr.x,
    grabDy: fy - dr.y,
    startX: e.clientX, startY: e.clientY,
    moved: false
  };
}

function applyDrainDist(drainId, side, val){
  if(isNaN(val) || val < 0) return;
  const dr = state.drains.find(x => x.id === drainId); if(!dr) return;
  const r = state.room;
  const hs = 5;
  const mode = state.drainDimMode;
  let nx = dr.x, ny = dr.y;
  if(side === 'left')   nx = mode==='edge' ? val+hs : val;
  if(side === 'right')  nx = mode==='edge' ? r.length-val-hs : r.length-val;
  if(side === 'top')    ny = mode==='edge' ? val+hs : val;
  if(side === 'bottom') ny = mode==='edge' ? r.width-val-hs : r.width-val;
  dr.x = Math.max(hs, Math.min(r.length-hs, Math.round(nx)));
  dr.y = Math.max(hs, Math.min(r.width -hs, Math.round(ny)));
  render();
}

function exitMode(){
  state.mode='edit'; pendingOp=null;
  $('cv-container').classList.remove('adding-op','adding-thr','adding-drain');
  $('cancel-add').style.display='none';
  ['add-d90','add-d75','add-win','add-thr','add-drain'].forEach(id=>$(id) && $(id).classList.remove('active','op-mode','thr-mode','drain-mode'));
  render();
}

function enterAddOp(type, width, height, bottom, btnId){
  exitMode();
  state.mode='addOp';
  pendingOp={type, width, height, bottom};
  state.selected=null;
  $('cv-container').classList.add('adding-op');
  $('cancel-add').style.display='inline-block';
  $(btnId).classList.add('active','op-mode');
  render();
}
function enterAddThr(){
  exitMode();
  state.mode='addThr';
  state.selected=null;
  $('cv-container').classList.add('adding-thr');
  $('cancel-add').style.display='inline-block';
  $('add-thr').classList.add('active','thr-mode');
  render();
}
function enterAddDrain(){
  exitMode();
  state.mode='addDrain';
  state.selected=null;
  $('cv-container').classList.add('adding-drain');
  $('cancel-add').style.display='inline-block';
  $('add-drain').classList.add('active','drain-mode');
  render();
}
