const sizes = [100, 250, 500, 1000, 2500, 5000, 10000];
const points = [];
const refreshMs = 20000;
const historyKey = 'cryptoBotDashboardHistoryV1';
const historyWindowMs = 24 * 60 * 60 * 1000;
const maxPoints = 4500;

let seconds = 20;
let busy = false;
let scoutBusy = false;

const el = (id) => document.getElementById(id);

function money(value, digits = 4) {
  const n = Number(value);
  return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(digits);
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(historyKey);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    const cutoff = Date.now() - historyWindowMs;

    if (!Array.isArray(parsed)) return;

    const clean = parsed.filter((point) =>
      point &&
      Number.isFinite(point.t) &&
      Number.isFinite(point.net) &&
      Number.isFinite(point.price) &&
      point.t >= cutoff
    );

    points.push(...clean.slice(-maxPoints));
  } catch (error) {
    console.warn('Could not restore local chart history', error);
  }
}

function saveHistory() {
  try {
    const cutoff = Date.now() - historyWindowMs;

    while (points.length && points[0].t < cutoff) {
      points.shift();
    }

    if (points.length > maxPoints) {
      points.splice(0, points.length - maxPoints);
    }

    localStorage.setItem(historyKey, JSON.stringify(points));
  } catch (error) {
    console.warn('Could not save local chart history', error);
  }
}

function canvasSetup(id) {
  const canvas = el(id);
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = Math.max(1, rect.width * dpr);
  canvas.height = Math.max(1, rect.height * dpr);

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  return {
    ctx,
    w: rect.width,
    h: rect.height,
    padL: 52,
    padR: 18,
    padT: 22,
    padB: 34,
  };
}

function drawGrid(ctx, w, h, padL, padR, padT, padB) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#173448';
  ctx.lineWidth = 1;

  for (let i = 0; i < 5; i += 1) {
    const y = padT + (i * (h - padT - padB)) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }
}

