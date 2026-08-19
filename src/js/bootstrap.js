// Offset control bindings and final application startup.
function bindOffsetItem(item){
  const wall = item.dataset.wall;
  const slider = item.querySelector('input[type=range]');
  const num = item.querySelector('input[type=number]');
  function setVal(vMm, source){
    vMm = Math.max(0, +vMm || 0);
    if(!state.tiles.offsetX || typeof state.tiles.offsetX !== 'object'){
      state.tiles.offsetX = {W1:0,W2:0,W3:0,W4:0};
    }
    state.tiles.offsetX[wall] = mmToCm(vMm);  // store cm
    if(source !== 'slider') slider.value = vMm;
    if(source !== 'num') num.value = vMm;
    render();
  }
  slider.addEventListener('input', () => setVal(slider.value, 'slider'));
  num.addEventListener('input', () => setVal(num.value, 'num'));
}
document.querySelectorAll('.offset-item:not(.offset-y-global)').forEach(bindOffsetItem);

function bindOffsetY(){
  const item = document.querySelector('.offset-y-global');
  if(!item) return;
  const slider = item.querySelector('input[type=range]');
  const num = item.querySelector('input[type=number]');
  function setY(vMm, src){
    vMm = Math.max(0, +vMm || 0);
    state.tiles.offsetY = mmToCm(vMm);
    if(src !== 'slider') slider.value = vMm;
    if(src !== 'num') num.value = vMm;
    render();
  }
  slider.addEventListener('input', () => setY(slider.value, 'slider'));
  num.addEventListener('input', () => setY(num.value, 'num'));
}
bindOffsetY();

function bindFloorOffset(){
  const xs = document.querySelector('.fx-slider');
  const xn = document.querySelector('.fx-num');
  const ys = document.querySelector('.fy-slider');
  const yn = document.querySelector('.fy-num');
  function setX(vMm, src){
    vMm = Math.max(0, +vMm || 0);
    state.tiles.floorOffset.x = mmToCm(vMm);  // store cm
    if(src !== 'slider') xs.value = vMm;
    if(src !== 'num') xn.value = vMm;
    render();
  }
  function setY(vMm, src){
    vMm = Math.max(0, +vMm || 0);
    state.tiles.floorOffset.y = mmToCm(vMm);  // store cm
    if(src !== 'slider') ys.value = vMm;
    if(src !== 'num') yn.value = vMm;
    render();
  }
  xs.addEventListener('input', () => setX(xs.value, 'slider'));
  xn.addEventListener('input', () => setX(xn.value, 'num'));
  ys.addEventListener('input', () => setY(ys.value, 'slider'));
  yn.addEventListener('input', () => setY(yn.value, 'num'));
}
bindFloorOffset();

function syncFloorOffsetMax(){
  const fxs = document.querySelector('.fx-slider'), fxn = document.querySelector('.fx-num');
  const fys = document.querySelector('.fy-slider'), fyn = document.querySelector('.fy-num');
  if(!fxs || !fys) return;
  // sliders display in mm; clamp logic compares cm-state
  fxs.max = cmToMm(state.tiles.floorW); fxn.max = cmToMm(state.tiles.floorW);
  fys.max = cmToMm(state.tiles.floorH); fyn.max = cmToMm(state.tiles.floorH);
  if(state.tiles.floorOffset.x > state.tiles.floorW){
    state.tiles.floorOffset.x = state.tiles.floorW;
    fxs.value = cmToMm(state.tiles.floorW); fxn.value = cmToMm(state.tiles.floorW);
  }
  if(state.tiles.floorOffset.y > state.tiles.floorH){
    state.tiles.floorOffset.y = state.tiles.floorH;
    fys.value = cmToMm(state.tiles.floorH); fyn.value = cmToMm(state.tiles.floorH);
  }
}
syncFloorOffsetMax();

function syncOffsetMax(){
  // max displayed in mm; state cm
  const maxMm = cmToMm(state.tiles.wallW);
  document.querySelectorAll('.offset-item:not(.offset-y-global) input[type=range]').forEach(s2 => s2.max = maxMm);
  document.querySelectorAll('.offset-item:not(.offset-y-global) input[type=number]').forEach(s2 => s2.max = maxMm);
  ['W1','W2','W3','W4'].forEach(w => {
    if((state.tiles.offsetX[w] || 0) > state.tiles.wallW){
      state.tiles.offsetX[w] = state.tiles.wallW;
      const item = document.querySelector('.offset-item[data-wall="'+w+'"]');
      if(item){
        item.querySelector('input[type=range]').value = maxMm;
        item.querySelector('input[type=number]').value = maxMm;
      }
    }
  });
  const maxYMm = cmToMm(state.tiles.wallH);
  const yItem = document.querySelector('.offset-y-global');
  if(yItem){
    yItem.querySelector('input[type=range]').max = maxYMm;
    yItem.querySelector('input[type=number]').max = maxYMm;
    if(state.tiles.offsetY > state.tiles.wallH){
      state.tiles.offsetY = state.tiles.wallH;
      yItem.querySelector('input[type=range]').value = maxYMm;
      yItem.querySelector('input[type=number]').value = maxYMm;
    }
  }
}
syncOffsetMax();

window.addEventListener('resize',()=>render());
render();
