// Browser-local named configurations. Profiles never leave localStorage.
(function(){
  const KEY='tile-planner-profiles';
  const dialog=$('profiles-dialog');
  const select=$('profile-select');
  const nameInput=$('profile-name');
  if(!dialog || !select) return;

  function readProfiles(){
    try{
      const value=JSON.parse(localStorage.getItem(KEY)||'{}');
      return value && typeof value==='object' ? value : {};
    }catch(e){ return {}; }
  }
  function writeProfiles(profiles){
    try{ localStorage.setItem(KEY,JSON.stringify(profiles)); return true; }
    catch(e){ alert('保存配置失败：浏览器本地存储不可用'); return false; }
  }
  function snapshot(){
    const copy=JSON.parse(JSON.stringify(state));
    copy.selected=null;
    copy.mode='edit';
    return copy;
  }
  function refreshList(selectedName){
    const profiles=readProfiles();
    select.innerHTML='';
    Object.keys(profiles).sort((a,b)=>(profiles[b].savedAt||0)-(profiles[a].savedAt||0)).forEach(name=>{
      const option=document.createElement('option');
      option.value=name;
      option.textContent=name;
      select.appendChild(option);
    });
    if(selectedName && profiles[selectedName]) select.value=selectedName;
    if(!select.value && select.options.length) select.selectedIndex=0;
  }
  function syncForm(){
    const r=state.room, t=state.tiles;
    [['rl',r.length],['rw',r.width],['rh',r.wallHeight],['ih',r.installHeight],['msm-strip-len',state.trimStripLen],
      ['tww',cmToMm(t.wallW)],['twh',cmToMm(t.wallH)],['tfw',cmToMm(t.floorW)],['tfh',cmToMm(t.floorH)],
      ['grt-wall',t.groutWallMm||t.groutMm||3],['grt-floor',t.groutFloorMm||t.groutMm||3]].forEach(([id,value])=>{
        const el=$(id); if(el) el.value=value;
      });
    const setValue=(selector,value)=>{const el=document.querySelector(selector);if(el)el.value=value;};
    setValue('.wbond-select',t.bondMode||'aligned');
    setValue('.fbond-select',t.floorBondMode||t.bondMode||'aligned');
    const numberToggle=$('show-tile-numbers');
    if(numberToggle) numberToggle.checked=!!t.showTileNumbers;
    const mat=state.materials||{};
    [['mat-wall-tile',mat.wallTileModel],['mat-floor-tile',mat.floorTileModel],['mat-wall-grout',mat.groutWallModel],['mat-floor-grout',mat.groutFloorModel],['mat-location',mat.location]].forEach(([id,value])=>{const el=$(id);if(el)el.value=value||'';});
    ['W1','W2','W3','W4'].forEach(w=>{
      const item=document.querySelector(`.offset-item[data-wall="${w}"]`); if(!item)return;
      const value=cmToMm((t.offsetX&&t.offsetX[w])||0);
      item.querySelector('input[type=range]').value=value;
      item.querySelector('input[type=number]').value=value;
    });
    const yItem=document.querySelector('.offset-y-global');
    if(yItem){ const value=cmToMm(t.offsetY||0); yItem.querySelector('input[type=range]').value=value; yItem.querySelector('input[type=number]').value=value; }
    const floorOffset=t.floorOffset||{x:0,y:0};
    [['.fx-slider','.fx-num',floorOffset.x],['.fy-slider','.fy-num',floorOffset.y]].forEach(([s,n,value])=>{setValue(s,cmToMm(value||0));setValue(n,cmToMm(value||0));});
    if(typeof syncOffsetMax==='function') syncOffsetMax();
    if(typeof syncFloorOffsetMax==='function') syncFloorOffsetMax();
  }
  function mergeState(saved){
    const next=Object.assign({},state,saved);
    next.room=Object.assign({},state.room,saved.room||{});
    next.tiles=Object.assign({},state.tiles,saved.tiles||{});
    next.materials=Object.assign({},state.materials,saved.materials||{});
    if(!Array.isArray(next.openings)) next.openings=[];
    if(!Array.isArray(next.drains)) next.drains=[];
    if(!Array.isArray(next.shafts)) next.shafts=[];
    if(!next.tiles.offsetX || typeof next.tiles.offsetX!=='object') next.tiles.offsetX={W1:0,W2:0,W3:0,W4:0};
    if(!next.tiles.floorOffset || typeof next.tiles.floorOffset!=='object') next.tiles.floorOffset={x:0,y:0};
    if(typeof next.tiles.showTileNumbers!=='boolean') next.tiles.showTileNumbers=false;
    next.selected=null; next.mode='edit';
    return next;
  }

  $('profile-manager').addEventListener('click',()=>{
    refreshList();
    if(typeof dialog.showModal==='function') dialog.showModal(); else dialog.setAttribute('open','');
  });
  $('profile-close').addEventListener('click',()=>dialog.close());
  $('profile-save').addEventListener('click',()=>{
    const name=nameInput.value.trim();
    if(!name){ alert('请先输入配置名称'); nameInput.focus(); return; }
    const profiles=readProfiles();
    profiles[name]={savedAt:Date.now(),state:snapshot()};
    if(writeProfiles(profiles)){ refreshList(name); nameInput.value=''; }
  });
  $('profile-load').addEventListener('click',()=>{
    const name=select.value, profiles=readProfiles();
    if(!name || !profiles[name]){ alert('请选择要切换的配置'); return; }
    state=mergeState(profiles[name].state||{});
    syncForm();
    render();
    dialog.close();
  });
  $('profile-delete').addEventListener('click',()=>{
    const name=select.value, profiles=readProfiles();
    if(!name || !profiles[name]) return;
    delete profiles[name];
    if(writeProfiles(profiles)) refreshList();
  });
})();
