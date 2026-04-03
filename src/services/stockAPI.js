// ============================================
// StockSage AI — Market Data Service (Finnhub)
// REST API + WebSocket real-time streaming
// Free tier: 60 calls/min
// ============================================

import axios from 'axios';

const FH_BASE = 'https://finnhub.io/api/v1';
const FH_KEY = process.env.REACT_APP_FINNHUB_KEY;

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Rate-limit-safe delay — 60 calls/min means 1 per second to be safe
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get current quote for a symbol
 */
export async function getQuote(symbol) {
  const cacheKey = `quote:${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(`${FH_BASE}/quote`, {
      params: { symbol, token: FH_KEY }
    });

    if (!data || data.c === 0) {
      console.warn(`[API] No quote data for ${symbol}`);
      return null;
    }

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
    console.error(`[API] Quote failed for ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Get daily candle data (historical)
 * Uses from/to unix timestamps
 */
export async function getDaily(symbol, days = 100) {
  const cacheKey = `daily:${symbol}:${days}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - (days * 24 * 60 * 60);

    console.log(`[API] Fetching daily candles for ${symbol} (${days} days)...`);

    const { data } = await axios.get(`${FH_BASE}/stock/candle`, {
      params: {
        symbol,
        resolution: 'D',
        from,
        to: now,
        token: FH_KEY
      }
    });

    console.log(`[API] Candle response for ${symbol}: status=${data?.s}, points=${data?.c?.length || 0}`);

    if (!data || data.s === 'no_data' || !data.c) {
      console.warn(`[API] No candle data for ${symbol}`);
      return [];
    }

    const result = [];
    for (let i = 0; i < data.c.length; i++) {
      result.push({
        date: new Date(data.t[i] * 1000).toISOString().split('T')[0],
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v[i]
      });
    }

    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`[API] Daily candles failed for ${symbol}:`, err.response?.status, err.message);
    return [];
  }
}

/**
 * Get company profile (fundamentals)
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
      industry: profile.finnhubIndustry,
      marketCap: profile.marketCapitalization * 1e6,
      logo: profile.logo,
      weburl: profile.weburl,
      peRatio: m.peNormalizedAnnual || m.peBasicExclExtraTTM || null,
      eps: m.epsNormalizedAnnual || null,
      dividendYield: m.dividendYieldIndicatedAnnual || null,
      beta: m.beta || null,
      fiftyTwoWeekHigh: m['52WeekHigh'],
      fiftyTwoWeekLow: m['52WeekLow'],
      movingAvg50: m['50DayMovingAverage'] || null,
      movingAvg200: m['200DayMovingAverage'] || null,
      profitMargin: m.netProfitMarginTTM ? m.netProfitMarginTTM / 100 : null,
      revenueGrowth: m.revenueGrowthQuarterlyYoy ? m.revenueGrowthQuarterlyYoy / 100 : null
    };

    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`[API] Overview failed for ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Batch quotes for multiple symbols — with proper rate limiting
 */
export async function getBatchQuotes(symbols) {
  const results = [];
  for (const symbol of symbols) {
    const quote = await getQuote(symbol);
    if (quote) results.push(quote);
    await delay(1100); // 1.1 seconds between calls to stay safe
  }
  return results;
}

/**
 * Batch daily candles — with proper rate limiting
 */
export async function getBatchDaily(symbols, days = 100) {
  const results = {};
  for (const symbol of symbols) {
    const daily = await getDaily(symbol, days);
    if (daily.length > 0) results[symbol] = daily;
    await delay(1100);
  }
  return results;
}

/**
 * Get company news
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
      datetime: new Date(article.datetime * 1000).toISOString()
    }));

    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`[API] News failed for ${symbol}:`, err.message);
    return [];
  }
}

/**
 * Search for stock symbols
 */
export async function searchSymbol(query) {
  try {
    const { data } = await axios.get(`${FH_BASE}/search`, {
      params: { q: query, token: FH_KEY }
    });
    return (data.result || []).filter(r => r.type === 'Common Stock').slice(0, 8);
  } catch (err) {
    console.error('[API] Symbol search failed:', err.message);
    return [];
  }
}

/**
 * WebSocket connection for real-time Finnhub data
 */
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
        } catch (err) {
          // ignore
        }
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
