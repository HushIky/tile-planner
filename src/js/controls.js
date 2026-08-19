// Form synchronization, add modes, import/export data, and view controls.
function readSettings(){
  state.room.length = +$('rl').value || 280;
  state.room.width = +$('rw').value || 180;
  state.room.wallHeight = +$('rh').value || 270;
  state.room.installHeight = +$('ih').value || 240;
  // tile inputs are mm; state is cm
  state.tiles.wallW = mmToCm($('tww').value) || 60;
  state.tiles.wallH = mmToCm($('twh').value) || 30;
  state.tiles.floorW = mmToCm($('tfw').value) || 30;
  state.tiles.floorH = mmToCm($('tfh').value) || 30;
  state.tiles.groutMm      = +$('grt-wall').value  || 0;
  state.tiles.groutWallMm  = +$('grt-wall').value  || 0;
  state.tiles.groutFloorMm = +$('grt-floor').value || 0;
  if(typeof syncOffsetMax === 'function') syncOffsetMax();
  if(typeof syncFloorOffsetMax === 'function') syncFloorOffsetMax();
  for(const o of state.openings){
    const wW=wallLengthOf(o.wall);
    if(o.left+o.width>wW) o.left=Math.max(0,wW-o.width);
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
['rl','rw','rh','ih','tww','twh','tfw','tfh','grt-wall','grt-floor'].forEach(id=>{
  $(id).addEventListener('input', readSettings);
});

// Swap tile dimensions (W ↔ H) — same effect as rotating the tile 90°
function swapTileDims(wId, hId, btn){
  const w = $(wId), h = $(hId);
  const tmp = w.value;
  w.value = h.value;
  h.value = tmp;
  if(btn){ btn.classList.toggle('spin'); }
  readSettings();
}
$('rot-wall').addEventListener('click', e => swapTileDims('tww','twh', e.currentTarget));
$('rot-floor').addEventListener('click', e => swapTileDims('tfw','tfh', e.currentTarget));

// ===== Add-mode buttons =====
$('add-d90').onclick=()=>{ if(state.mode==='addOp'&&pendingOp.width===90)exitMode(); else enterAddOp('door',90,200,0,'add-d90'); };
$('add-d75').onclick=()=>{ if(state.mode==='addOp'&&pendingOp.width===75)exitMode(); else enterAddOp('door',75,200,0,'add-d75'); };
$('add-win').onclick=()=>{ if(state.mode==='addOp'&&pendingOp.type==='window')exitMode(); else enterAddOp('window',90,60,130,'add-win'); };
$('add-thr').onclick=()=>{
  if(!state.threshold){ ensureThresholdDefault(); }
  state.selected={kind:'threshold'};
  render();
};
$('add-drain').onclick=()=>{
  if(state.mode==='addDrain') exitMode();
  else enterAddDrain();
};

// Material model inputs → state.materials
['mat-wall-tile','mat-floor-tile','mat-wall-grout','mat-floor-grout','mat-location'].forEach(id => {
  const el = $(id); if(!el) return;
  const key = {
    'mat-wall-tile':   'wallTileModel',
    'mat-floor-tile':  'floorTileModel',
    'mat-wall-grout':  'groutWallModel',
    'mat-floor-grout': 'groutFloorModel',
    'mat-location':    'location'
  }[id];
  el.addEventListener('input', () => {
    if(!state.materials) state.materials = {};
    state.materials[key] = el.value.trim();
    renderMaterialSummary();
  });
});
$('add-shaft').onclick=()=>{
  const s = ensureShaftDefault();
  state.selected={kind:'shaft', id:s.id};
  render();
};
$('cancel-add').onclick=exitMode;
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&state.mode!=='edit')exitMode(); });

