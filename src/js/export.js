// Self-contained PNG, SVG, and print/PDF export flows.
// Strategy: clone target SVGs, inject all page <style> blocks (with dark-mode @media stripped
// so dark-mode viewers don't recolor the export), serialize, render onto a 2x canvas with
// header text. Force light theme during export for clean white-bg output.

function getExportCSS(){
  // Local same-origin stylesheets can be embedded directly in exported SVGs.
  let css = Array.from(document.styleSheets)
    .map(sheet => {
      try { return Array.from(sheet.cssRules, rule => rule.cssText).join('\n'); }
      catch(e) { return ''; }
    })
    .join('\n');
  // Strip @media (prefers-color-scheme: dark) blocks (they'd activate in dark-mode viewers
  // when SVG is opened standalone, even though we forced light at export time)
  css = css.replace(
    /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,
    ''
  );
  // Strip html[data-theme="dark"] rules too (defensive — wouldn't match standalone SVG anyway,
  // but keeps the embedded CSS lean)
  css = css.replace(
    /html\[data-theme=["']dark["']\][^{}]*\{[^{}]*\}/g,
    ''
  );
  return css;
}

async function svgToImage(svgEl, css){
  const clone = svgEl.cloneNode(true);
  const bbox = svgEl.getBoundingClientRect();
  const w = Math.max(1, Math.round(bbox.width));
  const h = Math.max(1, Math.round(bbox.height));

  // Strip foreignObject (used for inline dim-edit inputs in plan view).
  // Safari and some Chrome versions fail to rasterize SVG containing foreignObject
  // via the Image() pathway, returning a blank/broken image.
  clone.querySelectorAll('foreignObject').forEach(fo => fo.remove());

  // Inject CSS as <style> inside the cloned SVG (so it's self-contained)
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = css;
  clone.insertBefore(styleEl, clone.firstChild);

  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  if(!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const xml = new XMLSerializer().serializeToString(clone);
  // Use data URL (encodeURIComponent) — more compatible than blob URL across browsers
  // for Image() loading + later canvas drawing.
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const timer = setTimeout(() => {
      if(settled) return;
      settled = true;
      reject(new Error('SVG load timeout'));
    }, 10000);
    img.onload = () => {
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({img, w, h, xml});
    };
    img.onerror = (e) => {
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('SVG image load failed'));
    };
    img.src = dataUrl;
  });
}

function downloadBlob(blob, filename){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 100);
}

