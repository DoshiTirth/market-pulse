// ============================================
// WatchlistManager — Custom watchlist component
// Search stocks via Finnhub, add/remove tickers,
// saves to localStorage for persistence
// ============================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, X, Star } from 'lucide-react';
import { searchSymbol } from '../services/stockAPI';

// Default watchlist
const DEFAULT_WATCHLIST = [
  { ticker: 'AAPL', name: 'Apple Inc.', color: '#22d3a7' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', color: '#3b82f6' },
  { ticker: 'MSFT', name: 'Microsoft', color: '#f59e0b' },
  { ticker: 'AMZN', name: 'Amazon', color: '#a78bfa' },
  { ticker: 'GOOGL', name: 'Alphabet', color: '#ef4444' },
  { ticker: 'META', name: 'Meta Platforms', color: '#ec4899' },
  { ticker: 'TSLA', name: 'Tesla Inc.', color: '#6366f1' },
];

// Color palette for new stocks
const COLORS = [
  '#22d3a7', '#3b82f6', '#f59e0b', '#a78bfa', '#ef4444',
  '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#8b5cf6',
  '#06b6d4', '#84cc16', '#e879f9', '#fb923c', '#34d399'
];

const STORAGE_KEY = 'marketpulse_watchlist';

/**
 * Load watchlist from localStorage or return defaults
 */
export function loadWatchlist() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_WATCHLIST;
}

/**
 * Save watchlist to localStorage
 */
function saveWatchlist(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) { /* ignore */ }
}

export default function WatchlistManager({
  watchlist,
  setWatchlist,
  quotes,
  analyses,
  selectedStock,
  onSelectStock
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  // Close search when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 1) {
      setSearchResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchSymbol(query);
        setSearchResults(results);
      } catch (e) {
        setSearchResults([]);
      }
      setSearching(false);
    }, 400);
  }, []);

  // Add stock to watchlist
  function addStock(result) {
    const exists = watchlist.find(w => w.ticker === result.symbol);
    if (exists) return;

    const colorIdx = watchlist.length % COLORS.length;
    const newStock = {
      ticker: result.symbol,
      name: result.description || result.symbol,
      color: COLORS[colorIdx]
    };

    const updated = [...watchlist, newStock];
    setWatchlist(updated);
    saveWatchlist(updated);
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  // Remove stock from watchlist
  function removeStock(ticker, e) {
    e.stopPropagation();
    if (watchlist.length <= 1) return; // Keep at least one

    const updated = watchlist.filter(w => w.ticker !== ticker);
    setWatchlist(updated);
    saveWatchlist(updated);

    // If we removed the selected stock, select the first one
    if (selectedStock === ticker && updated.length > 0) {
      onSelectStock(updated[0].ticker);
    }
  }

  // Reset to defaults
  function resetWatchlist() {
    setWatchlist(DEFAULT_WATCHLIST);
    saveWatchlist(DEFAULT_WATCHLIST);
  }

  return (
    <div>
      {/* Header with search button */}
      <div className="card-header" style={{ marginBottom: 4 }}>
        <span className="card-title">Watchlist ({watchlist.length})</span>
        <button onClick={() => setSearchOpen(!searchOpen)}
          style={{
            background: searchOpen ? 'var(--accent-dim)' : 'transparent',
            border: '0.5px solid',
            borderColor: searchOpen ? 'var(--accent)' : 'var(--border)',
            borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            color: searchOpen ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 11, transition: 'all 0.15s'
          }}>
          <Plus size={12} /> Add
        </button>
      </div>

      {/* Search panel */}
      {searchOpen && (
        <div ref={searchRef} style={{ marginBottom: 10, position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
            <input
              autoFocus
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search stocks... (e.g. AAPL, Tesla, Amazon)"
              style={{
                width: '100%', padding: '8px 12px 8px 32px',
                background: 'var(--bg-surface2)', border: '0.5px solid var(--border)',
                borderRadius: 8, color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none'
              }}
            />
          </div>

          {/* Search results dropdown */}
          {(searchResults.length > 0 || searching) && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              background: 'var(--bg-surface)', border: '0.5px solid var(--border)',
              borderRadius: 8, marginTop: 4, maxHeight: 250, overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
            }}>
              {searching && (
                <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                  Searching...
                </div>
              )}
              {searchResults.map((result, i) => {
                const alreadyAdded = watchlist.find(w => w.ticker === result.symbol);
                return (
                  <div key={i} onClick={() => !alreadyAdded && addStock(result)}
                    style={{
                      padding: '10px 14px', cursor: alreadyAdded ? 'default' : 'pointer',
                      borderBottom: '0.5px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      opacity: alreadyAdded ? 0.5 : 1,
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => { if (!alreadyAdded) e.target.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.target.style.background = 'transparent'; }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', marginRight: 8 }}>{result.symbol}</span>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{result.description}</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                        {result.type} · {result.displaySymbol}
                      </div>
                    </div>
                    {alreadyAdded ? (
                      <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>ADDED</span>
                    ) : (
                      <Plus size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    )}
                  </div>
                );
              })}
              {!searching && searchQuery.length >= 1 && searchResults.length === 0 && (
                <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                  No results for "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stock list */}
      {watchlist.map((stock) => {
        const quote = quotes[stock.ticker];
        const price = quote?.price || 0;
        const change = quote?.changePct || 0;
        const up = change >= 0;
        const signal = analyses[stock.ticker]?.aggregated?.action;

        return (
          <div key={stock.ticker} className="wl-item" onClick={() => onSelectStock(stock.ticker)}
            style={{ position: 'relative' }}>
            <div className="wl-left">
              <div className="wl-icon" style={{ background: stock.color + '22', color: stock.color }}>
                {stock.ticker.slice(0, 2)}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="wl-ticker" style={{ fontWeight: selectedStock === stock.ticker ? 700 : 500 }}>
                    {stock.ticker}
                  </span>
                  {signal && (
                    <span style={{
                      fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
                      padding: '1px 4px', borderRadius: 3,
                      background: signal === 'buy' ? 'var(--green-dim)' : signal === 'sell' ? 'var(--red-dim)' : 'var(--accent3-dim)',
                      color: signal === 'buy' ? 'var(--green)' : signal === 'sell' ? 'var(--red)' : 'var(--accent3)'
                    }}>{signal.toUpperCase()}</span>
                  )}
                </div>
                <div className="wl-name">{stock.name}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="wl-price">
                <div>{price > 0 ? `$${price.toFixed(2)}` : '...'}</div>
                <div className="wl-pct" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
                  {price > 0 ? `${up ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%` : ''}
                </div>
              </div>
              {/* Remove button */}
              <button onClick={(e) => removeStock(stock.ticker, e)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--text-faint)', padding: 4, borderRadius: 4,
                  display: 'flex', alignItems: 'center', opacity: 0.4,
                  transition: 'opacity 0.15s'
                }}
                onMouseEnter={e => e.target.style.opacity = 1}
                onMouseLeave={e => e.target.style.opacity = 0.4}
                title={`Remove ${stock.ticker}`}>
                <X size={12} />
              </button>
            </div>
          </div>
        );
      })}

      {/* Reset link */}
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <button onClick={resetWatchlist}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-faint)', fontSize: 10, fontFamily: 'var(--font-mono)',
            padding: '4px 8px'
          }}>
          RESET TO DEFAULTS
        </button>
      </div>
    </div>
  );
}
