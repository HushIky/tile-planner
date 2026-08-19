// Lightweight perspective 3D preview. It intentionally uses the platform
// canvas API so the planner remains a zero-build, static-deployment app.
(function(){
  const dialog = document.getElementById('preview3d-dialog');
  const canvas = document.getElementById('preview3d-canvas');
  if(!dialog || !canvas) return;
  const ctx = canvas.getContext('2d');
  const $3 = id => document.getElementById(id);
  const DEG = Math.PI / 180;
  const defaults = { yaw: 35, pitch: 0, fov: 55, zoom: 100 };
  const camera = {...defaults};
  let isOpen = false;
  let drag = null;
  let frame = 0;

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
  const sub = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
  const scale = (a,n) => ({x:a.x*n,y:a.y*n,z:a.z*n});
  const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
  const cross = (a,b) => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const norm = a => { const n=Math.hypot(a.x,a.y,a.z)||1; return scale(a,1/n); };

  function palette(){
    const dark = document.documentElement.dataset.theme === 'dark';
    return dark ? {
      bg:'#20211f', grid:'#55564f', wall:'#454640', tile:'#f7f7f4', cut:'#e5e5e0',
      floor:'#f7f7f4', floorCut:'#e5e5e0', grout:'#11110f', opening:'#171816', shaft:'#5e655f',
      threshold:'#a98b61', drain:'#b4b7ae', text:'#d8d8d0', accent:'#8fbbea'
    } : {
      bg:'#f4f3ee', grid:'#b9b8b0', wall:'#d5d2c8', tile:'#ffffff', cut:'#eeeeea',
      floor:'#ffffff', floorCut:'#eeeeea', grout:'#11110f', opening:'#77776f', shaft:'#989b91',
      threshold:'#b28c58', drain:'#555850', text:'#4c4c47', accent:'#185fa5'
    };
  }

  function wallQuad(wall, u0, u1, y0, y1, inset=0){
    const r=state.room, z0=wall==='W3' ? inset : wall==='W1' ? r.width-inset : 0;
    if(wall==='W1') return [{x:u0,y:y0,z:r.width-inset},{x:u1,y:y0,z:r.width-inset},{x:u1,y:y1,z:r.width-inset},{x:u0,y:y1,z:r.width-inset}];
    if(wall==='W3') return [{x:u1,y:y0,z:inset},{x:u0,y:y0,z:inset},{x:u0,y:y1,z:inset},{x:u1,y:y1,z:inset}];
    if(wall==='W2') return [{x:inset,y:y0,z:u1},{x:inset,y:y0,z:u0},{x:inset,y:y1,z:u0},{x:inset,y:y1,z:u1}];
    return [{x:r.length-inset,y:y0,z:u0},{x:r.length-inset,y:y0,z:u1},{x:r.length-inset,y:y1,z:u1},{x:r.length-inset,y:y1,z:u0}];
  }

  function floorQuad(p, y=0){
    return [{x:p.x,y,z:p.y},{x:p.x+p.w,y,z:p.y},{x:p.x+p.w,y,z:p.y+p.h},{x:p.x,y,z:p.y+p.h}];
  }

  function openingHoles(wall, installH){
    const holes = openingsOnWall(wall).map(o => ({
      x:o.left, y:o.bottom, w:o.width, h:Math.min(o.height, installH)
    }));
    for(const shaft of state.shafts){
      for(const seg of shaftWallSegments(shaft)){
        if(seg.wall===wall) holes.push({x:seg.left,y:0,w:seg.width,h:installH});
      }
    }
    return holes;
  }

  function buildScene(){
    const r=state.room, t=state.tiles, colors=palette(), objects=[];
    const addQuad = (points, fill, stroke=colors.grid, order=0, width=0.7) => objects.push({points,fill,stroke,order,width});
    function wallBasePieces(length,height,holes){
      let pieces=[{x:0,y:0,w:length,h:height}];
      for(const hole of holes){
        const next=[];
        for(const piece of pieces) next.push(...subtractRect(piece,hole));
        pieces=next;
      }
      return pieces;
    }
    const addBox = (x0,x1,z0,z1,y0,y1,fill) => {
      const p={
        a:{x:x0,y:y0,z:z0},b:{x:x1,y:y0,z:z0},c:{x:x1,y:y0,z:z1},d:{x:x0,y:y0,z:z1},
        e:{x:x0,y:y1,z:z0},f:{x:x1,y:y1,z:z0},g:{x:x1,y:y1,z:z1},h:{x:x0,y:y1,z:z1}
      };
      addQuad([p.e,p.f,p.g,p.h],fill,colors.grid,3);
      addQuad([p.a,p.b,p.f,p.e],fill,colors.grid,3);
      addQuad([p.b,p.c,p.g,p.f],fill,colors.grid,3);
      addQuad([p.c,p.d,p.h,p.g],fill,colors.grid,3);
      addQuad([p.d,p.a,p.e,p.h],fill,colors.grid,3);
    };

    // A faint room shell makes openings and un-tiled areas readable.
    addQuad(floorQuad({x:0,y:0,w:r.length,h:r.width},-0.25), colors.bg, colors.grid, -2, 1);
    for(const wall of ['W1','W2','W3','W4']){
      const len=wallLengthOf(wall);
      const holes=openingHoles(wall,r.installHeight);
      // Cut the wall shell around openings instead of painting a solid wall
      // over the tile faces. This also makes door/window openings genuine voids.
      for(const piece of wallBasePieces(len,r.wallHeight,holes)){
        addQuad(wallQuad(wall,piece.x,piece.x+piece.w,piece.y,piece.y+piece.h,0),colors.wall,colors.grid,-2,1);
      }
      const tiles=buildTiles(len,r.installHeight,t.wallW,t.wallH,grout(),1,holes,t.bondMode,
        (t.offsetX&&t.offsetX[wall])||0,t.offsetY||0);
      for(const tile of tiles){
        for(const p of tile.pieces){
          // buildTiles() uses a floor-up local Y axis: y=0 is the floor.
          const y0=p.y, y1=p.y+p.h;
          addQuad(wallQuad(wall,p.x,p.x+p.w,y0,y1,0.35),tile.full?colors.tile:colors.cut,colors.grout,1,0.55);
        }
      }
      // Keep a dark recess behind doors/windows so the opening reads as depth,
      // while the wall shell itself remains genuinely cut away.
      for(const opening of openingsOnWall(wall)){
        const hole={x:opening.left,y:opening.bottom,w:opening.width,h:Math.min(opening.height,r.wallHeight)};
        addQuad(wallQuad(wall,hole.x,hole.x+hole.w,hole.y,hole.y+hole.h,-2),colors.opening,colors.opening,0,1);
      }
    }

    const floorHoles=[];
    const threshold=thresholdRect();
    if(threshold) floorHoles.push(threshold);
    for(const shaft of state.shafts) floorHoles.push(shaftFloorRect(shaft));
    const floorTiles=buildTiles(r.length,r.width,t.floorW,t.floorH,groutF(),1,floorHoles,
      t.floorBondMode,t.floorOffset.x,t.floorOffset.y);
    for(const tile of floorTiles){
      for(const p of tile.pieces) addQuad(floorQuad(p,0),tile.full?colors.floor:colors.floorCut,colors.grout,1,0.55);
    }

    if(threshold){
      addBox(threshold.x,threshold.x+threshold.w,threshold.y,threshold.y+threshold.h,0,3,colors.threshold);
    }
    for(const dr of state.drains||[]){
      addBox(dr.x-5,dr.x+5,dr.y-5,dr.y+5,0.3,0.8,colors.drain);
      addQuad([{x:dr.x-4.2,y:.82,z:dr.y},{x:dr.x+4.2,y:.82,z:dr.y},{x:dr.x+4.2,y:.82,z:dr.y+.8},{x:dr.x-4.2,y:.82,z:dr.y+.8}],colors.drain,colors.opening,5,.8);
      addQuad([{x:dr.x,y:.83,z:dr.y-4.2},{x:dr.x+.8,y:.83,z:dr.y-4.2},{x:dr.x+.8,y:.83,z:dr.y+4.2},{x:dr.x,y:.83,z:dr.y+4.2}],colors.drain,colors.opening,5,.8);
    }
    for(const shaft of state.shafts){
      const fr=shaftFloorRect(shaft);
      addBox(fr.x,fr.x+fr.w,fr.y,fr.y+fr.h,0,r.wallHeight,colors.shaft);
    }
    return {objects, colors};
  }

  function projectModel(model){
    const r=state.room;
    const width=canvas.clientWidth||720, height=canvas.clientHeight||520;
    const target={x:r.length/2,z:r.width/2};
    const yaw=camera.yaw*DEG, pitch=camera.pitch*DEG;
    // The eye stays inside the room at a human-ish height. Yaw changes the
    // viewing direction around the room center; pitch is a small look up/down
    // adjustment around a level (not floor-directed) default.
    const horizontalRadius=Math.min(r.length,r.width)*.1*(100/camera.zoom);
    const eyeHeight=Math.min(r.wallHeight*.72,Math.max(120,r.installHeight*.55));
    const cam={x:target.x+horizontalRadius*Math.cos(yaw),y:eyeHeight,z:target.z+horizontalRadius*Math.sin(yaw)};
    const flatForward=norm({x:target.x-cam.x,y:0,z:target.z-cam.z});
    const forward=norm({x:flatForward.x*Math.cos(pitch),y:-Math.sin(pitch),z:flatForward.z*Math.cos(pitch)});
    const right=norm(cross(forward,{x:0,y:1,z:0}));
    const up=norm(cross(right,forward));
    // A reduced focal scale keeps a useful portion of the room visible even
    // while the camera remains inside the compact bathroom volume.
    const focal=Math.min(width,height)/(2*Math.tan(camera.fov*DEG/2))*.42*(camera.zoom/100);
    const near=2;
    function clipNear(points){
      const out=[];
      const intersect=(a,b)=>{
        const t=(near-a.depth)/(b.depth-a.depth);
        return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,depth:near};
      };
      for(let i=0;i<points.length;i++){
        const a=points[i], b=points[(i+1)%points.length];
        const aIn=a.depth>=near, bIn=b.depth>=near;
        if(aIn && bIn) out.push(b);
        else if(aIn && !bIn) out.push(intersect(a,b));
        else if(!aIn && bIn) out.push(intersect(a,b),b);
      }
      return out;
    }
    return model.objects.map((obj,index)=>{
      const viewPoints=obj.points.map(point=>{
        const rel=sub(point,cam);
        return {x:dot(rel,right),y:dot(rel,up),depth:dot(rel,forward)};
      });
      const clipped=clipNear(viewPoints);
      if(clipped.length<3) return null;
      const projected=clipped.map(point=>({x:width/2+point.x*focal/point.depth,y:height/2-point.y*focal/point.depth,depth:point.depth}));
      return {...obj, projected, depth:clipped.reduce((sum,p)=>sum+p.depth,0)/clipped.length,index};
    }).filter(Boolean).sort((a,b)=>{
      // Render every surface in deterministic material layers. Room shells
      // are always painted first, followed by recesses, every tile face, then
      // raised fixtures. This prevents a wall/floor backing polygon from
      // covering tiles merely because its average depth changed with yaw.
      const layer=(a.order||0)-(b.order||0);
      return layer || b.depth-a.depth;
    });
  }

  function renderCanvas(){
    if(!isOpen) return;
    const rect=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
    const w=Math.max(320,Math.round(rect.width)), h=Math.max(260,Math.round(rect.height));
    if(canvas.width!==w*dpr || canvas.height!==h*dpr){ canvas.width=w*dpr; canvas.height=h*dpr; }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const colors=palette();
    ctx.fillStyle=colors.bg; ctx.fillRect(0,0,w,h);
    const gradient=ctx.createLinearGradient(0,0,0,h); gradient.addColorStop(0,colors.bg); gradient.addColorStop(1,colors.grout);
    ctx.fillStyle=gradient; ctx.fillRect(0,0,w,h);
    const projected=projectModel(buildScene());
    for(const obj of projected){
      const pts=obj.projected;
      ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
      for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x,pts[i].y);
      ctx.closePath(); ctx.fillStyle=obj.fill; ctx.fill();
      if(obj.stroke){ ctx.strokeStyle=obj.stroke; ctx.lineWidth=obj.width||.7; ctx.stroke(); }
    }
    ctx.fillStyle=colors.text; ctx.font='12px -apple-system,BlinkMacSystemFont,sans-serif';
    ctx.fillText(`${rLabel()} · ${Math.round(projected.length)} 个面`,16,h-16);
  }

  function rLabel(){
    const r=state.room; return `${r.length}×${r.width}×${r.wallHeight} cm`;
  }
  function schedule(){ cancelAnimationFrame(frame); frame=requestAnimationFrame(renderCanvas); }
  function updateControl(id,value,suffix){
    const el=$3(id), out=$3(id+'-value'); if(el) el.value=value;
    if(out) out.textContent=value+suffix;
  }
  function syncCamera(){
    updateControl('preview3d-yaw',Math.round(camera.yaw),'°');
    updateControl('preview3d-pitch',Math.round(camera.pitch),'°');
    updateControl('preview3d-fov',Math.round(camera.fov),'°');
    updateControl('preview3d-zoom',Math.round(camera.zoom),'%');
    const summary=$3('preview3d-summary');
    if(summary) summary.innerHTML=`<strong>当前配置</strong><br>房间 ${rLabel()}<br>墙砖 ${cmToMm(state.tiles.wallW)}×${cmToMm(state.tiles.wallH)} mm<br>地砖 ${cmToMm(state.tiles.floorW)}×${cmToMm(state.tiles.floorH)} mm`;
    schedule();
  }
  function render3d(){ if(isOpen) syncCamera(); }
  window.render3d=render3d;

  function open(){
    isOpen=true;
    if(typeof dialog.showModal==='function') dialog.showModal(); else dialog.setAttribute('open','');
    syncCamera();
  }
  function close(){ isOpen=false; if(dialog.open) dialog.close(); }
  $3('view-3d').addEventListener('click',open);
  $3('preview3d-close').addEventListener('click',close);
  $3('preview3d-reset').addEventListener('click',()=>{Object.assign(camera,defaults);syncCamera();});
  [['preview3d-yaw','yaw'],['preview3d-pitch','pitch'],['preview3d-fov','fov'],['preview3d-zoom','zoom']].forEach(([id,key])=>{
    $3(id).addEventListener('input',e=>{camera[key]=+e.target.value;syncCamera();});
  });
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw:camera.yaw,pitch:camera.pitch};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{
    if(!drag) return;
    camera.yaw=drag.yaw+(e.clientX-drag.x)*.45;
    camera.pitch=clamp(drag.pitch-(e.clientY-drag.y)*.28,8,75);
    syncCamera();
  });
  canvas.addEventListener('pointerup',()=>{drag=null;});
  canvas.addEventListener('pointercancel',()=>{drag=null;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();camera.zoom=clamp(camera.zoom-e.deltaY*.08,60,180);syncCamera();},{passive:false});
  window.addEventListener('resize',schedule);
})();