function exportFilename(ext, suffix){
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  // Sanitize: drop chars illegal on Windows/macOS filenames, collapse spaces.
  const clean = s => String(s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  const proj = (typeof getProjectInfo === 'function') ? getProjectInfo() : {name:''};
  const parts = ['tile-plan'];
  const name = clean(proj.name);
  if(name) parts.push(name);
  parts.push(date);
  if(suffix) parts.push(suffix);
  return `${parts.join('_')}.${ext}`;
}

function withForcedLightTheme(fn){
  // Returns a Promise. Forces data-theme="light" before calling fn, restores after.
  const root = document.documentElement;
  const prevAttr = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light');
  // Wait 2 frames for any CSS-triggered repaint
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    .then(fn)
    .finally(() => {
      if(prevAttr === null){
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', prevAttr);
      }
    });
}

// Export wrapper: forces light theme + 建築風 dim notation, restores both after.
function withExportContext(fn){
  return withForcedLightTheme(async () => {
    const prevDim = state.tiles.dimStyle;
    if(prevDim !== 'arch'){
      state.tiles.dimStyle = 'arch';
      if(typeof render === 'function') render();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    try {
      return await fn();
    } finally {
      if(prevDim !== 'arch'){
        state.tiles.dimStyle = prevDim;
        if(typeof render === 'function') render();
      }
    }
  });
}

// Read current stats DOM — shared by PNG / SVG / PDF export.
function getExportStatsData(){
  const g = id => { const el = $(id); return el ? el.textContent : '—'; };
  const row = pfx => ({
    full: { label: '全片', value: g('s-'+pfx+'-full'), unit: '片' },
    cut:  { label: '裁切', value: g('s-'+pfx+'-cut'),  unit: '片' },
    buy:  { label: '估購', value: g('s-'+pfx+'-buy'),  unit: g('s-'+pfx+'-buy-sub') },
    area: { label: '鋪貼', value: g('s-'+pfx+'-area'), unit: 'm²  /  '+g('s-'+pfx+'-pin')+' 坪' }
  });
  return { wall: row('w'), floor: row('f') };
}
function getExportStatsLines(){
  const d = getExportStatsData();
  const fmt = (lbl, r) => `${lbl}:全片 ${r.full.value} 片  /  裁切 ${r.cut.value} 片  /  估購 ${r.buy.value} ${r.buy.unit}  /  鋪貼 ${r.area.value} ${r.area.unit}`;
  return [fmt('牆面磁磚', d.wall), fmt('地板磁磚', d.floor)];
}

// ===== Kami design tokens (shared by PNG / SVG / PDF export) =====
const KAMI = {
  parchment:'#f5f4ed', ivory:'#faf9f5', sand:'#e8e6dc', borderSoft:'#e5e3d8',
  brand:'#1B365D', nearBlack:'#141413', darkWarm:'#3d3d3a',
  olive:'#504e49', stone:'#6b6a64',
  // serif key kept for code compatibility — value is now a modern sans-serif system stack
  serif: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", "Microsoft YaHei", Arial, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", Consolas, "Microsoft JhengHei", monospace'
};

// LINE watermark — fixed branding
const LINE_WATERMARK = '官方LINE: @329uzcco · 廢棄物清運快速估價';

// ===== Project info (案名/地址/副標題) =====
const PROJ_KEY = 'tilePlanner.projectInfo.v1';
function getProjectInfo(){
  try {
    const raw = localStorage.getItem(PROJ_KEY);
    if(raw){
      const d = JSON.parse(raw);
      return { name: d.name||'', addr: d.addr||'', sub: d.sub||'Tile Layout' };
    }
  } catch(_) {}
  return { name:'', addr:'', sub:'Tile Layout' };
}
function setProjectInfo(p){
  try { localStorage.setItem(PROJ_KEY, JSON.stringify(p)); } catch(_) {}
}
(function initProjDialog(){
  const dlg = $('proj-dialog');
  if(!dlg) return;
  const fill = () => {
    const p = getProjectInfo();
    $('proj-name').value = p.name;
    $('proj-addr').value = p.addr;
    $('proj-sub').value  = p.sub;
  };
  const open = () => {
    fill();
    if(typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open','');
  };
  const close = () => {
    if(typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  };
  $('proj-info').addEventListener('click', open);
  $('proj-cancel').addEventListener('click', close);
  $('proj-save').addEventListener('click', () => {
    setProjectInfo({
      name: $('proj-name').value.trim(),
      addr: $('proj-addr').value.trim(),
      sub:  $('proj-sub').value.trim() || 'Tile Layout'
    });
    close();
  });
})();

async function exportPNG(){
  const btn = $('ex-png');
  const oldText = btn ? btn.textContent : '';
  if(btn){ btn.textContent = '匯出中…'; btn.disabled = true; }
  try {
    await withExportContext(async () => {
      const css = getExportCSS();
      const planSvg = $('canvas');
      const wallsSvg = $('tile-walls');
      const unfoldedSvg = $('tile-unfolded');

      const planRes = await svgToImage(planSvg, css);
      const wallsRes = await svgToImage(wallsSvg, css);
      const unfoldedRes = await svgToImage(unfoldedSvg, css);
      const tileRes = wallsRes; // page 1 uses walls

      const r = state.room, t = state.tiles;
      const stats = getExportStatsData();
      const proj = getProjectInfo();
      const ts = new Date().toLocaleString('zh-TW');
      const dpi = 2;

      // Layout tokens (px on canvas)
      const PAD = 36, GAP = 28, CARD_PAD = 18, METRIC_GAP = 10;
      const titleH = 32, subH = 18, ruleGap = 16;
      const projLineH = (proj.name || proj.addr) ? 20 : 0;
      const subtitleH = 16;
      const metricRowH = 64;
      const tagH = 22;
      const footerH = 28;

      // 1:2 body layout — plan column 1/3, tile column 2/3 (architectural drawing convention)
      const tileTargetW = 720;
      const planTargetW = tileTargetW / 2;
      const planScale = planTargetW / planRes.w;
      const tileScale = tileTargetW / tileRes.w;
      const planRenderW = planTargetW;
      const planRenderH = planRes.h * planScale;
      const tileRenderW = tileTargetW;
      const tileRenderH = tileRes.h * tileScale;

      const bodyW = planRenderW + tileRenderW + GAP + CARD_PAD * 4;
      const totalW = bodyW + PAD * 2;
      const innerW = totalW - PAD * 2;

      const headerBlockH = titleH + subtitleH + projLineH + subH + ruleGap;
      const metricBlockH = metricRowH * 2 + METRIC_GAP;
      const bodyH = Math.max(planRenderH, tileRenderH) + CARD_PAD * 2;
      const beforeBody = PAD + headerBlockH + 20 + metricBlockH + 24 + tagH + 8;
      const totalH = beforeBody + bodyH + 20 + footerH + PAD;

      const canvas = document.createElement('canvas');
      canvas.width = totalW * dpi;
      canvas.height = totalH * dpi;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpi, dpi);

      // Parchment background
      ctx.fillStyle = KAMI.parchment;
      ctx.fillRect(0, 0, totalW, totalH);

      const fSerif = (px, w) => `${w||500} ${px}px ${KAMI.serif}`;
      const fSans  = (px, w) => `${w||400} ${px}px ${KAMI.serif}`;

      // ===== Header =====
      let y = PAD;
      const titleBarH = titleH + subtitleH + projLineH - 4;
      // brand left bar (spans title + subtitle + proj line)
      ctx.fillStyle = KAMI.brand;
      ctx.fillRect(PAD, y, 2.5, titleBarH);
      // title
      ctx.fillStyle = KAMI.nearBlack;
      ctx.font = fSerif(24, 500);
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('浴室磁磚計畫', PAD + 12, y + 22);
      // meta date right-aligned
      ctx.fillStyle = KAMI.stone;
      ctx.font = fSerif(11, 400);
      ctx.textAlign = 'right';
      ctx.fillText(ts, totalW - PAD, y + 20);
      ctx.textAlign = 'left';

      y += titleH;
      // subtitle (uppercase eyebrow, brand color, letter-spaced)
      const subText = (proj.sub || 'Tile Layout').toUpperCase();
      ctx.fillStyle = KAMI.brand;
      ctx.font = '600 10px ' + KAMI.serif;
      ctx.fillText(subText, PAD + 12, y + 12, undefined);
      // wide letter-spacing simulation: draw chars individually
      // (canvas has no letter-spacing; use measureText to space)
      // For simplicity we keep the default rendering — modern Chrome supports ctx.letterSpacing
      if('letterSpacing' in ctx){ ctx.letterSpacing = '1.5px'; ctx.fillText(subText, PAD + 12, y + 12); ctx.letterSpacing = '0px'; }
      y += subtitleH;

      // project name + address line
      if(proj.name || proj.addr){
        let x = PAD + 12;
        if(proj.name){
          ctx.fillStyle = KAMI.nearBlack;
          ctx.font = fSerif(13, 500);
          ctx.fillText(proj.name, x, y + 12);
          x += ctx.measureText(proj.name).width;
        }
        if(proj.name && proj.addr){
          ctx.fillStyle = '#b8b7b0';
          ctx.fillText('  ·  ', x, y + 12);
          x += ctx.measureText('  ·  ').width;
        }
        if(proj.addr){
          ctx.fillStyle = KAMI.olive;
          ctx.font = fSerif(12, 400);
          ctx.fillText(proj.addr, x, y + 12);
        }
        y += projLineH;
      }

      // subtitle (specs in one warm-gray line)
      const spec = `房間 ${r.length}×${r.width} cm  ·  牆高 ${r.wallHeight} cm  ·  安裝高 ${r.installHeight} cm   |   牆磚 ${cmToMm(t.wallW)}×${cmToMm(t.wallH)} mm  ·  地磚 ${cmToMm(t.floorW)}×${cmToMm(t.floorH)} mm  ·  縫 ${t.groutMm} mm`;
      ctx.fillStyle = KAMI.olive;
      ctx.font = fSans(11, 400);
      ctx.fillText(spec, PAD + 12, y + 12);
      y += subH;

      // hairline divider
      y += 10;
      ctx.strokeStyle = KAMI.sand;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(totalW - PAD, y); ctx.stroke();
      y += 14;

      // ===== Metric grid (2 rows x 4 cards) =====
      const rowLabelW = 70;
      const cellGap = 8;
      const cellW = (innerW - rowLabelW - cellGap * 4) / 4;

      function drawMetricRow(rowY, rowLabel, data){
        // row label
        ctx.fillStyle = KAMI.nearBlack;
        ctx.font = fSerif(12, 500);
        ctx.fillText(rowLabel, PAD, rowY + metricRowH / 2 + 4);

        const cells = [data.full, data.cut, data.buy, data.area];
        let cx = PAD + rowLabelW;
        for(const c of cells){
          // card bg
          ctx.fillStyle = KAMI.ivory;
          roundRect(ctx, cx, rowY, cellW, metricRowH, 6, true, false);
          ctx.strokeStyle = KAMI.sand;
          ctx.lineWidth = 0.5;
          roundRect(ctx, cx + 0.25, rowY + 0.25, cellW - 0.5, metricRowH - 0.5, 6, false, true);

          // label (top, small caps)
          ctx.fillStyle = KAMI.olive;
          ctx.font = '600 9px ' + KAMI.serif;
          ctx.fillText(c.label, cx + 12, rowY + 18);

          // value (brand, serif, tabular)
          ctx.fillStyle = KAMI.brand;
          ctx.font = fSerif(20, 500);
          ctx.fillText(c.value, cx + 12, rowY + 44);

          // unit suffix (after the number)
          const valW = ctx.measureText(c.value).width;
          ctx.fillStyle = KAMI.olive;
          ctx.font = fSans(10, 400);
          ctx.fillText(c.unit, cx + 12 + valW + 5, rowY + 44);

          cx += cellW + cellGap;
        }
      }
      drawMetricRow(y, '牆面磁磚', stats.wall);
      drawMetricRow(y + metricRowH + METRIC_GAP, '地板磁磚', stats.floor);
      y += metricBlockH + 24;

      // ===== Body section: tags + image cards (architectural style) =====
      const leftX = PAD;
      const leftCardW = planRenderW + CARD_PAD * 2;
      const rightX = leftX + leftCardW + GAP;
      const rightCardW = tileRenderW + CARD_PAD * 2;

      // Architectural tag — thin outline box, monospace, drawing number
      function drawTag(x, ty, num, name){
        const tagFont = '500 9px ' + KAMI.mono;
        ctx.font = tagFont;
        const fullText = `${num} · ${name}`;
        const w = ctx.measureText(fullText).width + 16;
        ctx.strokeStyle = KAMI.stone;
        ctx.lineWidth = 0.4;
        ctx.strokeRect(x + 0.2, ty + 0.2, w - 0.4, tagH - 0.4);
        // draw num in brand, name in dark warm
        ctx.font = '600 9px ' + KAMI.mono;
        ctx.fillStyle = KAMI.brand;
        ctx.fillText(num, x + 8, ty + 15);
        const numW = ctx.measureText(num).width;
        ctx.font = '500 9px ' + KAMI.mono;
        ctx.fillStyle = KAMI.darkWarm;
        ctx.fillText(' · ' + name, x + 8 + numW, ty + 15);
      }
      drawTag(leftX, y, 'A-01', 'PLAN · 平面圖');
      drawTag(rightX, y, 'A-02', 'WALL TILES · 牆面磁磚');
      y += tagH + 8;

      // Image cards — architectural thin outline, no fill
      const cardH = Math.max(planRenderH, tileRenderH) + CARD_PAD * 2;
      function drawImageCard(x, w, h, img, imgW, imgH){
        ctx.strokeStyle = KAMI.stone;
        ctx.lineWidth = 0.4;
        ctx.strokeRect(x + 0.2, y + 0.2, w - 0.4, h - 0.4);
        const iy = y + (h - imgH) / 2;
        ctx.drawImage(img, x + CARD_PAD, iy, imgW, imgH);
      }
      drawImageCard(leftX, leftCardW, cardH, planRes.img, planRenderW, planRenderH);
      drawImageCard(rightX, rightCardW, cardH, tileRes.img, tileRenderW, tileRenderH);
      y += cardH + 16;

      // Footer removed — date already shown in header right-aligned meta.

      // ===== Download Page 1 (layout) =====
      await new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if(!blob){ reject(new Error('canvas.toBlob 失敗')); return; }
          downloadBlob(blob, exportFilename('png', '01_layout'));
          resolve();
        }, 'image/png');
      });

      // ===== Page 2: unfolded only (no header / metric, full-width image) =====
      const p2_w = totalW;
      const p2_innerW = p2_w - PAD * 2;
      const p2_imgRenderW = p2_innerW - CARD_PAD * 2;
      const p2_imgRenderH = unfoldedRes.h * (p2_imgRenderW / unfoldedRes.w);
      const p2_cardH = p2_imgRenderH + CARD_PAD * 2;
      const p2_h = PAD * 2 + tagH + 8 + p2_cardH;

      const canvas2 = document.createElement('canvas');
      canvas2.width = p2_w * dpi;
      canvas2.height = p2_h * dpi;
      const ctx2 = canvas2.getContext('2d');
      ctx2.scale(dpi, dpi);
      ctx2.fillStyle = KAMI.parchment;
      ctx2.fillRect(0, 0, p2_w, p2_h);

      let y2 = PAD;
      // tag A-03
      const tagText = ' · UNFOLDED · 紙盒展開';
      ctx2.font = '500 9px ' + KAMI.mono;
      const numW2 = ctx2.measureText('A-03').width;
      const restW = ctx2.measureText(tagText).width;
      const tagWidth = numW2 + restW + 16;
      ctx2.strokeStyle = KAMI.stone;
      ctx2.lineWidth = 0.4;
      ctx2.strokeRect(PAD + 0.2, y2 + 0.2, tagWidth - 0.4, tagH - 0.4);
      ctx2.font = '600 9px ' + KAMI.mono;
      ctx2.fillStyle = KAMI.brand;
      ctx2.fillText('A-03', PAD + 8, y2 + 15);
      ctx2.font = '500 9px ' + KAMI.mono;
      ctx2.fillStyle = KAMI.darkWarm;
      ctx2.fillText(tagText, PAD + 8 + numW2, y2 + 15);
      y2 += tagH + 8;

      // image card
      ctx2.strokeStyle = KAMI.stone;
      ctx2.lineWidth = 0.4;
      ctx2.strokeRect(PAD + 0.2, y2 + 0.2, p2_innerW - 0.4, p2_cardH - 0.4);
      ctx2.drawImage(unfoldedRes.img, PAD + CARD_PAD, y2 + CARD_PAD, p2_imgRenderW, p2_imgRenderH);

      await new Promise((resolve, reject) => {
        canvas2.toBlob(blob => {
          if(!blob){ reject(new Error('canvas.toBlob 失敗')); return; }
          downloadBlob(blob, exportFilename('png', '02_unfolded'));
          resolve();
        }, 'image/png');
      });
    });
  } catch(e){
    alert('匯出 PNG 失敗:' + (e.message || e));
    console.error('exportPNG error:', e);
  } finally {
    if(btn){ btn.textContent = oldText; btn.disabled = false; }
  }
}