function timeLabel(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function drawProfit() {
  const s = canvasSetup('profitChart');
  drawGrid(s.ctx, s.w, s.h, s.padL, s.padR, s.padT, s.padB);

  if (points.length < 2) {
    s.ctx.fillStyle = '#8eabc0';
    s.ctx.font = '13px Arial';
    s.ctx.fillText('Profit line will build as new scans arrive…', s.padL, 48);
    return;
  }

  const nets = points.map((point) => point.net);
  let min = Math.min(...nets, 0);
  let max = Math.max(...nets, 0);

  const margin = Math.max(0.05, (max - min) * 0.15);
  min -= margin;
  max += margin;

  const x = (i) =>
    s.padL + (i / (points.length - 1)) * (s.w - s.padL - s.padR);

  const y = (value) =>
    s.h -
    s.padB -
    ((value - min) / (max - min)) * (s.h - s.padT - s.padB);

  const zeroY = y(0);

  s.ctx.save();
  s.ctx.setLineDash([6, 5]);
  s.ctx.strokeStyle = '#b8c1c8';
  s.ctx.lineWidth = 1.3;
  s.ctx.beginPath();
  s.ctx.moveTo(s.padL, zeroY);
  s.ctx.lineTo(s.w - s.padR, zeroY);
  s.ctx.stroke();
  s.ctx.restore();

  s.ctx.fillStyle = '#9fb1be';
  s.ctx.font = '11px Arial';
  s.ctx.fillText('$0.00', 6, zeroY + 4);

  s.ctx.strokeStyle = '#258cff';
  s.ctx.lineWidth = 3;
  s.ctx.beginPath();

  points.forEach((point, i) => {
    if (i === 0) s.ctx.moveTo(x(i), y(point.net));
    else s.ctx.lineTo(x(i), y(point.net));
  });

  s.ctx.stroke();

  points.forEach((point, i) => {
    if (point.net >= 0) {
      s.ctx.fillStyle = '#20d990';
      s.ctx.beginPath();
      s.ctx.arc(x(i), y(point.net), 4, 0, Math.PI * 2);
      s.ctx.fill();
    }
  });

  const last = points[points.length - 1];
  s.ctx.fillStyle = last.net >= 0 ? '#20d990' : '#258cff';
  s.ctx.beginPath();
  s.ctx.arc(x(points.length - 1), y(last.net), 5, 0, Math.PI * 2);
  s.ctx.fill();

  s.ctx.fillStyle = '#8eabc0';
  s.ctx.fillText(timeLabel(points[0].t), s.padL, s.h - 10);

  const rightLabel = timeLabel(last.t);
  s.ctx.fillText(
    rightLabel,
    s.w - s.padR - s.ctx.measureText(rightLabel).width,
    s.h - 10
  );
}

function drawPrice() {
  const s = canvasSetup('priceChart');
  drawGrid(s.ctx, s.w, s.h, s.padL, s.padR, s.padT, s.padB);

  if (points.length < 2) {
    s.ctx.fillStyle = '#8eabc0';
    s.ctx.font = '13px Arial';
    s.ctx.fillText('WETH price line will build as new scans arrive…', s.padL, 48);
    return;
  }

  const prices = points.map((point) => point.price);
  let min = Math.min(...prices);
  let max = Math.max(...prices);

  const margin = Math.max(1, (max - min) * 0.18);
  min -= margin;
  max += margin;

  const x = (i) =>
    s.padL + (i / (points.length - 1)) * (s.w - s.padL - s.padR);

  const y = (value) =>
    s.h -
    s.padB -
    ((value - min) / (max - min)) * (s.h - s.padT - s.padB);

  s.ctx.strokeStyle = '#20d990';
  s.ctx.lineWidth = 2.5;
  s.ctx.beginPath();

  points.forEach((point, i) => {
    if (i === 0) s.ctx.moveTo(x(i), y(point.price));
    else s.ctx.lineTo(x(i), y(point.price));
  });

  s.ctx.stroke();

  const last = points[points.length - 1];
  s.ctx.fillStyle = '#20d990';
  s.ctx.beginPath();
  s.ctx.arc(x(points.length - 1), y(last.price), 4.5, 0, Math.PI * 2);
  s.ctx.fill();

  s.ctx.fillStyle = '#8eabc0';
  s.ctx.font = '11px Arial';
  s.ctx.fillText(timeLabel(points[0].t), s.padL, s.h - 10);

  const rightLabel = timeLabel(last.t);
  s.ctx.fillText(
    rightLabel,
    s.w - s.padR - s.ctx.measureText(rightLabel).width,
    s.h - 10
  );
}

function drawCharts() {
  drawProfit();
  drawPrice();
}

function renderMatrix(scan) {
  const matrix = el('matrix');
  const routes = [
    'Aerodrome → Uniswap v3',
    'Uniswap v3 → Aerodrome',
  ];

  const getCell = (route, size) => {
    const row = scan.rows.find(
      (item) => item.route === route && item.startUsdc === size
    );

    if (!row) {
      return { text: '—', cls: '' };
    }

    const value = row.estimatedNetUsdc;
    const cls = value >= 0 ? 'pos' : value >= -1 ? 'near' : 'neg';

    return {
      text: money(value, 3),
      cls,
    };
  };

  let desktop =
    '<div class="matrixDesktop">' +
    '<div class="mlabel">Route</div>';

  for (const size of sizes) {
    desktop +=
      '<div class="mhead">' +
      '$' +
      size.toLocaleString() +
      '</div>';
  }

  for (const route of routes) {
    desktop +=
      '<div class="mlabel">' +
      route.replace(' v3', '') +
      '</div>';

    for (const size of sizes) {
      const cell = getCell(route, size);
      desktop +=
        '<div class="cell ' +
        cell.cls +
        '">' +
        cell.text +
        '</div>';
    }
  }

  desktop += '</div>';

  let mobile =
    '<div class="matrixMobile" aria-label="Trade size by route">' +
    '<div class="mobileHead">Size</div>' +
    '<div class="mobileHead">Aero → Uni</div>' +
    '<div class="mobileHead">Uni → Aero</div>';

  for (const size of sizes) {
    const aeroToUni = getCell(routes[0], size);
    const uniToAero = getCell(routes[1], size);

    mobile +=
      '<div class="mobileSize">' +
      '$' +
      size.toLocaleString() +
      '</div>' +
      '<div class="cell ' +
      aeroToUni.cls +
      '">' +
      aeroToUni.text +
      '</div>' +
      '<div class="cell ' +
      uniToAero.cls +
      '">' +
      uniToAero.text +
      '</div>';
  }

  mobile += '</div>';
  matrix.innerHTML = desktop + mobile;
}

function updateHistoryLabels() {
  if (!points.length) {
    setText('priceRange', '24h browser range: —');
    setText('obs', 'Observations: 0 • saved locally');
    return;
  }

  const prices = points.map((point) => point.price);

  setText(
    'priceRange',
    '24h browser range: $' +
      Math.min(...prices).toFixed(2) +
      ' – $' +
      Math.max(...prices).toFixed(2)
  );

  setText('obs', 'Observations: ' + points.length + ' • saved locally');
}

function compactUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return '$' + new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

function renderScoutList(items) {
  const list = el('scoutList');
  if (!list) return;
  list.replaceChildren();

  if (!Array.isArray(items) || items.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No eligible cross-DEX comparisons available right now.';
    list.appendChild(p);
    return;
  }

  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'scoutRow';

    const rank = document.createElement('span');
    rank.className = 'scoutRank';
    rank.textContent = '#' + (index + 1);

    const route = document.createElement('span');
    route.className = 'scoutRoute';
    route.textContent = item.buyDex + ' → ' + item.sellDex;

    const spread = document.createElement('strong');
    spread.textContent = Number(item.indicatedSpreadBps).toFixed(2) + ' bps';

    const status = document.createElement('span');
    status.className = 'pill ' + (item.status === 'SHORTLIST' ? 'candidate' : 'watch');
    status.textContent = item.status;

    row.append(rank, route, spread, status);
    list.appendChild(row);
  });
}

