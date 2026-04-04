// ============================================
// StockSage AI — Market Data Service
// Finnhub: real-time quotes + WebSocket + news
// Yahoo Finance: historical candle data (free)
// ============================================

import axios from 'axios';

const FH_BASE = 'https://finnhub.io/api/v1';
const FH_KEY = process.env.REACT_APP_FINNHUB_KEY;

// Yahoo Finance proxy (CORS-friendly)
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Cache
const cache = new Map();
const CACHE_TTL = 2 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
  return null;
}
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// FINNHUB — Quotes, News, WebSocket
// ========================================

/**
 * Get current quote for a symbol (Finnhub)
 */
export async function getQuote(symbol) {
  const cacheKey = `quote:${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(`${FH_BASE}/quote`, {
      params: { symbol, token: FH_KEY }
    });

    if (!data || data.c === 0) return null;

    const result = {
      symbol,
      price: data.c,
      open: data.o,
      high: data.h,
      low: data.l,
      change: data.d,
      changePct: data.dp,
      prevClose: data.pc,
      timestamp: data.t
    };

    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`[Finnhub] Quote failed for ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Get company profile (Finnhub)
 */
export async function getOverview(symbol) {
  const cacheKey = `overview:${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const { data: profile } = await axios.get(`${FH_BASE}/stock/profile2`, {
      params: { symbol, token: FH_KEY }
    });

    await delay(1100);

    const { data: metrics } = await axios.get(`${FH_BASE}/stock/metric`, {
      params: { symbol, metric: 'all', token: FH_KEY }
    });

    const m = metrics.metric || {};

    const result = {
      symbol: profile.ticker,
      name: profile.name,
      sector: profile.finnhubIndustry,
      marketCap: profile.marketCapitalization * 1e6,
      logo: profile.logo,
      peRatio: m.peNormalizedAnnual || null,
      eps: m.epsNormalizedAnnual || null,
      dividendYield: m.dividendYieldIndicatedAnnual || null,
      beta: m.beta || null,
      fiftyTwoWeekHigh: m['52WeekHigh'],
      fiftyTwoWeekLow: m['52WeekLow'],
      profitMargin: m.netProfitMarginTTM ? m.netProfitMarginTTM / 100 : null,
      revenueGrowth: m.revenueGrowthQuarterlyYoy ? m.revenueGrowthQuarterlyYoy / 100 : null
    };

    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`[Finnhub] Overview failed for ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Get company news (Finnhub)
 */
export async function getNews(symbol, daysBack = 7) {
  const cacheKey = `news:${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const { data } = await axios.get(`${FH_BASE}/company-news`, {
      params: { symbol, from: fromDate, to, token: FH_KEY }
    });

    const result = (data || []).slice(0, 10).map(article => ({
      headline: article.headline,
      summary: article.summary,
      source: article.source,
      url: article.url,
      image: article.image,
      datetime: new Date(article.datetime * 1000).toISOString()
    }));

    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`[Finnhub] News failed for ${symbol}:`, err.message);
    return [];
  }
}

/**
 * Batch quotes (Finnhub)
 */
export async function getBatchQuotes(symbols) {
  const results = [];
  for (const symbol of symbols) {
    const quote = await getQuote(symbol);
    if (quote) results.push(quote);
    await delay(1100);
  }
  return results;
}

// ========================================
// YAHOO FINANCE — Historical Candle Data
// ========================================

/**
 * Get daily candle data from Yahoo Finance (free, no API key needed)
 */
export async function getDaily(symbol, days = 100) {
  const cacheKey = `daily:${symbol}:${days}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    console.log(`[Yahoo] Fetching daily candles for ${symbol}...`);

    // Yahoo Finance chart API
    const period1 = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
    const period2 = Math.floor(Date.now() / 1000);

    const { data } = await axios.get(`${YAHOO_BASE}/${symbol}`, {
      params: {
        period1,
        period2,
        interval: '1d',
        includePrePost: false
      }
    });

    const chart = data?.chart?.result?.[0];
    if (!chart || !chart.timestamp) {
      console.warn(`[Yahoo] No data for ${symbol}`);
      return [];
    }

    const timestamps = chart.timestamp;
    const quote = chart.indicators.quote[0];

    const result = [];
    for (let i = 0; i < timestamps.length; i++) {
      // Skip days with null data (holidays etc)
      if (quote.close[i] == null) continue;
      result.push({
        date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        open: parseFloat((quote.open[i] || 0).toFixed(2)),
        high: parseFloat((quote.high[i] || 0).toFixed(2)),
        low: parseFloat((quote.low[i] || 0).toFixed(2)),
        close: parseFloat((quote.close[i] || 0).toFixed(2)),
        volume: quote.volume[i] || 0
      });
    }

    console.log(`[Yahoo] Got ${result.length} candles for ${symbol}`);
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    // If Yahoo direct fails, try via a CORS proxy
    console.warn(`[Yahoo] Direct failed for ${symbol}, trying proxy...`);
    return getDailyViaProxy(symbol, days);
  }
}

/**
 * Fallback: Yahoo via CORS proxy
 */
async function getDailyViaProxy(symbol, days) {
  try {
    const period1 = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
    const period2 = Math.floor(Date.now() / 1000);

    const url = `${YAHOO_BASE}/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
    const { data } = await axios.get(`https://corsproxy.io/?${encodeURIComponent(url)}`);

    const chart = data?.chart?.result?.[0];
    if (!chart || !chart.timestamp) return [];

    const timestamps = chart.timestamp;
    const quote = chart.indicators.quote[0];

    const result = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close[i] == null) continue;
      result.push({
        date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        open: parseFloat((quote.open[i] || 0).toFixed(2)),
        high: parseFloat((quote.high[i] || 0).toFixed(2)),
        low: parseFloat((quote.low[i] || 0).toFixed(2)),
        close: parseFloat((quote.close[i] || 0).toFixed(2)),
        volume: quote.volume[i] || 0
      });
    }

    console.log(`[Yahoo Proxy] Got ${result.length} candles for ${symbol}`);

    const cacheKey = `daily:${symbol}:${days}`;
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`[Yahoo Proxy] Also failed for ${symbol}:`, err.message);
    return [];
  }
}