// Rounded-rect helper for canvas
function roundRect(ctx, x, y, w, h, r, fill, stroke){
  if(w < 2*r) r = w/2; if(h < 2*r) r = h/2;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
  if(fill) ctx.fill();
  if(stroke) ctx.stroke();
}

async function exportSVG(){
  const btn = $('ex-svg');
  const oldText = btn ? btn.textContent : '';
  if(btn){ btn.textContent = '匯出中…'; btn.disabled = true; }
  try {
    await withExportContext(async () => {
      const css = getExportCSS();
      const planSvg = $('canvas');
      const wallsSvg = $('tile-walls');
      const unfoldedSvg = $('tile-unfolded');
      const tileSvg = wallsSvg; // page 1 uses walls

      const planBox = planSvg.getBoundingClientRect();
      const tileBox = wallsSvg.getBoundingClientRect();
      const ufBox = unfoldedSvg.getBoundingClientRect();
      const pw = Math.max(1, Math.round(planBox.width)),  ph = Math.max(1, Math.round(planBox.height));
      const tw2 = Math.max(1, Math.round(tileBox.width)), th2 = Math.max(1, Math.round(tileBox.height));
      const ufw = Math.max(1, Math.round(ufBox.width)),   ufh = Math.max(1, Math.round(ufBox.height));

      const r = state.room, t = state.tiles;
      const stats = getExportStatsData();
      const proj = getProjectInfo();
      const ts = new Date().toLocaleString('zh-TW');

      // Match PNG layout tokens
      const PAD = 36, GAP = 28, CARD_PAD = 18, METRIC_GAP = 10;
      const titleH = 32, subH = 18;
      const subtitleH = 16;
      const projLineH = (proj.name || proj.addr) ? 20 : 0;
      const metricRowH = 64;
      const tagH = 22;
      const footerH = 28;

      // 1:2 body layout — plan 1/3, tile 2/3
      const tileTargetW = 720;
      const planTargetW = tileTargetW / 2;
      const planRenderW = planTargetW;
      const planRenderH = ph * (planTargetW / pw);
      const tileRenderW = tileTargetW;
      const tileRenderH = th2 * (tileTargetW / tw2);

      const bodyW = planRenderW + tileRenderW + GAP + CARD_PAD * 4;
      const totalW = bodyW + PAD * 2;
      const innerW = totalW - PAD * 2;
      const headerBlockH = titleH + subtitleH + projLineH + subH + 16;
      const metricBlockH = metricRowH * 2 + METRIC_GAP;
      const cardH = Math.max(planRenderH, tileRenderH) + CARD_PAD * 2;
      const beforeBody = PAD + headerBlockH + 20 + metricBlockH + 24 + tagH + 8;
      const totalH = beforeBody + cardH + 20 + footerH + PAD;

      const ns = 'http://www.w3.org/2000/svg';
      const out = document.createElementNS(ns, 'svg');
      out.setAttribute('xmlns', ns);
      out.setAttribute('width', totalW);
      out.setAttribute('height', totalH);
      out.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);

      // Inject CSS for inner SVG rendering
      const styleEl = document.createElementNS(ns, 'style');
      styleEl.textContent = css;
      out.appendChild(styleEl);

      // Parchment bg
      const bg = document.createElementNS(ns, 'rect');
      bg.setAttribute('x', 0); bg.setAttribute('y', 0);
      bg.setAttribute('width', totalW); bg.setAttribute('height', totalH);
      bg.setAttribute('fill', KAMI.parchment);
      out.appendChild(bg);

      // Primitive helpers
      const mkRect = (x, y, w, h, fill, opts={}) => {
        const e = document.createElementNS(ns, 'rect');
        e.setAttribute('x', x); e.setAttribute('y', y);
        e.setAttribute('width', w); e.setAttribute('height', h);
        if(fill) e.setAttribute('fill', fill);
        if(opts.r != null) { e.setAttribute('rx', opts.r); e.setAttribute('ry', opts.r); }
        if(opts.stroke){ e.setAttribute('stroke', opts.stroke); e.setAttribute('stroke-width', opts.sw||0.5); }
        if(opts.noFill) e.setAttribute('fill', 'none');
        return e;
      };
      const mkText = (x, y, text, fs, color, weight, anchor) => {
        const e = document.createElementNS(ns, 'text');
        e.setAttribute('x', x); e.setAttribute('y', y);
        e.setAttribute('font-family', KAMI.serif);
        e.setAttribute('font-size', fs);
        if(weight) e.setAttribute('font-weight', weight);
        if(anchor) e.setAttribute('text-anchor', anchor);
        e.setAttribute('fill', color);
        e.textContent = text;
        return e;
      };
      const mkLine = (x1, y1, x2, y2, color, sw=0.5) => {
        const e = document.createElementNS(ns, 'line');
        e.setAttribute('x1', x1); e.setAttribute('y1', y1);
        e.setAttribute('x2', x2); e.setAttribute('y2', y2);
        e.setAttribute('stroke', color); e.setAttribute('stroke-width', sw);
        return e;
      };

      // ===== Header =====
      let y = PAD;
      const titleBarH = titleH + subtitleH + projLineH - 4;
      // brand left bar
      out.appendChild(mkRect(PAD, y, 2.5, titleBarH, KAMI.brand, {r:1.2}));
      // title
      out.appendChild(mkText(PAD + 12, y + 22, '浴室磁磚計畫', 24, KAMI.nearBlack, 500));
      // meta date (right)
      out.appendChild(mkText(totalW - PAD, y + 20, ts, 11, KAMI.stone, 400, 'end'));
      y += titleH;

      // subtitle (uppercase eyebrow)
      const subEyebrow = mkText(PAD + 12, y + 12, (proj.sub || 'Tile Layout').toUpperCase(), 10, KAMI.brand, 600);
      subEyebrow.setAttribute('letter-spacing', '1.5');
      out.appendChild(subEyebrow);
      y += subtitleH;

      // project name + address
      if(proj.name || proj.addr){
        let parts = [];
        if(proj.name) parts.push({text: proj.name, color: KAMI.nearBlack, weight: 500, fs: 13});
        if(proj.name && proj.addr) parts.push({text: '  ·  ', color: '#b8b7b0', weight: 400, fs: 13});
        if(proj.addr) parts.push({text: proj.addr, color: KAMI.olive, weight: 400, fs: 12});
        // Compose as single <text> with tspans
        const tEl = document.createElementNS(ns, 'text');
        tEl.setAttribute('x', PAD + 12);
        tEl.setAttribute('y', y + 13);
        tEl.setAttribute('font-family', KAMI.serif);
        for(const p of parts){
          const ts2 = document.createElementNS(ns, 'tspan');
          ts2.setAttribute('font-size', p.fs);
          ts2.setAttribute('font-weight', p.weight);
          ts2.setAttribute('fill', p.color);
          ts2.textContent = p.text;
          tEl.appendChild(ts2);
        }
        out.appendChild(tEl);
        y += projLineH;
      }

      // spec line (warm-gray)
      const spec = `房間 ${r.length}×${r.width} cm  ·  牆高 ${r.wallHeight} cm  ·  安裝高 ${r.installHeight} cm   |   牆磚 ${cmToMm(t.wallW)}×${cmToMm(t.wallH)} mm  ·  地磚 ${cmToMm(t.floorW)}×${cmToMm(t.floorH)} mm  ·  縫 ${t.groutMm} mm`;
      out.appendChild(mkText(PAD + 12, y + 12, spec, 11, KAMI.olive, 400));
      y += subH;

      // hairline
      y += 10;
      out.appendChild(mkLine(PAD, y, totalW - PAD, y, KAMI.sand));
      y += 14;

      // ===== Metric grid =====
      const rowLabelW = 70;
      const cellGap = 8;
      const cellW = (innerW - rowLabelW - cellGap * 4) / 4;

      function drawMetricRow(rowY, rowLabel, data){
        out.appendChild(mkText(PAD, rowY + metricRowH/2 + 4, rowLabel, 12, KAMI.nearBlack, 500));
        const cells = [data.full, data.cut, data.buy, data.area];
        let cx = PAD + rowLabelW;
        for(const c of cells){
          out.appendChild(mkRect(cx, rowY, cellW, metricRowH, KAMI.ivory, {r:6, stroke: KAMI.sand, sw:0.5}));
          out.appendChild(mkText(cx + 12, rowY + 18, c.label, 9, KAMI.olive, 600));
          // value + unit on same line
          const valText = mkText(cx + 12, rowY + 44, c.value, 20, KAMI.brand, 500);
          out.appendChild(valText);
          // unit positioned with offset (estimated width — avoid getBBox since not yet rendered)
          const valWidthEst = String(c.value).length * 12;
          out.appendChild(mkText(cx + 12 + valWidthEst + 5, rowY + 44, c.unit, 10, KAMI.olive, 400));
          cx += cellW + cellGap;
        }
      }
      drawMetricRow(y, '牆面磁磚', stats.wall);
      drawMetricRow(y + metricRowH + METRIC_GAP, '地板磁磚', stats.floor);
      y += metricBlockH + 24;

      // ===== Tags + image cards (architectural style) =====
      const leftX = PAD;
      const leftCardW = planRenderW + CARD_PAD * 2;
      const rightX = leftX + leftCardW + GAP;
      const rightCardW = tileRenderW + CARD_PAD * 2;

      // Architectural tag: thin outline + monospace + drawing number
      function drawTag(x, ty, num, name){
        const txt = `${num} · ${name}`;
        const w = txt.length * 5.4 + 16;
        out.appendChild(mkRect(x, ty, w, tagH, null, {r:0, stroke: KAMI.stone, sw:0.4, noFill:true}));
        // num + name in same <text> with tspans
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', x + 8); t.setAttribute('y', ty + 15);
        t.setAttribute('font-family', KAMI.mono);
        t.setAttribute('font-size', 9);
        const tsNum = document.createElementNS(ns, 'tspan');
        tsNum.setAttribute('font-weight', 600); tsNum.setAttribute('fill', KAMI.brand);
        tsNum.textContent = num;
        const tsName = document.createElementNS(ns, 'tspan');
        tsName.setAttribute('font-weight', 500); tsName.setAttribute('fill', KAMI.darkWarm);
        tsName.textContent = ' · ' + name;
        t.appendChild(tsNum); t.appendChild(tsName);
        out.appendChild(t);
      }
      drawTag(leftX, y, 'A-01', 'PLAN · 平面圖');
      drawTag(rightX, y, 'A-02', 'WALL TILES · 牆面磁磚');
      y += tagH + 8;

      // Image cards — thin architectural outline, no fill
      function clone(src){
        const c = src.cloneNode(true);
        c.querySelectorAll('foreignObject').forEach(fo => fo.remove());
        c.removeAttribute('style');
        return c;
      }
      function drawImageCard(x, w, h, srcSvg, imgW, imgH){
        out.appendChild(mkRect(x, y, w, h, null, {r:0, stroke: KAMI.stone, sw:0.4, noFill:true}));
        const iy = y + (h - imgH) / 2;
        const c = clone(srcSvg);
        c.setAttribute('x', x + CARD_PAD);
        c.setAttribute('y', iy);
        c.setAttribute('width', imgW);
        c.setAttribute('height', imgH);
        c.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        out.appendChild(c);
      }
      drawImageCard(leftX, leftCardW, cardH, planSvg, planRenderW, planRenderH);
      drawImageCard(rightX, rightCardW, cardH, tileSvg, tileRenderW, tileRenderH);
      y += cardH + 16;

      // Footer removed — date already in header right-aligned meta.

      // ===== Page 1 download (layout) =====
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(out);
      const blob = new Blob([xml], {type: 'image/svg+xml;charset=utf-8'});
      downloadBlob(blob, exportFilename('svg', '01_layout'));

      // ===== Page 2: unfolded only =====
      const p2_innerW = totalW - PAD * 2;
      const p2_imgW = p2_innerW - CARD_PAD * 2;
      const p2_imgH = ufh * (p2_imgW / ufw);
      const p2_cardH = p2_imgH + CARD_PAD * 2;
      const p2_totalH = PAD * 2 + tagH + 8 + p2_cardH;

      const out2 = document.createElementNS(ns, 'svg');
      out2.setAttribute('xmlns', ns);
      out2.setAttribute('width', totalW);
      out2.setAttribute('height', p2_totalH);
      out2.setAttribute('viewBox', `0 0 ${totalW} ${p2_totalH}`);

      const styleEl2 = document.createElementNS(ns, 'style');
      styleEl2.textContent = css;
      out2.appendChild(styleEl2);

      const bg2 = document.createElementNS(ns, 'rect');
      bg2.setAttribute('x', 0); bg2.setAttribute('y', 0);
      bg2.setAttribute('width', totalW); bg2.setAttribute('height', p2_totalH);
      bg2.setAttribute('fill', KAMI.parchment);
      out2.appendChild(bg2);

      // tag A-03
      let p2y = PAD;
      const t2_w = 'A-03 · UNFOLDED · 紙盒展開'.length * 5.4 + 16;
      const t2_rect = document.createElementNS(ns, 'rect');
      t2_rect.setAttribute('x', PAD); t2_rect.setAttribute('y', p2y);
      t2_rect.setAttribute('width', t2_w); t2_rect.setAttribute('height', tagH);
      t2_rect.setAttribute('fill', 'none');
      t2_rect.setAttribute('stroke', KAMI.stone); t2_rect.setAttribute('stroke-width', 0.4);
      out2.appendChild(t2_rect);
      const t2 = document.createElementNS(ns, 'text');
      t2.setAttribute('x', PAD + 8); t2.setAttribute('y', p2y + 15);
      t2.setAttribute('font-family', KAMI.mono);
      t2.setAttribute('font-size', 9);
      const t2Num = document.createElementNS(ns, 'tspan');
      t2Num.setAttribute('font-weight', 600); t2Num.setAttribute('fill', KAMI.brand);
      t2Num.textContent = 'A-03';
      const t2Name = document.createElementNS(ns, 'tspan');
      t2Name.setAttribute('font-weight', 500); t2Name.setAttribute('fill', KAMI.darkWarm);
      t2Name.textContent = ' · UNFOLDED · 紙盒展開';
      t2.appendChild(t2Num); t2.appendChild(t2Name);
      out2.appendChild(t2);
      p2y += tagH + 8;

      // image card
      const card2 = document.createElementNS(ns, 'rect');
      card2.setAttribute('x', PAD); card2.setAttribute('y', p2y);
      card2.setAttribute('width', p2_innerW); card2.setAttribute('height', p2_cardH);
      card2.setAttribute('fill', 'none');
      card2.setAttribute('stroke', KAMI.stone); card2.setAttribute('stroke-width', 0.4);
      out2.appendChild(card2);

      const ufClone = unfoldedSvg.cloneNode(true);
      ufClone.querySelectorAll('foreignObject').forEach(fo => fo.remove());
      ufClone.removeAttribute('style');
      ufClone.setAttribute('x', PAD + CARD_PAD);
      ufClone.setAttribute('y', p2y + CARD_PAD);
      ufClone.setAttribute('width', p2_imgW);
      ufClone.setAttribute('height', p2_imgH);
      ufClone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      out2.appendChild(ufClone);

      const xml2 = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(out2);
      const blob2 = new Blob([xml2], {type: 'image/svg+xml;charset=utf-8'});
      downloadBlob(blob2, exportFilename('svg', '02_unfolded'));
    });
  } catch(e){
    alert('匯出 SVG 失敗:' + (e.message || e));
    console.error('exportSVG error:', e);
  } finally {
    if(btn){ btn.textContent = oldText; btn.disabled = false; }
  }
}