async function refreshScout() {
  if (scoutBusy) return;
  scoutBusy = true;

  try {
    const response = await fetch('/api/scout?t=' + Date.now(), {
      cache: 'no-store',
    });
    const scout = await response.json();

    if (!response.ok || !scout.ok) {
      throw new Error(scout.error || 'Opportunity scout failed');
    }

    const best = scout.best;
    setText('scoutPools', scout.eligiblePoolCount);
    setText('scoutUpdated', new Date(scout.generatedAt).toLocaleTimeString());

    if (best) {
      setText('scoutBestRoute', best.buyDex + ' → ' + best.sellDex);
      setText('scoutSpread', Number(best.indicatedSpreadBps).toFixed(2) + ' bps');
      setText('scoutLiquidity', compactUsd(best.minLiquidityUsd));
      setText('scoutVolume', compactUsd(best.minVolume24hUsd));
      setText('scoutStatus', best.status);
      el('scoutStatus').className =
        'pill ' + (best.status === 'SHORTLIST' ? 'candidate' : 'watch');
    } else {
      setText('scoutBestRoute', 'No cross-DEX lead');
      setText('scoutSpread', '—');
      setText('scoutLiquidity', '—');
      setText('scoutVolume', '—');
      setText('scoutStatus', 'NO LEAD');
      el('scoutStatus').className = 'pill watch';
    }

    renderScoutList(scout.opportunities);
  } catch (error) {
    setText('scoutStatus', 'SCOUT ERROR');
    const status = el('scoutStatus');
    if (status) status.className = 'pill reject';
    const list = el('scoutList');
    if (list) {
      list.replaceChildren();
      const p = document.createElement('p');
      p.textContent =
        'Scout unavailable: ' +
        (error instanceof Error ? error.message : String(error));
      list.appendChild(p);
    }
  } finally {
    scoutBusy = false;
  }
}

