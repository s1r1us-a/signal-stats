// ============ CHARTS (Chart.js, theme-aware Apple palette) ============

// Signal-blaue Apple-Palette (Reihenfolge = Kategorie-Reihenfolge)
const PALETTE = ['#007aff', '#5e5ce6', '#34c0eb', '#bf5af2', '#ff375f', '#ff9f0a', '#30d158', '#ffd60a'];

// Liest die aktuellen Theme-Farben aus den CSS-Variablen (passt sich Light/Dark an).
function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  return {
    grid:    v('--chart-grid'),
    text:    v('--text-faint'),
    textDim: v('--text-dim'),
    card:    v('--bg-soft') || v('--bg'),
    bg:      v('--bg'),
    blue:    v('--blue') || '#007aff',
    font:    v('--font'),
  };
}

// Chart.js-Defaults an das aktuelle Theme angleichen (bei Load + Theme-Wechsel aufrufen).
function applyChartDefaults() {
  if (typeof Chart === 'undefined') return;   // CDN nicht geladen -> stillschweigend überspringen
  const tc = themeColors();
  if (tc.font) Chart.defaults.font.family = tc.font;
  Chart.defaults.color = tc.text || '#8a8a8e';
  Chart.defaults.borderColor = tc.grid || 'rgba(0,0,0,.07)';
}
applyChartDefaults();

// hex (#rrggbb) -> rgba mit Alpha
function withAlpha(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function chartGrad(ctx, from, to) {
  const g = ctx.createLinearGradient(0, 0, 0, 260);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}

let chartRegistry = [];
function destroyCharts() {
  if (!chartRegistry.length) return;
  chartRegistry.forEach(c => { try { c.destroy(); } catch(e){} });
  chartRegistry = [];
}
document.getElementById('nav-dashboard').addEventListener('click', destroyCharts);
document.getElementById('chat-list').addEventListener('click', e => {
  if (e.target.closest('.chat-item')) destroyCharts();
});

function renderChatTypesChart(s) {
  const ctx = document.getElementById('chart-chat-types');
  if (!ctx || typeof Chart === 'undefined') return;
  const tc = themeColors();
  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['1:1 Chats', 'Gruppen', 'Andere'],
      datasets: [{
        data: [s.chatTypeCount.contact, s.chatTypeCount.group, s.chatTypeCount.other],
        backgroundColor: [PALETTE[0], PALETTE[1], PALETTE[2]],
        borderColor: tc.card,
        borderWidth: 3,
        hoverOffset: 10,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, pointStyle: 'circle' } }
      }
    }
  });
  chartRegistry.push(chart);
}

function renderMediaMixChart(s, canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return;
  const tc = themeColors();
  const labels = ['Text', 'Bilder', 'GIFs', 'Videos', 'Sprachnachr.', 'Audio-Datei', 'Sticker', 'Dateien'];
  const data = [
    s.pureTextCount || 0,
    s.mediaCounts.image, s.mediaCounts.gif, s.mediaCounts.video,
    s.mediaCounts.voice, s.mediaCounts.audio, s.mediaCounts.sticker, s.mediaCounts.file,
  ];
  const colors = PALETTE;
  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: tc.card, borderWidth: 2, hoverOffset: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: { position: 'bottom', labels: { padding: 10, boxWidth: 10, font: { size: 11 } } } }
    }
  });
  chartRegistry.push(chart);
}

function renderMonthlyChart(s, canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return;
  const tc = themeColors();
  const accent = PALETTE[0];
  const sorted = [...s.byMonth.entries()].sort((a,b) => a[0].localeCompare(b[0]));
  const labels = sorted.map(([m]) => {
    const [y, mo] = m.split('-');
    const monthNames = ['Jan','Feb','Mrz','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    return `${monthNames[parseInt(mo)-1]} ${y.slice(2)}`;
  });
  const data = sorted.map(([,c]) => c);

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Nachrichten',
        data,
        borderColor: accent,
        backgroundColor: (ctx) => {
          const {ctx: c, chartArea} = ctx.chart;
          if (!chartArea) return withAlpha(accent, 0.3);
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, withAlpha(accent, 0.35));
          g.addColorStop(1, withAlpha(accent, 0.01));
          return g;
        },
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: tc.card,
        pointHoverBorderColor: accent,
        pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { beginAtZero: true, grid: { color: tc.grid }, ticks: { precision: 0 } }
      },
      plugins: { legend: { display: false } }
    }
  });
  chartRegistry.push(chart);
}

function renderHourlyChart(s, canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return;
  const tc = themeColors();
  const chart = new Chart(ctx, {
    type: 'polarArea',
    data: {
      labels: Array.from({length:24}, (_,i) => `${i}:00`),
      datasets: [{
        data: s.byHour,
        // Blau -> Teal Verlauf über den Tag
        backgroundColor: Array.from({length:24}, (_, i) => {
          const t = i / 23;
          const hue = 212 + t * 30;          // 212 (Blau) -> ~242 (Indigo/Teal-Bereich)
          return `hsla(${hue}, 90%, ${58 - t * 6}%, 0.72)`;
        }),
        borderColor: tc.card,
        borderWidth: 1,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: {
          grid: { color: tc.grid },
          angleLines: { color: tc.grid },
          ticks: { display: false },
          pointLabels: { display: true, font: { size: 10 } }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
  chartRegistry.push(chart);
}

function renderWeekdayChart(s, canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return;
  const tc = themeColors();
  const labels = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: s.byWeekday,
        // Werktage blau, Wochenende teal
        backgroundColor: labels.map((_, i) => i >= 5 ? withAlpha(PALETTE[2], 0.75) : withAlpha(PALETTE[0], 0.75)),
        borderColor: labels.map((_, i) => i >= 5 ? PALETTE[2] : PALETTE[0]),
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: tc.grid }, ticks: { precision: 0 } }
      },
      plugins: { legend: { display: false } }
    }
  });
  chartRegistry.push(chart);
}