async function exportPDF(){
  const btn = $('ex-pdf');
  const oldText = btn ? btn.textContent : '';
  if(btn){ btn.textContent = '準備中…'; btn.disabled = true; }
  let container = null;
  const oldTitle = document.title;
  // Browsers seed the print dialog's filename from document.title — sync with exportFilename.
  document.title = exportFilename('').replace(/\.$/, '');
  try {
    await withExportContext(async () => {
      const r = state.room;
      const t = state.tiles;
      const planSrc = $('canvas');
      const wallsSrc = $('tile-walls');
      const unfoldedSrc = $('tile-unfolded');

      container = document.createElement('div');
      container.id = 'print-area';
      const ts = new Date().toLocaleString('zh-TW');
      const stats = getExportStatsData();
      const mat = state.materials || {};
      const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const cellHtml = c => `<div class="cell"><div class="lbl">${esc(c.label)}</div><div class="val">${esc(c.value)}<span class="unit">${esc(c.unit)}</span></div></div>`;
      const rowCells = row => `${cellHtml(row.full)}${cellHtml(row.cut)}${cellHtml(row.buy)}${cellHtml(row.area)}`;
      const proj = getProjectInfo();
      const specHtml = `${r.length}×${r.width}&thinsp;cm · 周長&thinsp;${2*(r.length+r.width)}&thinsp;cm · 牆高&thinsp;${r.wallHeight}&thinsp;cm · 鋪磚高&thinsp;${r.installHeight}&thinsp;cm${mat.location ? '　|　' + esc(mat.location) : ''}　|　牆磚&thinsp;${cmToMm(t.wallW)}×${cmToMm(t.wallH)}&thinsp;mm&thinsp;縫&thinsp;${t.groutWallMm||t.groutMm||3}&thinsp;mm · 地磚&thinsp;${cmToMm(t.floorW)}×${cmToMm(t.floorH)}&thinsp;mm&thinsp;縫&thinsp;${t.groutFloorMm||t.groutMm||3}&thinsp;mm`;
      const projHtml = (proj.name || proj.addr)
        ? `<p class="proj-line">${proj.name ? `<span class="proj-name">${esc(proj.name)}</span>` : ''}${proj.name && proj.addr ? '<span class="sep"> · </span>' : ''}${proj.addr ? `<span class="proj-addr">${esc(proj.addr)}</span>` : ''}</p>`
        : '';
      const headerHtml = `
        <div class="print-header">
          <div class="title-wrap">
            <h1>浴室磁磚計畫</h1>
            <p class="subtitle">${esc(proj.sub || 'Tile Layout')}</p>
            ${projHtml}
            <p class="spec">${specHtml}</p>
          </div>
          <p class="print-meta">${esc(ts)}</p>
        </div>
        <hr class="kami-rule">`;
      const footerHtml = '';

      // ── Shared data ────────────────────────────────────────────────────
      const H2  = r.installHeight;
      const STRIP2 = state.trimStripLen || 240;
      const perimeter2 = 2 * (r.length + r.width);
      const wins2   = (state.openings || []).filter(o => o.type === 'window');
      const shafts2 = state.shafts || [];
      const hasThr2 = !!state.threshold;
      const esc2 = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

      // Trim totals (compact summary)
      let trimTotal2 = 0, trimParts2 = [];
      for(const w of wins2){
        const qty = Math.ceil((w.width*2 + w.height*2) / STRIP2);
        trimTotal2 += qty;
        trimParts2.push(`窗${w.wall} ${qty}條`);
      }
      for(const s of shafts2){
        const qty = Math.ceil(shaftExposedCorners(s) * H2 / STRIP2);
        trimTotal2 += qty;
        trimParts2.push(`管道間${s.wall} ${qty}條`);
      }
      let thrSummary = '';
      if(hasThr2){
        const thr = state.threshold;
        const thrLen2 = thr.axis==='y' ? r.width : r.length;
        const qty = Math.ceil(thr.width / STRIP2) || 1;
        thrSummary = `門檻 ${thr.width}×${thrLen2}cm × ${qty}條`;
      }

      // Row builder: label+model | full | cut | buy | area
      const mk = (label, model, full, cut, buy, buyUnit, area, groutModel) => {
        const modelTxt  = model      ? `<span class="pm-model">${esc2(model)}</span>`      : '';
        const groutTxt2 = groutModel ? `<span class="pm-grout">填縫劑&thinsp;${esc2(groutModel)}</span>` : '';
        return `<tr class="pm-row">
          <td class="pm-item">${esc2(label)}${modelTxt}${groutTxt2}</td>
          <td class="pm-num">${full}<span class="pm-unit">片</span></td>
          <td class="pm-num">${cut}<span class="pm-unit">片</span></td>
          <td class="pm-num pm-buy">${buy}<span class="pm-unit">${esc2(buyUnit)}</span></td>
          <td class="pm-num">${area}<span class="pm-unit">m²</span></td>
        </tr>`;
      };

      // Trim + threshold summary row (grout now shown inline in tile rows above)
      const trimTxt   = trimTotal2 > 0
        ? `收邊條&nbsp;<strong>${trimTotal2}&thinsp;條</strong>&nbsp;<span class="pm-muted">(${trimParts2.join('、')}，每條${STRIP2}cm)</span>`
        : '';
      const thrTxt    = thrSummary ? `${esc2(thrSummary)}` : '';
      const auxLine   = [trimTxt, thrTxt].filter(Boolean).join('　|　');

      // Compact spec for page 2 header
      const specLine2 = `${r.length}×${r.width}cm · 周長${perimeter2}cm · 牆高${r.wallHeight}cm · 鋪磚高${H2}cm`;

      // ── Page 1: Header + Stats + Plan + Wall tiles ────────────────────
      container.innerHTML = `
        <div class="print-page">
          ${headerHtml}
          <table class="pm-tbl">
            <thead><tr>
              <th class="pm-item">項目</th>
              <th class="pm-num">全片</th>
              <th class="pm-num">裁切</th>
              <th class="pm-num pm-buy">估購</th>
              <th class="pm-num">鋪貼面積</th>
            </tr></thead>
            <tbody>
              ${mk('牆磚', mat.wallTileModel, stats.wall.full.value, stats.wall.cut.value, stats.wall.buy.value, stats.wall.buy.unit, stats.wall.area.value, mat.groutWallModel)}
              ${mk('地磚', mat.floorTileModel, stats.floor.full.value, stats.floor.cut.value, stats.floor.buy.value, stats.floor.buy.unit, stats.floor.area.value, mat.groutFloorModel)}
              ${auxLine ? `<tr class="pm-aux"><td colspan="5">${auxLine}</td></tr>` : ''}
            </tbody>
          </table>
          <div class="print-body">
            <div class="print-section" data-slot="plan-1">
              <span class="tag"><span class="num">A-01</span> · Plan</span>
            </div>
            <div class="print-section" data-slot="walls">
              <span class="tag"><span class="num">A-02</span> · Wall Tiles</span>
            </div>
          </div>
        </div>

        <div class="print-page print-page--full">
          <div class="print-page2-header">
            <span class="p2-title">紙盒展開</span>
            <span class="p2-spec">${specLine2}</span>
            <span class="p2-meta">${esc(ts)}</span>
          </div>
          <div class="print-body">
            <div class="print-section" data-slot="unfolded">
              <span class="tag"><span class="num">A-03</span> · Unfolded</span>
            </div>
          </div>
        </div>
      `;

      // Clone source SVGs (need 2× plan, 1× walls, 1× unfolded)
      const cloneClean = src => {
        const c = src.cloneNode(true);
        c.querySelectorAll('foreignObject').forEach(fo => fo.remove());
        c.removeAttribute('style');
        c.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        return c;
      };
      container.querySelector('[data-slot="plan-1"]').appendChild(cloneClean(planSrc));
      container.querySelector('[data-slot="walls"]').appendChild(cloneClean(wallsSrc));
      container.querySelector('[data-slot="unfolded"]').appendChild(cloneClean(unfoldedSrc));

      document.body.appendChild(container);

      // Trigger print and wait for dialog to close (or be cancelled)
      await new Promise(resolve => {
        let done = false;
        const finish = () => {
          if(done) return;
          done = true;
          window.removeEventListener('afterprint', finish);
          resolve();
        };
        window.addEventListener('afterprint', finish);
        // Safety timeout if afterprint doesn't fire (rare)
        setTimeout(finish, 60000);
        try { window.print(); }
        catch(e) { finish(); throw e; }
      });
    });
  } catch(e){
    alert('匯出 PDF 失敗:' + (e.message || e));
    console.error('exportPDF error:', e);
  } finally {
    if(container) container.remove();
    if(btn){ btn.textContent = oldText; btn.disabled = false; }
    document.title = oldTitle;
  }
}

if($('ex-pdf')) $('ex-pdf').addEventListener('click', () => { gcEvent('export-pdf', 'PDF Export'); exportPDF(); });
if($('ex-png')) $('ex-png').addEventListener('click', () => { gcEvent('export-png', 'PNG Export'); exportPNG(); });
if($('ex-svg')) $('ex-svg').addEventListener('click', () => { gcEvent('export-svg', 'SVG Export'); exportSVG(); });


document.querySelectorAll('#seg-cut button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#seg-cut button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.tiles.cuttingMode = b.dataset.cut;
    render();
  });
});
