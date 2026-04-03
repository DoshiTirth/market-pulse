// ============================================
// StockSage AI — Main Application
// Connected to Finnhub with proper rate limiting
// ============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend
} from 'chart.js';
import { RefreshCw } from 'lucide-react';
import { useAgent } from './hooks/useAgent';
import { getQuote, getDaily, RealtimeStream } from './services/stockAPI';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend
);

// ---- Fallback mock data (used when API fails) ----
function generateMockDaily(basePrice, days = 60) {
  const data = [];
  let price = basePrice;
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const change = (Math.random() - 0.48) * basePrice * 0.025;
    price += change;
    data.push({
      date: date.toISOString().split('T')[0],
      open: price - change * 0.3,
      high: price + Math.random() * basePrice * 0.01,
      low: price - Math.random() * basePrice * 0.01,
      close: price,
      volume: Math.floor(Math.random() * 50000000 + 10000000)
    });
  }
  return data;
}

const WATCHLIST_CONFIG = [
  { ticker: 'AAPL', name: 'Apple Inc.', color: '#22d3a7' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', color: '#3b82f6' },
  { ticker: 'MSFT', name: 'Microsoft', color: '#f59e0b' },
  { ticker: 'AMZN', name: 'Amazon', color: '#a78bfa' },
  { ticker: 'GOOGL', name: 'Alphabet', color: '#ef4444' },
  { ticker: 'META', name: 'Meta Platforms', color: '#ec4899' },
  { ticker: 'TSLA', name: 'Tesla Inc.', color: '#6366f1' },
];

const MOCK_PRICES = { AAPL: 213, NVDA: 924, MSFT: 442, AMZN: 198, GOOGL: 178, META: 512, TSLA: 248 };

const SECTORS = [
  { name: 'Technology', val: 3.2 }, { name: 'Healthcare', val: 1.8 },
  { name: 'Financials', val: -0.4 }, { name: 'Energy', val: -1.1 },
  { name: 'Industrials', val: 2.1 }, { name: 'Consumer', val: 0.7 },
  { name: 'Utilities', val: 0.3 },
];

const PORTFOLIO = [
  { label: 'Tech', val: 42, color: '#22d3a7' },
  { label: 'Healthcare', val: 18, color: '#3b82f6' },
  { label: 'Finance', val: 15, color: '#f59e0b' },
  { label: 'Industrial', val: 12, color: '#a78bfa' },
  { label: 'Energy', val: 8, color: '#ef4444' },
  { label: 'Cash', val: 5, color: '#475569' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedStock, setSelectedStock] = useState('AAPL');
  const [stockData, setStockData] = useState({});
  const [quotes, setQuotes] = useState({});
  const [dataSource, setDataSource] = useState('loading');
  const [loadingMsg, setLoadingMsg] = useState('Connecting to Finnhub...');
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatRef = useRef(null);

  const { analyses, insight, analyzeMultiple, askAgent, getSignals } = useAgent();

  // ---- STEP 1: Fetch quotes (fast, one per second) ----
  const fetchQuotes = useCallback(async () => {
    setLoadingMsg('Fetching stock quotes...');
    const quoteMap = {};
    let anySuccess = false;

    for (let i = 0; i < WATCHLIST_CONFIG.length; i++) {
      const stock = WATCHLIST_CONFIG[i];
      setLoadingMsg(`Fetching quote: ${stock.ticker} (${i + 1}/${WATCHLIST_CONFIG.length})...`);
      try {
        const quote = await getQuote(stock.ticker);
        if (quote && quote.price > 0) {
          quoteMap[stock.ticker] = quote;
          anySuccess = true;
        }
      } catch (err) {
        console.warn(`Quote failed for ${stock.ticker}`);
      }
      await new Promise(r => setTimeout(r, 1100));
    }

    if (anySuccess) {
      setQuotes(quoteMap);
      setDataSource('live');
    } else {
      // Fallback
      const mockQuotes = {};
      Object.entries(MOCK_PRICES).forEach(([symbol, price]) => {
        mockQuotes[symbol] = {
          symbol, price, open: price * 0.99, high: price * 1.01,
          low: price * 0.98, change: price * 0.01, changePct: 1.0, prevClose: price * 0.99
        };
      });
      setQuotes(mockQuotes);
      setDataSource('mock');
    }

    return anySuccess;
  }, []);

  // ---- STEP 2: Fetch candles (slower, needs spacing) ----
  const fetchCandles = useCallback(async () => {
    const dailyMap = {};

    for (let i = 0; i < WATCHLIST_CONFIG.length; i++) {
      const stock = WATCHLIST_CONFIG[i];
      setLoadingMsg(`Loading chart: ${stock.ticker} (${i + 1}/${WATCHLIST_CONFIG.length})...`);
      try {
        const daily = await getDaily(stock.ticker, 100);
        if (daily && daily.length > 0) {
          dailyMap[stock.ticker] = daily;
          // Update state progressively so charts appear as they load
          setStockData(prev => ({ ...prev, [stock.ticker]: daily }));
        }
      } catch (err) {
        console.warn(`Candles failed for ${stock.ticker}`);
      }
      await new Promise(r => setTimeout(r, 1200));
    }

    // If no candle data at all, use mock
    if (Object.keys(dailyMap).length === 0) {
      console.warn('[StockSage] No candle data — using mock');
      const mockDaily = {};
      Object.entries(MOCK_PRICES).forEach(([symbol, price]) => {
        mockDaily[symbol] = generateMockDaily(price);
      });
      setStockData(mockDaily);
      setDataSource(prev => prev === 'live' ? 'partial' : 'mock');
    }

    setLoadingMsg('');
    return dailyMap;
  }, []);

  // ---- WebSocket for real-time updates ----
  useEffect(() => {
    const stream = new RealtimeStream((trade) => {
      setQuotes(prev => {
        const existing = prev[trade.symbol];
        if (!existing) return prev;
        return {
          ...prev,
          [trade.symbol]: {
            ...existing,
            price: trade.price,
            change: trade.price - (existing.prevClose || existing.open || trade.price),
            changePct: existing.prevClose
              ? ((trade.price - existing.prevClose) / existing.prevClose * 100)
              : existing.changePct
          }
        };
      });
    });

    stream.connect();
    WATCHLIST_CONFIG.forEach(s => stream.subscribe(s.ticker));

    return () => stream.disconnect();
  }, []);

  // ---- Initial load: quotes first, then candles ----
  useEffect(() => {
    async function loadData() {
      await fetchQuotes();
      await fetchCandles();
    }
    loadData();
  }, [fetchQuotes, fetchCandles]);

  // ---- Run AI analysis when candle data changes ----
  useEffect(() => {
    if (Object.keys(stockData).length > 0) {
      analyzeMultiple(stockData);
    }
  }, [stockData, analyzeMultiple]);

  const signals = getSignals();

  // ---- Chart config ----
  const chartData = stockData[selectedStock] || [];
  const priceChartConfig = {
    labels: chartData.map(d => d.date?.slice(5) || ''),
    datasets: [{
      data: chartData.map(d => d.close),
      borderColor: '#22d3a7',
      borderWidth: 2,
      fill: true,
      backgroundColor: (ctx) => {
        if (!ctx.chart?.ctx) return 'rgba(34,211,167,0)';
        const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 260);
        g.addColorStop(0, 'rgba(34,211,167,0.2)');
        g.addColorStop(1, 'rgba(34,211,167,0)');
        return g;
      },
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: '#22d3a7',
      tension: 0.3
    }]
  };

  const priceChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1f2a', titleColor: '#e2e8f0', bodyColor: '#22d3a7',
        borderColor: '#22d3a7', borderWidth: 1,
        callbacks: { label: (c) => '$' + c.raw?.toFixed(2) }
      }
    },
    scales: {
      x: { ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 }, callback: v => '$' + v.toFixed(0) }, grid: { color: 'rgba(255,255,255,0.04)' } }
    },
    interaction: { mode: 'nearest', axis: 'x' }
  };

  // Volume
  const volData = chartData.slice(-20);
  const avgVol = volData.length > 0 ? volData.reduce((s, d) => s + d.volume, 0) / volData.length : 1;
  const volumeChartConfig = {
    labels: volData.map(d => d.date?.slice(5) || ''),
    datasets: [{
      data: volData.map(d => d.volume),
      backgroundColor: volData.map(d => d.volume > avgVol ? 'rgba(34,211,167,0.5)' : 'rgba(100,116,139,0.25)'),
      borderRadius: 3
    }]
  };
  const volumeChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#64748b', maxTicksLimit: 6, font: { size: 10 } }, grid: { display: false } },
      y: { ticks: { color: '#64748b', font: { size: 10 }, callback: v => (v / 1e6).toFixed(0) + 'M' }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  };

  // Donut
  const donutConfig = {
    labels: PORTFOLIO.map(p => p.label),
    datasets: [{ data: PORTFOLIO.map(p => p.val), backgroundColor: PORTFOLIO.map(p => p.color), borderWidth: 0, cutout: '72%' }]
  };

  // Chat
  async function handleChat() {
    if (!chatInput.trim()) return;
    setChatLoading(true);
    const response = await askAgent(chatInput, stockData);
    setChatResponse(response);
    setChatInput('');
    setChatLoading(false);
  }

  // Screener
  const screenerStocks = WATCHLIST_CONFIG.map(w => {
    const quote = quotes[w.ticker];
    const analysis = analyses[w.ticker];
    return {
      ...w, price: quote?.price || 0, change: quote?.changePct || 0,
      volume: stockData[w.ticker]?.slice(-1)[0]?.volume || 0,
      signal: analysis?.aggregated?.action || 'hold',
      confidence: analysis?.aggregated?.confidence || 0,
      rsi: analysis?.skills?.technical?.rsi || '-'
    };
  });

  // Status
  const statusColor = dataSource === 'live' ? '#22c55e' : dataSource === 'partial' ? '#f59e0b' : dataSource === 'mock' ? '#ef4444' : '#64748b';
  const statusText = dataSource === 'live' ? 'LIVE DATA' : dataSource === 'partial' ? 'PARTIAL' : dataSource === 'mock' ? 'MOCK DATA' : 'LOADING';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="logo">
          <div className="logo-mark">S</div>
          <div className="logo-text">Stock<span>Sage</span> AI</div>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginLeft: 8, background: statusColor + '22', color: statusColor }}>
            {statusText}
          </span>
          {loadingMsg && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 12 }}>
              {loadingMsg}
            </span>
          )}
        </div>

        <nav className="nav-tabs">
          {['dashboard', 'screener', 'signals', 'portfolio'].map(tab => (
            <button key={tab} className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)} data-tab={tab}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>

        <button onClick={async () => { await fetchQuotes(); await fetchCandles(); }}
          style={{ background: 'transparent', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      <main className="app-body">

        {activeTab === 'dashboard' && (
          <>
            {/* Index metrics — derived from stock quotes */}
            <div className="metrics-grid">
              {[
                { label: 'S&P 500', ticker: 'AAPL' },
                { label: 'NASDAQ', ticker: 'NVDA' },
                { label: 'DOW JONES', ticker: 'MSFT' },
                { label: 'VIX', ticker: null },
              ].map((m, i) => {
                const q = m.ticker ? quotes[m.ticker] : null;
                const change = q?.changePct || 0;
                const up = m.ticker ? change >= 0 : null;
                return (
                  <div key={i} className={`metric-card animate-in ${up === true ? 'up' : up === false ? 'down' : 'neutral'}`} style={{ animationDelay: `${i * 0.06}s` }}>
                    <div className="metric-label">{m.label}</div>
                    <div className="metric-value">
                      {q ? '$' + q.price.toFixed(2) : m.ticker ? '...' : '14.82'}
                    </div>
                    <div className={`metric-change ${up === true ? 'up' : up === false ? 'down' : ''}`}>
                      {up === true ? '▲' : up === false ? '▼' : '─'} {Math.abs(change).toFixed(2)}%
                    </div>
                    {m.ticker && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>via {m.ticker}</div>}
                  </div>
                );
              })}
            </div>

            {/* AI Insight */}
            <div className="ai-insight animate-in" style={{ animationDelay: '0.25s' }}>
              <div className="ai-insight-header">
                <div className="ai-pulse" />
                <div className="ai-insight-label">
                  AI market insight — {dataSource === 'live' ? 'analyzing real market data' : 'updated just now'}
                </div>
              </div>
              <div className="ai-insight-text" dangerouslySetInnerHTML={{
                __html: insight || 'Analyzing market conditions across your watchlist...'
              }} />
            </div>

            {/* Chart + Watchlist */}
            <div className="grid-2-1">
              <div className="card animate-in" style={{ animationDelay: '0.3s' }}>
                <div className="card-header">
                  <span className="card-title">
                    Price action — {selectedStock}
                    {quotes[selectedStock]?.price && (
                      <span style={{ marginLeft: 8, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                        ${quotes[selectedStock].price.toFixed(2)}
                      </span>
                    )}
                  </span>
                  <span className="badge badge-live">{dataSource === 'live' ? 'LIVE' : 'DEMO'}</span>
                </div>
                <div style={{ position: 'relative', height: 260 }}>
                  {chartData.length > 0 ? (
                    <Line data={priceChartConfig} options={priceChartOptions} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
                      {loadingMsg ? `Loading ${selectedStock} chart...` : 'No data available — try refreshing'}
                    </div>
                  )}
                </div>
              </div>

              <div className="card animate-in" style={{ animationDelay: '0.35s' }}>
                <div className="card-header"><span className="card-title">Watchlist</span></div>
                {WATCHLIST_CONFIG.map((stock) => {
                  const quote = quotes[stock.ticker];
                  const price = quote?.price || 0;
                  const change = quote?.changePct || 0;
                  const up = change >= 0;
                  return (
                    <div key={stock.ticker} className="wl-item" onClick={() => setSelectedStock(stock.ticker)}>
                      <div className="wl-left">
                        <div className="wl-icon" style={{ background: stock.color + '22', color: stock.color }}>
                          {stock.ticker.slice(0, 2)}
                        </div>
                        <div>
                          <div className="wl-ticker" style={{ fontWeight: selectedStock === stock.ticker ? 700 : 500 }}>{stock.ticker}</div>
                          <div className="wl-name">{stock.name}</div>
                        </div>
                      </div>
                      <div className="wl-price">
                        <div>{price > 0 ? `$${price.toFixed(2)}` : '...'}</div>
                        <div className="wl-pct" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
                          {price > 0 ? `${up ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%` : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Signals + Sectors */}
            <div className="grid-1-1">
              <div className="card animate-in" style={{ animationDelay: '0.4s' }}>
                <div className="card-header">
                  <span className="card-title">AI signals</span>
                  <span className="badge badge-ai">AI</span>
                </div>
                {signals.length > 0 ? signals.map((s, i) => (
                  <div key={i} className="signal-item">
                    <div className={`signal-dot ${s.action}`} />
                    <div className="signal-ticker">{s.symbol}</div>
                    <div className="signal-text">{s.reasoning?.slice(0, 80) || 'Analyzing...'}</div>
                    <div className="signal-confidence" style={{
                      color: s.action === 'buy' ? 'var(--green)' : s.action === 'sell' ? 'var(--red)' : 'var(--accent3)'
                    }}>{s.confidence}%</div>
                  </div>
                )) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {loadingMsg ? 'Waiting for chart data to run analysis...' : 'No signals generated'}
                  </div>
                )}
              </div>

              <div className="card animate-in" style={{ animationDelay: '0.45s' }}>
                <div className="card-header"><span className="card-title">Sector performance</span></div>
                {SECTORS.map((s, i) => {
                  const up = s.val >= 0;
                  return (
                    <div key={i} className="sector-row">
                      <div className="sector-label">{s.name}</div>
                      <div className="sector-track">
                        <div className="sector-fill" style={{ width: `${Math.min(Math.abs(s.val) / 4 * 100, 100)}%`, background: up ? 'var(--green)' : 'var(--red)' }} />
                      </div>
                      <div className={`sector-val ${up ? 'up' : 'down'}`}>{up ? '+' : ''}{s.val.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Portfolio + Volume */}
            <div className="grid-1-1">
              <div className="card animate-in" style={{ animationDelay: '0.5s' }}>
                <div className="card-header"><span className="card-title">Portfolio allocation</span></div>
                <div className="portfolio-layout">
                  <div className="ring-container">
                    <Doughnut data={donutConfig} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1f2a', bodyColor: '#e2e8f0' } } }} />
                    <div className="ring-center-label">
                      <div className="ring-value">$124.8K</div>
                      <div className="ring-sub">total value</div>
                    </div>
                  </div>
                  <div className="ring-legend">
                    {PORTFOLIO.map((p, i) => (
                      <div key={i} className="leg-item">
                        <div className="leg-swatch" style={{ background: p.color }} />
                        <span>{p.label}</span>
                        <span className="leg-pct">{p.val}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card animate-in" style={{ animationDelay: '0.55s' }}>
                <div className="card-header">
                  <span className="card-title">Volume analysis — {selectedStock}</span>
                  <span className="badge badge-live">{dataSource === 'live' ? 'LIVE' : 'DEMO'}</span>
                </div>
                <div style={{ position: 'relative', height: 160 }}>
                  {volData.length > 0 ? <Bar data={volumeChartConfig} options={volumeChartOptions} /> : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>Loading volume data...</div>
                  )}
                </div>
              </div>
            </div>

            {/* AI Chat */}
            <div className="card animate-in" style={{ animationDelay: '0.6s', marginTop: 12 }}>
              <div className="card-header">
                <span className="card-title">Ask StockSage AI anything</span>
                <span className="badge badge-ai">AI</span>
              </div>
              <div className="chat-input-row">
                <input ref={chatRef} className="chat-input" value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleChat()}
                  placeholder="e.g. Should I buy NVDA at current levels? Analyze AAPL for me." />
                <button className="chat-send" onClick={handleChat}>{chatLoading ? '...' : '↑'}</button>
              </div>
              {chatResponse && <div className="chat-response" dangerouslySetInnerHTML={{ __html: chatResponse }} />}
            </div>
          </>
        )}

        {/* SCREENER */}
        {activeTab === 'screener' && (
          <div className="card animate-in">
            <div className="card-header">
              <span className="card-title">Stock screener</span>
              <span className="badge badge-ai">AI-powered</span>
            </div>
            <div className="screener-filters">
              {['All', 'Strong buy', 'Buy', 'Hold', 'Sell', 'Oversold', 'High volume'].map(f => (
                <button key={f} className="filter-chip">{f}</button>
              ))}
            </div>
            <table className="screener-table">
              <thead><tr><th>Symbol</th><th>Price</th><th>Change</th><th>Volume</th><th>RSI</th><th>AI Signal</th><th>Confidence</th></tr></thead>
              <tbody>
                {screenerStocks.map(s => (
                  <tr key={s.ticker} onClick={() => { setSelectedStock(s.ticker); setActiveTab('dashboard'); }} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: s.color + '22', color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{s.ticker.slice(0, 2)}</div>
                        <div><div style={{ fontWeight: 500 }}>{s.ticker}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.name}</div></div>
                      </div>
                    </td>
                    <td className="mono">${s.price.toFixed(2)}</td>
                    <td style={{ color: s.change >= 0 ? 'var(--green)' : 'var(--red)' }} className="mono">{s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%</td>
                    <td className="mono">{(s.volume / 1e6).toFixed(1)}M</td>
                    <td className="mono">{s.rsi}</td>
                    <td>
                      <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        background: s.signal === 'buy' ? 'var(--green-dim)' : s.signal === 'sell' ? 'var(--red-dim)' : 'var(--accent3-dim)',
                        color: s.signal === 'buy' ? 'var(--green)' : s.signal === 'sell' ? 'var(--red)' : 'var(--accent3)' }}>
                        {s.signal.toUpperCase()}
                      </span>
                    </td>
                    <td className="mono">{s.confidence}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* SIGNALS */}
        {activeTab === 'signals' && (
          <>
            <div className="ai-insight animate-in">
              <div className="ai-insight-header"><div className="ai-pulse" /><div className="ai-insight-label">AI signal engine — multi-skill analysis</div></div>
              <div className="ai-insight-text" dangerouslySetInnerHTML={{ __html: insight || 'Generating signals from 4 analysis skills...' }} />
            </div>
            <div className="card animate-in" style={{ animationDelay: '0.1s' }}>
              <div className="card-header"><span className="card-title">Active signals</span><span className="badge badge-ai">4 skills</span></div>
              {signals.map((s, i) => {
                const analysis = analyses[s.symbol];
                return (
                  <div key={i} style={{ padding: '14px 0', borderBottom: '0.5px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className={`signal-dot ${s.action}`} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{s.symbol}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                          background: s.action === 'buy' ? 'var(--green-dim)' : s.action === 'sell' ? 'var(--red-dim)' : 'var(--accent3-dim)',
                          color: s.action === 'buy' ? 'var(--green)' : s.action === 'sell' ? 'var(--red)' : 'var(--accent3)' }}>
                          {s.action.toUpperCase()}
                        </span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700,
                        color: s.action === 'buy' ? 'var(--green)' : s.action === 'sell' ? 'var(--red)' : 'var(--accent3)' }}>
                        {s.confidence}%
                      </span>
                    </div>
                    {analysis?.skills && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {Object.entries(analysis.skills).map(([skill, result]) => (
                          <span key={skill} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'var(--bg-surface2)', color: 'var(--text-muted)' }}>
                            {skill}: {result.signal} ({result.confidence}%)
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{s.reasoning?.slice(0, 120)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* PORTFOLIO */}
        {activeTab === 'portfolio' && (
          <div className="grid-1-1">
            <div className="card animate-in">
              <div className="card-header"><span className="card-title">Portfolio value</span></div>
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>$124,812</div>
                <div style={{ color: 'var(--green)', fontSize: 16, fontFamily: 'var(--font-mono)', marginTop: 4 }}>▲ $2,847 (+2.33%) today</div>
              </div>
              <div style={{ position: 'relative', height: 200 }}>
                <Doughnut data={donutConfig} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
                <div className="ring-center-label"><div className="ring-value">$124.8K</div><div className="ring-sub">total</div></div>
              </div>
            </div>
            <div className="card animate-in" style={{ animationDelay: '0.1s' }}>
              <div className="card-header"><span className="card-title">Holdings</span></div>
              {WATCHLIST_CONFIG.slice(0, 5).map((s, i) => {
                const shares = [150, 12, 25, 40, 35][i];
                const price = quotes[s.ticker]?.price || MOCK_PRICES[s.ticker];
                const value = shares * price;
                const change = quotes[s.ticker]?.changePct || 0;
                return (
                  <div key={s.ticker} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid var(--border)' }}>
                    <div><div style={{ fontWeight: 500 }}>{s.ticker}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{shares} shares @ ${price.toFixed(2)}</div></div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)' }}>${value.toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: change >= 0 ? 'var(--green)' : 'var(--red)' }}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
