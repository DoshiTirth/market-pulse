// ============================================
// useStockData — React hook for fetching market data
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { getQuote, getDaily, getOverview, getBatchQuotes } from '../services/stockAPI';

export function useStockData(symbols = []) {
  const [quotes, setQuotes] = useState({});
  const [dailyData, setDailyData] = useState({});
  const [overviews, setOverviews] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch quotes for all symbols
      const quoteResults = await getBatchQuotes(symbols);
      const quoteMap = {};
      quoteResults.forEach(q => { if (q) quoteMap[q.symbol] = q; });
      setQuotes(quoteMap);

      // Fetch daily data (with delays for rate limiting)
      const dailyMap = {};
      for (const symbol of symbols.slice(0, 5)) { // Limit to 5 for free API
        const data = await getDaily(symbol);
        if (data.length > 0) dailyMap[symbol] = data;
        await new Promise(r => setTimeout(r, 500));
      }
      setDailyData(dailyMap);

      // Fetch overviews
      const overviewMap = {};
      for (const symbol of symbols.slice(0, 3)) { // Limit for rate
        const overview = await getOverview(symbol);
        if (overview) overviewMap[symbol] = overview;
        await new Promise(r => setTimeout(r, 500));
      }
      setOverviews(overviewMap);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [symbols.join(',')]);

  useEffect(() => {
    if (symbols.length > 0) fetchAll();
  }, [fetchAll]);

  return { quotes, dailyData, overviews, loading, error, refresh: fetchAll };
}
