// InteractiveChart — Rich stock chart component
// Crosshair, OHLCV tooltips, SMA overlays,
// timeframe selector, volume bars

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Filler, Tooltip, Legend
} from 'chart.js';
import { getIntraday } from '../services/stockAPI';

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

// ---- EMA calculation ----
function calcEMA(data, period) {
  if (!data || data.length === 0 || data[0] == null) return data.map(() => null);
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    if (data[i] == null) { ema.push(ema[i - 1]); continue; }
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema.map(v => v != null ? parseFloat(v.toFixed(2)) : null);
}

// ---- RSI calculation ----
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return closes.map(() => null);

  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Pad with nulls for the initial period
  const rsi = new Array(period).fill(null);
  rsi.push(parseFloat((100 - 100 / (1 + avgGain / (avgLoss || 0.001))).toFixed(2)));

  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi.push(parseFloat((100 - 100 / (1 + avgGain / (avgLoss || 0.001))).toFixed(2)));
  }
  return rsi;
}

// ---- MACD calculation ----
function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);

  const macdLine = emaFast.map((v, i) => parseFloat((v - emaSlow[i]).toFixed(4)));
  const signalLine = calcEMA(macdLine.slice(slow - 1), signal);

  // Pad signal line to match length
  const paddedSignal = new Array(slow - 1 + signal - 1).fill(null).concat(signalLine);

  // Histogram
  const histogram = macdLine.map((v, i) => {
    if (paddedSignal[i] == null) return null;
    return parseFloat((v - paddedSignal[i]).toFixed(4));
  });

  return { macdLine, signalLine: paddedSignal, histogram };
}

// ---- Timeframe configs ----
const TIMEFRAMES = [
  { label: '1D', days: 0 },
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: 'ALL', days: 999 },
];