// ===== Export / Import =====
function dl(blob,name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=name;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},100);
}
$('ex-json').onclick=()=>{
  gcEvent('export-json', 'JSON Export');
  dl(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'tile-plan-'+Date.now()+'.json');
};
$('im-json').onclick=()=>$('fi').click();
$('fi').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      if(d.room && d.tiles){
        state=Object.assign(state, d);
        if(!Array.isArray(state.shafts)) state.shafts = [];
        if(typeof state.sCnt !== 'number') state.sCnt = state.shafts.length;
        if(typeof state.tiles.showTileNumbers !== 'boolean') state.tiles.showTileNumbers = false;
        if($('show-tile-numbers')) $('show-tile-numbers').checked = state.tiles.showTileNumbers;
        $('rl').value=state.room.length; $('rw').value=state.room.width;
        gcEvent('import-json', 'Import JSON');
        $('rh').value=state.room.wallHeight; $('ih').value=state.room.installHeight;
        $('tww').value=cmToMm(state.tiles.wallW); $('twh').value=cmToMm(state.tiles.wallH);
        $('tfw').value=cmToMm(state.tiles.floorW); $('tfh').value=cmToMm(state.tiles.floorH);
        $('grt-wall').value  = state.tiles.groutWallMm  || state.tiles.groutMm || 3;
        $('grt-floor').value = state.tiles.groutFloorMm || state.tiles.groutMm || 3;
        // Sync material model inputs
        const mat = state.materials || {};
        if($('mat-wall-tile'))   $('mat-wall-tile').value   = mat.wallTileModel   || '';
        if($('mat-floor-tile'))  $('mat-floor-tile').value  = mat.floorTileModel  || '';
        if($('mat-wall-grout'))  $('mat-wall-grout').value  = mat.groutWallModel  || '';
        if($('mat-floor-grout')) $('mat-floor-grout').value = mat.groutFloorModel || '';
        if($('mat-location'))    $('mat-location').value    = mat.location        || '';
        // migrate offsetX
        if(typeof state.tiles.offsetX === 'number'){
          const v = state.tiles.offsetX;
          state.tiles.offsetX = {W1:v,W2:v,W3:v,W4:v};
        } else if(!state.tiles.offsetX || typeof state.tiles.offsetX !== 'object'){
          state.tiles.offsetX = {W1:0,W2:0,W3:0,W4:0};
        }
        if(typeof state.tiles.offsetY !== 'number') state.tiles.offsetY = 0;
        if(!state.tiles.floorOffset || typeof state.tiles.floorOffset !== 'object'){
          state.tiles.floorOffset = {x:0, y:0};
        }
        if(!state.tiles.floorBondMode){
          state.tiles.floorBondMode = state.tiles.bondMode || 'aligned';
        }
        // sync floor bond select UI
        const fbSel = document.querySelector('.fbond-select');
        if(fbSel) fbSel.value = state.tiles.floorBondMode;
        // sync wall bond select UI
        const wbSel = document.querySelector('.wbond-select');
        if(wbSel) wbSel.value = state.tiles.bondMode;
        const fxs = document.querySelector('.fx-slider'), fxn = document.querySelector('.fx-num');
        const fys = document.querySelector('.fy-slider'), fyn = document.querySelector('.fy-num');
        if(fxs){ fxs.value = cmToMm(state.tiles.floorOffset.x); fxn.value = cmToMm(state.tiles.floorOffset.x); }
        if(fys){ fys.value = cmToMm(state.tiles.floorOffset.y); fyn.value = cmToMm(state.tiles.floorOffset.y); }
        if(typeof syncFloorOffsetMax === 'function') syncFloorOffsetMax();
        // sync UI
        ['W1','W2','W3','W4'].forEach(w => {
          const item = document.querySelector('.offset-item[data-wall="'+w+'"]');
          if(item){
            const v = cmToMm(state.tiles.offsetX[w] || 0);
            item.querySelector('input[type=range]').value = v;
            item.querySelector('input[type=number]').value = v;
          }
        });
        const yItem = document.querySelector('.offset-y-global');
        if(yItem){
          yItem.querySelector('input[type=range]').value = cmToMm(state.tiles.offsetY);
          yItem.querySelector('input[type=number]').value = cmToMm(state.tiles.offsetY);
        }
        if(typeof syncOffsetMax === 'function') syncOffsetMax();
        state.selected=null; state.mode='edit';
        render();
      }
    }catch(err){alert('JSON 解析失败:'+err.message);}
  };
  r.readAsText(f);
  e.target.value='';
};

const wbondSelect = document.querySelector('.wbond-select');
if(wbondSelect){
  wbondSelect.addEventListener('change', () => {
    state.tiles.bondMode = wbondSelect.value;
    render();
  });
}

const fbondSelect = document.querySelector('.fbond-select');
if(fbondSelect){
  fbondSelect.addEventListener('change', () => {
    state.tiles.floorBondMode = fbondSelect.value;
    render();
  });
}

const tileNumberToggle = $('show-tile-numbers');
if(tileNumberToggle){
  tileNumberToggle.checked = !!state.tiles.showTileNumbers;
  tileNumberToggle.addEventListener('change', () => {
    state.tiles.showTileNumbers = tileNumberToggle.checked;
    render();
  });
}
document.querySelectorAll('#seg-dim button').forEach(b => {
  b.addEventListener('click', () => {
    const wasActive = b.classList.contains('active');
    document.querySelectorAll('#seg-dim button').forEach(x => x.classList.remove('active'));
    if(wasActive){
      state.tiles.dimStyle = 'off';
    } else {
      b.classList.add('active');
      state.tiles.dimStyle = b.dataset.dim;
    }
    render();
  });
});

// ===== Tile-view toggle (walls preview vs unfolded box) =====
const VIEW_KEY = 'tile-planner-view';
function applyView(mode){
  if(mode !== 'walls' && mode !== 'unfolded') mode = 'walls';
  try { localStorage.setItem(VIEW_KEY, mode); } catch(e){}
  $('tile-walls').style.display = mode === 'walls' ? '' : 'none';
  $('tile-unfolded').style.display = mode === 'unfolded' ? '' : 'none';
  $('tile-view-title').textContent = mode === 'walls' ? '墙面瓷砖展开' : '纸盒展开图';
  document.querySelectorAll('#seg-tile-view button').forEach(x =>
    x.classList.toggle('active', x.dataset.view === mode)
  );
  // dim segment only relevant in walls view; hide in unfolded
  $('seg-dim').style.display = mode === 'walls' ? '' : 'none';
  // re-render so the now-visible svg picks up correct container width
  render();
}
document.querySelectorAll('#seg-tile-view button').forEach(b => {
  b.addEventListener('click', () => {
    if(b.dataset.view === 'unfolded') gcEvent('view-unfolded', 'Switch to unfolded view');
    applyView(b.dataset.view);
  });
});
let _initialView = 'walls';
try { _initialView = localStorage.getItem(VIEW_KEY) || 'walls'; } catch(e){}
applyView(_initialView);