/**
 * Batch daily candles
 */
export async function getBatchDaily(symbols, days = 100) {
  const results = {};
  for (const symbol of symbols) {
    const daily = await getDaily(symbol, days);
    if (daily.length > 0) results[symbol] = daily;
    await delay(500); // Yahoo is more lenient on rate limits
  }
  return results;
}

/**
 * Search for stock symbols (Finnhub)
 */
export async function searchSymbol(query) {
  try {
    const { data } = await axios.get(`${FH_BASE}/search`, {
      params: { q: query, token: FH_KEY }
    });
    return (data.result || []).filter(r => r.type === 'Common Stock').slice(0, 8);
  } catch (err) {
    console.error('[Finnhub] Search failed:', err.message);
    return [];
  }
}

/**
 * Get intraday data (5min candles) from Yahoo Finance
 */
export async function getIntraday(symbol) {
  const cacheKey = `intraday:${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    console.log(`[Yahoo] Fetching intraday for ${symbol}...`);

    const url = `${YAHOO_BASE}/${symbol}?interval=5m&range=1d&includePrePost=false`;
    let data;

    try {
      const resp = await axios.get(url);
      data = resp.data;
    } catch {
      const resp = await axios.get(`https://corsproxy.io/?${encodeURIComponent(url)}`);
      data = resp.data;
    }

    const chart = data?.chart?.result?.[0];
    if (!chart || !chart.timestamp) return [];

    const timestamps = chart.timestamp;
    const quote = chart.indicators.quote[0];

    const result = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close[i] == null) continue;
      const time = new Date(timestamps[i] * 1000);
      result.push({
        date: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        open: parseFloat((quote.open[i] || 0).toFixed(2)),
        high: parseFloat((quote.high[i] || 0).toFixed(2)),
        low: parseFloat((quote.low[i] || 0).toFixed(2)),
        close: parseFloat((quote.close[i] || 0).toFixed(2)),
        volume: quote.volume[i] || 0
      });
    }

    console.log(`[Yahoo] Got ${result.length} intraday candles for ${symbol}`);
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`[Yahoo] Intraday failed for ${symbol}:`, err.message);
    return [];
  }
}

// ========================================
// WEBSOCKET — Real-time Finnhub Streaming
// ========================================

export class RealtimeStream {
  constructor(onTrade) {
    this.ws = null;
    this.onTrade = onTrade;
    this.subscriptions = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnects = 10;
  }

  connect() {
    if (!FH_KEY) {
      console.warn('[WS] No Finnhub key — streaming disabled');
      return;
    }

    try {
      this.ws = new WebSocket(`wss://ws.finnhub.io?token=${FH_KEY}`);

      this.ws.onopen = () => {
        console.log('[WS] Connected to Finnhub');
        this.reconnectAttempts = 0;
        this.subscriptions.forEach(symbol => {
          this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'trade' && msg.data) {
            msg.data.forEach(trade => {
              this.onTrade({
                symbol: trade.s,
                price: trade.p,
                volume: trade.v,
                timestamp: trade.t
              });
            });
          }
        } catch (err) { /* ignore */ }
      };

      this.ws.onclose = () => {
        if (this.reconnectAttempts < this.maxReconnects) {
          this.reconnectAttempts++;
          const wait = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          console.log(`[WS] Reconnecting in ${wait / 1000}s...`);
          setTimeout(() => this.connect(), wait);
        }
      };

      this.ws.onerror = (err) => console.error('[WS] Error:', err);
    } catch (err) {
      console.error('[WS] Connection failed:', err);
    }
  }

  subscribe(symbol) {
    this.subscriptions.add(symbol);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
  }

  unsubscribe(symbol) {
    this.subscriptions.delete(symbol);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
    }
  }

  disconnect() {
    this.maxReconnects = 0;
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