export default function InteractiveChart({ stockData, symbol, quote }) {
  const [timeframe, setTimeframe] = useState('3M');
  const [showSMA20, setShowSMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(false);
  const [showRSI, setShowRSI] = useState(true);
  const [showMACD, setShowMACD] = useState(true);
  const [hoveredData, setHoveredData] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [intradayData, setIntradayData] = useState([]);
  const chartRef = useRef(null);

  // Fetch intraday data when 1D is selected
  useEffect(() => {
    if (timeframe === '1D' && symbol) {
      getIntraday(symbol).then(data => {
        if (data.length > 0) setIntradayData(data);
      });
    }
  }, [timeframe, symbol]);

  // Filter data by timeframe
  const filteredData = useMemo(() => {
    if (timeframe === '1D') {
      return intradayData.length > 0 ? intradayData : (stockData || []).slice(-1);
    }
    if (!stockData || stockData.length === 0) return [];
    const tf = TIMEFRAMES.find(t => t.label === timeframe);
    const days = tf?.days || 90;
    return stockData.slice(-Math.min(days, stockData.length));
  }, [stockData, timeframe, intradayData]);

  const closes = useMemo(() => filteredData.map(d => d.close), [filteredData]);
  const sma20 = useMemo(() => showSMA20 ? calcSMA(closes, 20) : [], [closes, showSMA20]);
  const sma50 = useMemo(() => showSMA50 ? calcSMA(closes, 50) : [], [closes, showSMA50]);
  const rsiData = useMemo(() => showRSI ? calcRSI(closes) : [], [closes, showRSI]);
  const macdData = useMemo(() => showMACD ? calcMACD(closes) : { macdLine: [], signalLine: [], histogram: [] }, [closes, showMACD]);

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
            setHoveredIndex(idx);
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
      if (!elements.length) { setHoveredData(null); setHoveredIndex(null); }
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
          <span style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
          <button onClick={() => setShowRSI(!showRSI)}
            style={{
              padding: '3px 10px', border: '0.5px solid', borderRadius: 6, cursor: 'pointer',
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: showRSI ? 'rgba(6,182,212,0.12)' : 'transparent',
              borderColor: showRSI ? '#06b6d4' : 'var(--border)',
              color: showRSI ? '#06b6d4' : 'var(--text-muted)',
              transition: 'all 0.15s'
            }}>
            RSI
          </button>
          <button onClick={() => setShowMACD(!showMACD)}
            style={{
              padding: '3px 10px', border: '0.5px solid', borderRadius: 6, cursor: 'pointer',
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: showMACD ? 'rgba(236,72,153,0.12)' : 'transparent',
              borderColor: showMACD ? '#ec4899' : 'var(--border)',
              color: showMACD ? '#ec4899' : 'var(--text-muted)',
              transition: 'all 0.15s'
            }}>
            MACD
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

      {/* ---- RSI panel ---- */}
      {showRSI && rsiData.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#06b6d4', fontWeight: 700 }}>
              RSI (14)
              {hoveredIndex != null && rsiData[hoveredIndex] != null && (
                <span style={{ marginLeft: 8, color: rsiData[hoveredIndex] > 70 ? '#ef4444' : rsiData[hoveredIndex] < 30 ? '#22c55e' : 'var(--text-secondary)' }}>
                  {rsiData[hoveredIndex].toFixed(1)}
                </span>
              )}
              {hoveredIndex == null && rsiData[rsiData.length - 1] != null && (
                <span style={{ marginLeft: 8, color: rsiData[rsiData.length - 1] > 70 ? '#ef4444' : rsiData[rsiData.length - 1] < 30 ? '#22c55e' : 'var(--text-secondary)' }}>
                  {rsiData[rsiData.length - 1].toFixed(1)}
                </span>
              )}
            </span>
            <div style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: '#ef4444' }}>70</span> overbought · <span style={{ color: '#22c55e' }}>30</span> oversold
            </div>
          </div>
          <div style={{ position: 'relative', height: 80 }}>
            <Line data={{
              labels: filteredData.map(d => d.date?.slice(5) || ''),
              datasets: [{
                data: rsiData,
                borderColor: '#06b6d4',
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#06b6d4',
                tension: 0.3,
                fill: false
              }]
            }} options={{
              responsive: true, maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: '#141820', titleColor: '#e2e8f0', bodyColor: '#06b6d4',
                  borderColor: '#2a3444', borderWidth: 1, padding: 8, cornerRadius: 6,
                  displayColors: false,
                  callbacks: {
                    title: (items) => filteredData[items[0]?.dataIndex]?.date || '',
                    label: (item) => `RSI: ${item.raw?.toFixed(1)}`
                  }
                }
              },
              scales: {
                x: { display: false },
                y: {
                  position: 'right', min: 0, max: 100,
                  ticks: { color: '#64748b', font: { size: 9, family: 'JetBrains Mono' }, stepSize: 30, callback: v => v },
                  grid: { color: 'rgba(255,255,255,0.03)' }
                }
              },
              // Draw overbought/oversold zones
            }} plugins={[{
              id: 'rsiZones',
              beforeDraw(chart) {
                const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
                if (!y) return;
                ctx.save();
                // Overbought zone (70-100)
                const y70 = y.getPixelForValue(70);
                ctx.fillStyle = 'rgba(239, 68, 68, 0.06)';
                ctx.fillRect(left, top, right - left, y70 - top);
                // Oversold zone (0-30)
                const y30 = y.getPixelForValue(30);
                ctx.fillStyle = 'rgba(34, 197, 94, 0.06)';
                ctx.fillRect(left, y30, right - left, bottom - y30);
                // Lines at 70 and 30
                ctx.setLineDash([4, 4]);
                ctx.lineWidth = 0.5;
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
                ctx.beginPath(); ctx.moveTo(left, y70); ctx.lineTo(right, y70); ctx.stroke();
                ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
                ctx.beginPath(); ctx.moveTo(left, y30); ctx.lineTo(right, y30); ctx.stroke();
                // Midline at 50
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
                const y50 = y.getPixelForValue(50);
                ctx.beginPath(); ctx.moveTo(left, y50); ctx.lineTo(right, y50); ctx.stroke();
                ctx.restore();
              }
            }]} />
          </div>
        </div>
      )}

      {/* ---- MACD panel ---- */}
      {showMACD && macdData.macdLine.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#ec4899', fontWeight: 700 }}>
              MACD (12, 26, 9)
              {hoveredIndex != null && macdData.macdLine[hoveredIndex] != null && (
                <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>
                  {macdData.macdLine[hoveredIndex].toFixed(2)}
                </span>
              )}
            </span>
            <div style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', display: 'flex', gap: 12 }}>
              <span><span style={{ color: '#ec4899' }}>—</span> MACD</span>
              <span><span style={{ color: '#f59e0b' }}>—</span> Signal</span>
              <span>Histogram</span>
            </div>
          </div>
          <div style={{ position: 'relative', height: 90 }}>
            <Bar data={{
              labels: filteredData.map(d => d.date?.slice(5) || ''),
              datasets: [
                // Histogram bars
                {
                  type: 'bar',
                  data: macdData.histogram,
                  backgroundColor: macdData.histogram.map(v =>
                    v == null ? 'transparent' : v >= 0 ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'
                  ),
                  borderRadius: 1,
                  order: 2
                },
                // MACD line
                {
                  type: 'line',
                  data: macdData.macdLine,
                  borderColor: '#ec4899',
                  borderWidth: 1.5,
                  pointRadius: 0,
                  pointHoverRadius: 3,
                  tension: 0.3,
                  fill: false,
                  order: 1
                },
                // Signal line
                {
                  type: 'line',
                  data: macdData.signalLine,
                  borderColor: '#f59e0b',
                  borderWidth: 1.2,
                  borderDash: [4, 3],
                  pointRadius: 0,
                  pointHoverRadius: 3,
                  tension: 0.3,
                  fill: false,
                  order: 1
                }
              ]
            }} options={{
              responsive: true, maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: '#141820', titleColor: '#e2e8f0', bodyColor: '#94a3b8',
                  borderColor: '#2a3444', borderWidth: 1, padding: 8, cornerRadius: 6,
                  displayColors: false,
                  callbacks: {
                    title: (items) => filteredData[items[0]?.dataIndex]?.date || '',
                    afterBody: (items) => {
                      const idx = items[0]?.dataIndex;
                      if (idx == null) return '';
                      const lines = [];
                      if (macdData.macdLine[idx] != null) lines.push(`MACD:   ${macdData.macdLine[idx].toFixed(3)}`);
                      if (macdData.signalLine[idx] != null) lines.push(`Signal: ${macdData.signalLine[idx].toFixed(3)}`);
                      if (macdData.histogram[idx] != null) lines.push(`Hist:   ${macdData.histogram[idx].toFixed(3)}`);
                      return lines;
                    },
                    label: () => ''
                  }
                }
              },
              scales: {
                x: { display: false },
                y: {
                  position: 'right',
                  ticks: { color: '#64748b', font: { size: 9, family: 'JetBrains Mono' }, callback: v => v.toFixed(1) },
                  grid: { color: 'rgba(255,255,255,0.03)' }
                }
              }
            }} plugins={[{
              id: 'macdZeroLine',
              beforeDraw(chart) {
                const { ctx, chartArea: { left, right }, scales: { y } } = chart;
                if (!y) return;
                const y0 = y.getPixelForValue(0);
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.lineWidth = 0.5;
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
                ctx.beginPath(); ctx.moveTo(left, y0); ctx.lineTo(right, y0); ctx.stroke();
                ctx.restore();
              }
            }]} />
          </div>
        </div>
      )}

      {/* ---- Legend ---- */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
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
        {showRSI && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 2, background: '#06b6d4', display: 'inline-block', borderRadius: 1 }} />
            RSI
          </span>
        )}
        {showMACD && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 2, background: '#ec4899', display: 'inline-block', borderRadius: 1 }} />
            MACD
          </span>
        )}
      </div>
    </div>
  );
}
