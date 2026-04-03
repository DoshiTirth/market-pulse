// ============================================
// InteractiveChart — Rich stock chart component
// Crosshair, OHLCV tooltips, SMA overlays,
// timeframe selector, volume bars
// ============================================

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Filler, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

// ---- Crosshair plugin ----
const crosshairPlugin = {
  id: 'crosshair',
  afterDraw(chart) {
    const { ctx, tooltip, chartArea: { left, right, top, bottom } } = chart;
    if (!tooltip || !tooltip.caretX) return;

    const x = tooltip.caretX;
    const y = tooltip.caretY;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();

    ctx.restore();
  }
};

ChartJS.register(crosshairPlugin);

// ---- SMA calculation ----
function calcSMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      result.push(parseFloat((slice.reduce((a, b) => a + b, 0) / period).toFixed(2)));
    }
  }
  return result;
}

// ---- Timeframe configs ----
const TIMEFRAMES = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: 'ALL', days: 999 },
];

export default function InteractiveChart({ stockData, symbol, quote }) {
  const [timeframe, setTimeframe] = useState('3M');
  const [showSMA20, setShowSMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(false);
  const [hoveredData, setHoveredData] = useState(null);
  const chartRef = useRef(null);

  // Filter data by timeframe
  const filteredData = useMemo(() => {
    if (!stockData || stockData.length === 0) return [];
    const tf = TIMEFRAMES.find(t => t.label === timeframe);
    const days = tf?.days || 90;
    return stockData.slice(-Math.min(days, stockData.length));
  }, [stockData, timeframe]);

  const closes = useMemo(() => filteredData.map(d => d.close), [filteredData]);
  const sma20 = useMemo(() => showSMA20 ? calcSMA(closes, 20) : [], [closes, showSMA20]);
  const sma50 = useMemo(() => showSMA50 ? calcSMA(closes, 50) : [], [closes, showSMA50]);

  // Determine up/down colors for volume
  const volumeColors = useMemo(() => {
    return filteredData.map((d, i) => {
      if (i === 0) return 'rgba(100,116,139,0.3)';
      return d.close >= filteredData[i - 1].close
        ? 'rgba(34, 197, 94, 0.4)'
        : 'rgba(239, 68, 68, 0.4)';
    });
  }, [filteredData]);

  // Last data point for the header
  const lastBar = filteredData[filteredData.length - 1];
  const prevBar = filteredData.length > 1 ? filteredData[filteredData.length - 2] : null;
  const dayChange = lastBar && prevBar ? lastBar.close - prevBar.close : 0;
  const dayChangePct = prevBar ? (dayChange / prevBar.close * 100) : 0;

  // Display data (hovered or latest)
  const displayBar = hoveredData || lastBar;

  // ---- Price chart config ----
  const priceChartData = {
    labels: filteredData.map(d => d.date?.slice(5) || ''),
    datasets: [
      {
        label: symbol,
        data: closes,
        borderColor: dayChange >= 0 ? '#22c55e' : '#ef4444',
        borderWidth: 2,
        fill: true,
        backgroundColor: (ctx) => {
          if (!ctx.chart?.ctx) return 'transparent';
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 300);
          if (dayChange >= 0) {
            g.addColorStop(0, 'rgba(34, 197, 94, 0.15)');
            g.addColorStop(1, 'rgba(34, 197, 94, 0)');
          } else {
            g.addColorStop(0, 'rgba(239, 68, 68, 0.15)');
            g.addColorStop(1, 'rgba(239, 68, 68, 0)');
          }
          return g;
        },
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: dayChange >= 0 ? '#22c55e' : '#ef4444',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        tension: 0.3,
        order: 3
      },
      // SMA 20
      ...(showSMA20 ? [{
        label: 'SMA 20',
        data: sma20,
        borderColor: '#f59e0b',
        borderWidth: 1.5,
        borderDash: [6, 3],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0.3,
        order: 2
      }] : []),
      // SMA 50
      ...(showSMA50 ? [{
        label: 'SMA 50',
        data: sma50,
        borderColor: '#a78bfa',
        borderWidth: 1.5,
        borderDash: [6, 3],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0.3,
        order: 1
      }] : [])
    ]
  };

  const priceChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: '#141820',
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        borderColor: '#2a3444',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
        titleFont: { family: 'JetBrains Mono', size: 11 },
        bodyFont: { family: 'DM Sans', size: 12 },
        callbacks: {
          title: (items) => {
            const idx = items[0]?.dataIndex;
            const bar = filteredData[idx];
            return bar ? bar.date : '';
          },
          label: () => '',
          afterBody: (items) => {
            const idx = items[0]?.dataIndex;
            const bar = filteredData[idx];
            if (!bar) return '';

            const prev = idx > 0 ? filteredData[idx - 1] : null;
            const chg = prev ? (bar.close - prev.close) : 0;
            const chgPct = prev ? ((chg / prev.close) * 100) : 0;

            const lines = [
              `Open:   $${bar.open.toFixed(2)}`,
              `High:   $${bar.high.toFixed(2)}`,
              `Low:    $${bar.low.toFixed(2)}`,
              `Close:  $${bar.close.toFixed(2)}`,
              `Vol:    ${(bar.volume / 1e6).toFixed(1)}M`,
              `Chg:    ${chg >= 0 ? '+' : ''}$${chg.toFixed(2)} (${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%)`
            ];

            if (showSMA20 && sma20[idx]) {
              lines.push(`SMA20:  $${sma20[idx].toFixed(2)}`);
            }
            if (showSMA50 && sma50[idx]) {
              lines.push(`SMA50:  $${sma50[idx].toFixed(2)}`);
            }

            return lines;
          }
        },
        // Update hovered data for the header
        external: (context) => {
          const idx = context.tooltip?.dataPoints?.[0]?.dataIndex;
          if (idx != null && filteredData[idx]) {
            setHoveredData(filteredData[idx]);
          }
        }
      }
    },
    scales: {
      x: {
        ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.03)' }
      },
      y: {
        position: 'right',
        ticks: {
          color: '#64748b',
          font: { family: 'JetBrains Mono', size: 10 },
          callback: v => '$' + v.toFixed(0)
        },
        grid: { color: 'rgba(255,255,255,0.03)' }
      }
    },
    onHover: (event, elements, chart) => {
      if (!elements.length) setHoveredData(null);
    }
  };

  // ---- Volume chart ----
  const volumeChartData = {
    labels: filteredData.map(d => d.date?.slice(5) || ''),
    datasets: [{
      data: filteredData.map(d => d.volume),
      backgroundColor: volumeColors,
      borderRadius: 2
    }]
  };

  const volumeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#141820',
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        borderColor: '#2a3444',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          title: (items) => {
            const idx = items[0]?.dataIndex;
            return filteredData[idx]?.date || '';
          },
          label: (item) => {
            const vol = item.raw;
            return `Volume: ${(vol / 1e6).toFixed(2)}M`;
          }
        }
      }
    },
    scales: {
      x: { ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
      y: {
        position: 'right',
        ticks: { color: '#64748b', font: { size: 9, family: 'JetBrains Mono' }, callback: v => (v / 1e6).toFixed(0) + 'M' },
        grid: { color: 'rgba(255,255,255,0.03)' }
      }
    }
  };

  if (!filteredData.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, color: 'var(--text-muted)' }}>
        Loading chart data...
      </div>
    );
  }

  return (
    <div>
      {/* ---- Header: OHLCV data display ---- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700 }}>
            ${displayBar?.close?.toFixed(2) || '—'}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 13,
            color: dayChange >= 0 ? 'var(--green)' : 'var(--red)'
          }}>
            {dayChange >= 0 ? '▲' : '▼'} ${Math.abs(dayChange).toFixed(2)} ({dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%)
          </span>
        </div>

        {/* OHLCV detail strip */}
        {displayBar && (
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            <span>O <span style={{ color: 'var(--text-secondary)' }}>{displayBar.open?.toFixed(2)}</span></span>
            <span>H <span style={{ color: 'var(--green)' }}>{displayBar.high?.toFixed(2)}</span></span>
            <span>L <span style={{ color: 'var(--red)' }}>{displayBar.low?.toFixed(2)}</span></span>
            <span>C <span style={{ color: 'var(--text-primary)' }}>{displayBar.close?.toFixed(2)}</span></span>
            <span>V <span style={{ color: 'var(--text-secondary)' }}>{(displayBar.volume / 1e6).toFixed(1)}M</span></span>
          </div>
        )}
      </div>

      {/* ---- Controls: Timeframe + Overlays ---- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        {/* Timeframe buttons */}
        <div style={{ display: 'flex', gap: 3, background: 'var(--bg-primary)', borderRadius: 8, padding: 2 }}>
          {TIMEFRAMES.map(tf => (
            <button key={tf.label} onClick={() => setTimeframe(tf.label)}
              style={{
                padding: '4px 12px', border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-mono)',
                background: timeframe === tf.label ? 'var(--bg-surface2)' : 'transparent',
                color: timeframe === tf.label ? 'var(--text-primary)' : 'var(--text-muted)',
                transition: 'all 0.15s'
              }}>
              {tf.label}
            </button>
          ))}
        </div>

        {/* Overlay toggles */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSMA20(!showSMA20)}
            style={{
              padding: '3px 10px', border: '0.5px solid', borderRadius: 6, cursor: 'pointer',
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: showSMA20 ? 'rgba(245,158,11,0.12)' : 'transparent',
              borderColor: showSMA20 ? '#f59e0b' : 'var(--border)',
              color: showSMA20 ? '#f59e0b' : 'var(--text-muted)',
              transition: 'all 0.15s'
            }}>
            SMA 20
          </button>
          <button onClick={() => setShowSMA50(!showSMA50)}
            style={{
              padding: '3px 10px', border: '0.5px solid', borderRadius: 6, cursor: 'pointer',
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: showSMA50 ? 'rgba(167,139,250,0.12)' : 'transparent',
              borderColor: showSMA50 ? '#a78bfa' : 'var(--border)',
              color: showSMA50 ? '#a78bfa' : 'var(--text-muted)',
              transition: 'all 0.15s'
            }}>
            SMA 50
          </button>
        </div>
      </div>

      {/* ---- Price chart ---- */}
      <div style={{ position: 'relative', height: 260 }}>
        <Line ref={chartRef} data={priceChartData} options={priceChartOptions} />
      </div>

      {/* ---- Volume chart (synced) ---- */}
      <div style={{ position: 'relative', height: 80, marginTop: 4 }}>
        <Bar data={volumeChartData} options={volumeChartOptions} />
      </div>

      {/* ---- Legend ---- */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 2, background: dayChange >= 0 ? '#22c55e' : '#ef4444', display: 'inline-block', borderRadius: 1 }} />
          {symbol}
        </span>
        {showSMA20 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 2, background: '#f59e0b', display: 'inline-block', borderRadius: 1, borderTop: '1px dashed #f59e0b' }} />
            SMA 20
          </span>
        )}
        {showSMA50 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 2, background: '#a78bfa', display: 'inline-block', borderRadius: 1 }} />
            SMA 50
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: 'rgba(34,197,94,0.4)', display: 'inline-block', borderRadius: 2 }} />
          Vol up
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: 'rgba(239,68,68,0.4)', display: 'inline-block', borderRadius: 2 }} />
          Vol down
        </span>
      </div>
    </div>
  );
}