async function refresh() {
  if (busy) return;

  busy = true;
  el('scanBtn').disabled = true;
  el('scanBtn').textContent = 'Scanning…';

  try {
    const response = await fetch('/api/scan?t=' + Date.now(), {
      cache: 'no-store',
    });

    const scan = await response.json();

    if (!response.ok || !scan.ok) {
      throw new Error(scan.error || 'Live scan failed');
    }

    el('error').style.display = 'none';

    setText('block', 'Block ' + scan.blockNumber);
    setText('candidates', scan.candidateCount);
    setText('matrixCount', scan.matrixComplete + '/14');
    setText('premium', scan.flashLoanPremiumBps + ' bps');
    setText(
      'premiumPct',
      '(' + (scan.flashLoanPremiumBps / 100).toFixed(2) + '%)'
    );
    setText('gas', scan.gasPriceGwei.toFixed(4) + ' gwei');

    setText('bestRoute', scan.best.route);
    setText('bestSize', '$' + scan.best.startUsdc.toLocaleString());
    setText('bestNet', money(scan.best.estimatedNetUsdc, 6));

    el('bestNet').className =
      scan.best.estimatedNetUsdc >= 0 ? 'green' : 'red';

    setText('decision', scan.best.decision);

    el('decision').className =
      'pill ' + (scan.best.decision === 'CANDIDATE' ? 'candidate' : 'reject');

    setText('wethPrice', '$' + scan.wethReferencePrice.toFixed(2));

    el('candidateAlert').className =
      'candidateAlert' + (scan.candidateCount > 0 ? ' show' : '');

    points.push({
      t: Date.now(),
      net: scan.best.estimatedNetUsdc,
      price: scan.wethReferencePrice,
    });

    saveHistory();

    const previous = points[points.length - 2];
    const current = points[points.length - 1];

    if (previous) {
      const netChange = current.net - previous.net;

      el('delta').className = 'delta ' + (netChange >= 0 ? 'good' : 'bad');

      setText(
        'delta',
        (netChange >= 0 ? '▲ ' : '▼ ') +
          money(Math.abs(netChange), 4) +
          ' since prior refresh'
      );

      const priceChange = current.price - previous.price;

      el('priceMove').className =
        'delta ' + (priceChange >= 0 ? 'good' : 'bad');

      setText(
        'priceMove',
        (priceChange >= 0 ? '▲ ' : '▼ ') +
          '$' +
          Math.abs(priceChange).toFixed(2) +
          ' since prior refresh'
      );
    }

    updateHistoryLabels();
    renderMatrix(scan);
    drawCharts();

    const timestamp = new Date(scan.generatedAt).toLocaleTimeString();

    el('feed').innerHTML =
      '<p><time>' +
      timestamp +
      '</time>14-route live scan complete</p>' +
      '<p><time>' +
      timestamp +
      '</time>candidate count: ' +
      scan.candidateCount +
      '</p>' +
      '<p><time>' +
      timestamp +
      '</time>no wallet / no signing / no transaction</p>';

    seconds = 20;
  } catch (error) {
    el('error').style.display = 'block';
    el('error').textContent =
      'Live scan error: ' +
      (error instanceof Error ? error.message : String(error));
  } finally {
    busy = false;
    el('scanBtn').disabled = false;
    el('scanBtn').textContent = 'Scan now';
  }
}

el('scanBtn').addEventListener('click', refresh);
window.addEventListener('resize', drawCharts);

loadHistory();

if (points.length) {
  updateHistoryLabels();
  drawCharts();
}

refresh();
refreshScout();

setInterval(refresh, refreshMs);
setInterval(refreshScout, 60000);

setInterval(() => {
  seconds = seconds <= 1 ? 20 : seconds - 1;
  setText('countdown', 'Refresh in ' + seconds + 's');
}, 1000);
