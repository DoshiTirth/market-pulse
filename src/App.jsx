// ============================================
// Market Pulse — AI Stock Analysis Dashboard
// Industrial-grade with real data pipeline
// ============================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend
} from 'chart.js';
import { RefreshCw, ExternalLink, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useAgent } from './hooks/useAgent';
import { getQuote, getDaily, getNews, RealtimeStream } from './services/stockAPI';
import { askClaude, checkBackendHealth } from './services/aiChat';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend
);

// ---- Config ----
const WATCHLIST_CONFIG = [
  { ticker: 'AAPL', name: 'Apple Inc.', color: '#22d3a7' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', color: '#3b82f6' },
  { ticker: 'MSFT', name: 'Microsoft', color: '#f59e0b' },
  { ticker: 'AMZN', name: 'Amazon', color: '#a78bfa' },
  { ticker: 'GOOGL', name: 'Alphabet', color: '#ef4444' },
  { ticker: 'META', name: 'Meta Platforms', color: '#ec4899' },
  { ticker: 'TSLA', name: 'Tesla Inc.', color: '#6366f1' },
];

// ETFs that track major indices — real data instead of fake index numbers
const INDEX_ETFS = [
  { ticker: 'SPY', label: 'S&P 500', sublabel: 'SPY ETF' },
  { ticker: 'QQQ', label: 'NASDAQ', sublabel: 'QQQ ETF' },
  { ticker: 'DIA', label: 'DOW JONES', sublabel: 'DIA ETF' },
  { ticker: 'VIX', label: 'VIX', sublabel: 'Volatility', isMock: true },
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
  const [indexQuotes, setIndexQuotes] = useState({});
  const [newsData, setNewsData] = useState([]);
  const [dataSource, setDataSource] = useState('loading');
  const [loadingMsg, setLoadingMsg] = useState('Connecting...');
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [backendOnline, setBackendOnline] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const chatRef = useRef(null);

  const { analyses, insight, analyzeMultiple, askAgent, getSignals } = useAgent();

  // ---- Fetch index ETF quotes ----
  const fetchIndexes = useCallback(async () => {
    const iq = {};
    for (const idx of INDEX_ETFS) {
      if (idx.isMock) continue;
      try {
        const quote = await getQuote(idx.ticker);
        if (quote) iq[idx.ticker] = quote;
      } catch (e) { /* skip */ }
      await new Promise(r => setTimeout(r, 1100));
    }
    setIndexQuotes(iq);
  }, []);

  // ---- Fetch stock quotes ----
  const fetchQuotes = useCallback(async () => {
    setLoadingMsg('Fetching quotes...');
    const quoteMap = {};
    let anySuccess = false;

    for (let i = 0; i < WATCHLIST_CONFIG.length; i++) {
      const stock = WATCHLIST_CONFIG[i];
      setLoadingMsg(`Quote: ${stock.ticker} (${i + 1}/${WATCHLIST_CONFIG.length})`);
      try {
        const quote = await getQuote(stock.ticker);
        if (quote && quote.price > 0) {
          quoteMap[stock.ticker] = quote;
          anySuccess = true;
        }
      } catch (err) { /* skip */ }
      await new Promise(r => setTimeout(r, 1100));
    }

    if (anySuccess) {
      setQuotes(quoteMap);
      setDataSource('live');
    }
    return anySuccess;
  }, []);

  // ---- Fetch candle data (Yahoo Finance) ----
  const fetchCandles = useCallback(async () => {
    for (let i = 0; i < WATCHLIST_CONFIG.length; i++) {
      const stock = WATCHLIST_CONFIG[i];
      setLoadingMsg(`Chart: ${stock.ticker} (${i + 1}/${WATCHLIST_CONFIG.length})`);
      try {
        const daily = await getDaily(stock.ticker, 100);
        if (daily && daily.length > 0) {
          setStockData(prev => ({ ...prev, [stock.ticker]: daily }));
        }
      } catch (err) { /* skip */ }
      await new Promise(r => setTimeout(r, 600));
    }
    setLoadingMsg('');
  }, []);

  // ---- Fetch news ----
  const fetchNewsData = useCallback(async () => {
    try {
      const news = await getNews(selectedStock, 7);
      setNewsData(news);
    } catch (e) { /* skip */ }
  }, [selectedStock]);

  // ---- WebSocket ----
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

  // ---- Initial load ----
  useEffect(() => {
    async function loadData() {
      await fetchIndexes();
      await fetchQuotes();
      await fetchCandles();
      await fetchNewsData();
    }
    loadData();
  }, [fetchIndexes, fetchQuotes, fetchCandles, fetchNewsData]);

  // ---- Refetch news when selected stock changes ----
  useEffect(() => {
    fetchNewsData();
  }, [selectedStock, fetchNewsData]);

  // ---- Run AI analysis ----
  useEffect(() => {
    if (Object.keys(stockData).length > 0) {
      analyzeMultiple(stockData);
    }
  }, [stockData, analyzeMultiple]);

  const signals = getSignals();

  // ---- Compute sector performance from real data ----
  const sectorPerformance = useMemo(() => {
    const sectorMap = {
      'AAPL': 'Technology', 'NVDA': 'Technology', 'MSFT': 'Technology',
      'GOOGL': 'Technology', 'META': 'Technology',
      'AMZN': 'Consumer', 'TSLA': 'Automotive'
    };
    const sectors = {};
    Object.entries(quotes).forEach(([symbol, q]) => {
      const sector = sectorMap[symbol] || 'Other';
      if (!sectors[sector]) sectors[sector] = { total: 0, count: 0 };
      sectors[sector].total += (q.changePct || 0);
      sectors[sector].count += 1;
    });
    return Object.entries(sectors).map(([name, data]) => ({
      name,
      val: parseFloat((data.total / data.count).toFixed(2))
    }));
  }, [quotes]);

  // ---- Chart config ----
  const chartData = stockData[selectedStock] || [];
  const priceChartConfig = {
    labels: chartData.map(d => d.date?.slice(5) || ''),
    datasets: [{
      data: chartData.map(d => d.close),
      borderColor: '#22d3a7', borderWidth: 2, fill: true,
      backgroundColor: (ctx) => {
        if (!ctx.chart?.ctx) return 'rgba(34,211,167,0)';
        const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 260);
        g.addColorStop(0, 'rgba(34,211,167,0.2)');
        g.addColorStop(1, 'rgba(34,211,167,0)');
        return g;
      },
      pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#22d3a7', tension: 0.3
    }]
  };
  const priceChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#1a1f2a', titleColor: '#e2e8f0', bodyColor: '#22d3a7', borderColor: '#22d3a7', borderWidth: 1, callbacks: { label: (c) => '$' + c.raw?.toFixed(2) } }
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
    datasets: [{ data: volData.map(d => d.volume), backgroundColor: volData.map(d => d.volume > avgVol ? 'rgba(34,211,167,0.5)' : 'rgba(100,116,139,0.25)'), borderRadius: 3 }]
  };
  const volumeChartOptions = {
    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
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
  // ---- Check backend health on mount ----
  useEffect(() => {
    checkBackendHealth().then(status => setBackendOnline(status.online));
    const interval = setInterval(() => {
      checkBackendHealth().then(status => setBackendOnline(status.online));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ---- Claude-powered chat ----
  async function handleChat() {
    if (!chatInput.trim()) return;
    const question = chatInput.trim();
    setChatInput('');
    setChatLoading(true);

    // Add user message to history
    setChatHistory(prev => [...prev, { role: 'user', text: question }]);

    try {
      const response = await askClaude(question, {
        quotes,
        signals,
        analyses
      });

      // Add AI response to history
      setChatHistory(prev => [...prev, { role: 'ai', text: response }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'ai', text: 'Something went wrong. Make sure the backend server is running.' }]);
    }
    setChatLoading(false);
  }

  // ---- Screener with working filters ----
  const screenerStocks = useMemo(() => {
    const stocks = WATCHLIST_CONFIG.map(w => {
      const quote = quotes[w.ticker];
      const analysis = analyses[w.ticker];
      const tech = analysis?.skills?.technical;
      return {
        ...w,
        price: quote?.price || 0,
        change: quote?.changePct || 0,
        volume: stockData[w.ticker]?.slice(-1)[0]?.volume || 0,
        signal: analysis?.aggregated?.action || 'hold',
        confidence: analysis?.aggregated?.confidence || 0,
        rsi: tech?.rsi || null,
        macd: tech?.macdSignal || null,
        trend: tech?.trend || null,
        volatility: tech?.volatility || null
      };
    });

    // Apply filter
    switch (activeFilter) {
      case 'Strong buy': return stocks.filter(s => s.signal === 'buy' && s.confidence >= 70);
      case 'Buy': return stocks.filter(s => s.signal === 'buy');
      case 'Hold': return stocks.filter(s => s.signal === 'hold');
      case 'Sell': return stocks.filter(s => s.signal === 'sell');
      case 'Oversold': return stocks.filter(s => s.rsi !== null && s.rsi < 35);
      case 'High volume': {
        const sorted = [...stocks].sort((a, b) => b.volume - a.volume);
        return sorted.slice(0, 5);
      }
      default: return stocks;
    }
  }, [quotes, analyses, stockData, activeFilter]);

  // Status
  const statusColor = dataSource === 'live' ? '#22c55e' : '#64748b';
  const statusText = dataSource === 'live' ? 'LIVE' : 'LOADING';

  // ---- Enhanced AI insight ----
  const enhancedInsight = useMemo(() => {
    if (!insight) return 'Analyzing market conditions...';

    // Add real data to the insight
    const buySignals = signals.filter(s => s.action === 'buy');
    const sellSignals = signals.filter(s => s.action === 'sell');
    const spyQuote = indexQuotes['SPY'];
    const spyDir = spyQuote?.changePct >= 0 ? 'up' : 'down';

    let enhanced = '';
    if (spyQuote) {
      enhanced += `<strong>S&P 500 ${spyDir === 'up' ? '▲' : '▼'} ${Math.abs(spyQuote.changePct).toFixed(2)}%</strong> today. `;
    }
    enhanced += insight;

    // Add specific RSI readings
    const oversold = signals.filter(s => {
      const tech = analyses[s.symbol]?.skills?.technical;
      return tech?.rsi && tech.rsi < 35;
    });
    if (oversold.length > 0) {
      enhanced += ` Oversold stocks (RSI < 35): ${oversold.map(s => {
        const rsi = analyses[s.symbol]?.skills?.technical?.rsi;
        return `${s.symbol} (RSI ${rsi})`;
      }).join(', ')}.`;
    }

    return enhanced;
  }, [insight, signals, indexQuotes, analyses]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="logo">
          <div className="logo-mark">M</div>
          <div className="logo-text">Market<span>Pulse</span></div>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginLeft: 8, background: statusColor + '22', color: statusColor }}>
            {statusText}
          </span>
          {loadingMsg && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 12 }}>{loadingMsg}</span>}
        </div>

        <nav className="nav-tabs">
          {['dashboard', 'screener', 'signals', 'portfolio'].map(tab => (
            <button key={tab} className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)} data-tab={tab}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>

        <button onClick={async () => { await fetchIndexes(); await fetchQuotes(); await fetchCandles(); }}
          style={{ background: 'transparent', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      <main className="app-body">

        {/* ====== DASHBOARD ====== */}
        {activeTab === 'dashboard' && (
          <>
            {/* Index metrics — real ETF data */}
            <div className="metrics-grid">
              {INDEX_ETFS.map((idx, i) => {
                const q = idx.isMock ? null : indexQuotes[idx.ticker];
                const change = q?.changePct || 0;
                const up = q ? change >= 0 : null;
                return (
                  <div key={i} className={`metric-card animate-in ${up === true ? 'up' : up === false ? 'down' : 'neutral'}`} style={{ animationDelay: `${i * 0.06}s` }}>
                    <div className="metric-label">{idx.label}</div>
                    <div className="metric-value">
                      {q ? `$${q.price.toFixed(2)}` : idx.isMock ? '—' : '...'}
                    </div>
                    <div className={`metric-change ${up === true ? 'up' : up === false ? 'down' : ''}`}>
                      {up === true ? '▲' : up === false ? '▼' : '─'} {q ? Math.abs(change).toFixed(2) + '%' : '—'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{idx.sublabel}</div>
                  </div>
                );
              })}
            </div>

            {/* AI Insight */}
            <div className="ai-insight animate-in" style={{ animationDelay: '0.25s' }}>
              <div className="ai-insight-header">
                <div className="ai-pulse" />
                <div className="ai-insight-label">AI market insight — analyzing real market data</div>
              </div>
              <div className="ai-insight-text" dangerouslySetInnerHTML={{ __html: enhancedInsight }} />
            </div>

            {/* Chart + Watchlist */}
            <div className="grid-2-1">
              <div className="card animate-in" style={{ animationDelay: '0.3s' }}>
                <div className="card-header">
                  <span className="card-title">
                    Price action — {selectedStock}
                    {quotes[selectedStock]?.price && <span style={{ marginLeft: 8, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>${quotes[selectedStock].price.toFixed(2)}</span>}
                    {quotes[selectedStock]?.changePct != null && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: quotes[selectedStock].changePct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {quotes[selectedStock].changePct >= 0 ? '▲' : '▼'}{Math.abs(quotes[selectedStock].changePct).toFixed(2)}%
                      </span>
                    )}
                  </span>
                  <span className="badge badge-live">LIVE</span>
                </div>
                <div style={{ position: 'relative', height: 260 }}>
                  {chartData.length > 0 ? <Line data={priceChartConfig} options={priceChartOptions} /> : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
                      {loadingMsg ? `Loading ${selectedStock}...` : 'No data — try refreshing'}
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
                  const signal = analyses[stock.ticker]?.aggregated?.action;
                  return (
                    <div key={stock.ticker} className="wl-item" onClick={() => setSelectedStock(stock.ticker)}>
                      <div className="wl-left">
                        <div className="wl-icon" style={{ background: stock.color + '22', color: stock.color }}>{stock.ticker.slice(0, 2)}</div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="wl-ticker" style={{ fontWeight: selectedStock === stock.ticker ? 700 : 500 }}>{stock.ticker}</span>
                            {signal && (
                              <span style={{ fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)', padding: '1px 4px', borderRadius: 3,
                                background: signal === 'buy' ? 'var(--green-dim)' : signal === 'sell' ? 'var(--red-dim)' : 'var(--accent3-dim)',
                                color: signal === 'buy' ? 'var(--green)' : signal === 'sell' ? 'var(--red)' : 'var(--accent3)'
                              }}>{signal.toUpperCase()}</span>
                            )}
                          </div>
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
                  <span className="badge badge-ai">4 SKILLS</span>
                </div>
                {signals.length > 0 ? signals.map((s, i) => {
                  const tech = analyses[s.symbol]?.skills?.technical;
                  return (
                    <div key={i} className="signal-item">
                      <div className={`signal-dot ${s.action}`} />
                      <div className="signal-ticker">{s.symbol}</div>
                      <div className="signal-text">
                        {tech ? `RSI ${tech.rsi} · ${tech.macdSignal} · ${tech.trend}` : s.reasoning?.slice(0, 60) || 'Analyzing...'}
                      </div>
                      <div className="signal-confidence" style={{
                        color: s.action === 'buy' ? 'var(--green)' : s.action === 'sell' ? 'var(--red)' : 'var(--accent3)'
                      }}>{s.confidence}%</div>
                    </div>
                  );
                }) : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Waiting for data...</div>}
              </div>

              <div className="card animate-in" style={{ animationDelay: '0.45s' }}>
                <div className="card-header"><span className="card-title">Sector performance (today)</span></div>
                {sectorPerformance.length > 0 ? sectorPerformance.map((s, i) => {
                  const up = s.val >= 0;
                  return (
                    <div key={i} className="sector-row">
                      <div className="sector-label">{s.name}</div>
                      <div className="sector-track">
                        <div className="sector-fill" style={{ width: `${Math.min(Math.abs(s.val) / 4 * 100, 100)}%`, background: up ? 'var(--green)' : 'var(--red)' }} />
                      </div>
                      <div className={`sector-val ${up ? 'up' : 'down'}`}>{up ? '+' : ''}{s.val.toFixed(2)}%</div>
                    </div>
                  );
                }) : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading sector data...</div>}
              </div>
            </div>

            {/* News + Volume */}
            <div className="grid-1-1">
              <div className="card animate-in" style={{ animationDelay: '0.5s' }}>
                <div className="card-header">
                  <span className="card-title">News — {selectedStock}</span>
                  <span className="badge badge-live">LIVE</span>
                </div>
                {newsData.length > 0 ? newsData.slice(0, 5).map((article, i) => (
                  <a key={i} href={article.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', padding: '10px 0', borderBottom: '0.5px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3, lineHeight: 1.4 }}>{article.headline}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                      <span>{article.source}</span>
                      <span>·</span>
                      <span>{new Date(article.datetime).toLocaleDateString()}</span>
                      <ExternalLink size={10} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                    </div>
                  </a>
                )) : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading news...</div>}
              </div>

              <div className="card animate-in" style={{ animationDelay: '0.55s' }}>
                <div className="card-header">
                  <span className="card-title">Volume — {selectedStock}</span>
                </div>
                <div style={{ position: 'relative', height: 180 }}>
                  {volData.length > 0 ? <Bar data={volumeChartConfig} options={volumeChartOptions} /> : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
                  )}
                </div>
              </div>
            </div>

            {/* Portfolio ring + AI Chat */}
            <div className="grid-1-1">
              <div className="card animate-in" style={{ animationDelay: '0.6s' }}>
                <div className="card-header"><span className="card-title">Portfolio allocation</span></div>
                <div className="portfolio-layout">
                  <div className="ring-container">
                    <Doughnut data={donutConfig} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1f2a', bodyColor: '#e2e8f0' } } }} />
                    <div className="ring-center-label"><div className="ring-value">$124.8K</div><div className="ring-sub">total value</div></div>
                  </div>
                  <div className="ring-legend">
                    {PORTFOLIO.map((p, i) => (
                      <div key={i} className="leg-item"><div className="leg-swatch" style={{ background: p.color }} /><span>{p.label}</span><span className="leg-pct">{p.val}%</span></div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card animate-in" style={{ animationDelay: '0.65s' }}>
                <div className="card-header">
                  <span className="card-title">AI analyst — powered by Claude</span>
                  <span className="badge" style={{
                    background: backendOnline ? 'var(--green-dim)' : 'var(--red-dim)',
                    color: backendOnline ? 'var(--green)' : 'var(--red)'
                  }}>{backendOnline ? 'ONLINE' : 'OFFLINE'}</span>
                </div>

                {/* Chat history */}
                {chatHistory.length > 0 && (
                  <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 12 }}>
                    {chatHistory.map((msg, i) => (
                      <div key={i} style={{
                        padding: '10px 14px', marginBottom: 6, borderRadius: 'var(--radius-md)',
                        background: msg.role === 'user' ? 'var(--bg-surface2)' : 'transparent',
                        borderLeft: msg.role === 'ai' ? '2px solid var(--accent)' : 'none',
                        fontSize: 13, lineHeight: 1.7
                      }}>
                        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
                          {msg.role === 'user' ? 'YOU' : 'CLAUDE AI'}
                        </div>
                        <div dangerouslySetInnerHTML={{ __html: msg.text }} />
                      </div>
                    ))}
                    {chatLoading && (
                      <div style={{ padding: '10px 14px', borderLeft: '2px solid var(--accent)', fontSize: 13 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>CLAUDE AI</div>
                        <span style={{ color: 'var(--accent)' }}>Analyzing market data...</span>
                      </div>
                    )}
                  </div>
                )}

                {!backendOnline && chatHistory.length === 0 && (
                  <div style={{ padding: '12px', background: 'var(--bg-surface2)', borderRadius: 'var(--radius-md)', marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                    Start the backend server in a separate terminal: <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>node server.js</code>
                  </div>
                )}

                <div className="chat-input-row">
                  <input ref={chatRef} className="chat-input" value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleChat()}
                    placeholder="Should I buy NVDA? What's the riskiest stock? Analyze TSLA..." />
                  <button className="chat-send" onClick={handleChat} disabled={chatLoading}>{chatLoading ? '...' : '↑'}</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ====== SCREENER ====== */}
        {activeTab === 'screener' && (
          <div className="card animate-in">
            <div className="card-header">
              <span className="card-title">Stock screener</span>
              <span className="badge badge-ai">AI-powered</span>
            </div>
            <div className="screener-filters">
              {['All', 'Strong buy', 'Buy', 'Hold', 'Sell', 'Oversold', 'High volume'].map(f => (
                <button key={f} className={`filter-chip ${activeFilter === f ? 'active' : ''}`}
                  onClick={() => setActiveFilter(f)}>{f}</button>
              ))}
            </div>
            {screenerStocks.length > 0 ? (
              <table className="screener-table">
                <thead><tr><th>Symbol</th><th>Price</th><th>Change</th><th>Volume</th><th>RSI</th><th>MACD</th><th>Trend</th><th>AI Signal</th><th>Confidence</th></tr></thead>
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
                      <td className="mono" style={{ color: s.rsi && s.rsi < 30 ? 'var(--green)' : s.rsi && s.rsi > 70 ? 'var(--red)' : 'inherit' }}>{s.rsi || '-'}</td>
                      <td style={{ fontSize: 11, color: s.macd?.includes('bullish') ? 'var(--green)' : 'var(--red)' }}>{s.macd || '-'}</td>
                      <td style={{ fontSize: 11 }}>{s.trend || '-'}</td>
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
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                No stocks match the "{activeFilter}" filter
              </div>
            )}
          </div>
        )}

        {/* ====== SIGNALS ====== */}
        {activeTab === 'signals' && (
          <>
            <div className="ai-insight animate-in">
              <div className="ai-insight-header"><div className="ai-pulse" /><div className="ai-insight-label">AI signal engine — 4 analysis skills</div></div>
              <div className="ai-insight-text" dangerouslySetInnerHTML={{ __html: enhancedInsight }} />
            </div>
            <div className="card animate-in" style={{ animationDelay: '0.1s' }}>
              <div className="card-header"><span className="card-title">Active signals</span><span className="badge badge-ai">TECHNICAL · PATTERN · FUNDAMENTAL · SENTIMENT</span></div>
              {signals.map((s, i) => {
                const analysis = analyses[s.symbol];
                const tech = analysis?.skills?.technical;
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
                        {tech && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            RSI {tech.rsi} · Vol {tech.volumeRatio}x avg
                          </span>
                        )}
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700,
                        color: s.action === 'buy' ? 'var(--green)' : s.action === 'sell' ? 'var(--red)' : 'var(--accent3)' }}>
                        {s.confidence}%
                      </span>
                    </div>
                    {analysis?.skills && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {Object.entries(analysis.skills).map(([skill, result]) => (
                          <span key={skill} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8,
                            background: result.signal === 'buy' ? 'var(--green-dim)' : result.signal === 'sell' ? 'var(--red-dim)' : 'var(--bg-surface2)',
                            color: result.signal === 'buy' ? 'var(--green)' : result.signal === 'sell' ? 'var(--red)' : 'var(--text-muted)' }}>
                            {skill}: {result.signal} ({result.confidence}%)
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{s.reasoning?.slice(0, 150)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ====== PORTFOLIO ====== */}
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
                const price = quotes[s.ticker]?.price || 0;
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
