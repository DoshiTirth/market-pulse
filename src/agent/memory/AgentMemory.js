// Agent Memory — Stores analysis history and context
// Enables the agent to reference past analyses

export default class AgentMemory {
  constructor() {
    this.store_data = new Map(); // symbol -> analysis history
    this.maxPerSymbol = 30;     // Keep last 30 analyses per symbol
  }

  store(symbol, analysis) {
    if (!this.store_data.has(symbol)) {
      this.store_data.set(symbol, []);
    }
    const history = this.store_data.get(symbol);
    history.push({
      ...analysis,
      storedAt: Date.now()
    });

    // Trim old entries
    if (history.length > this.maxPerSymbol) {
      history.splice(0, history.length - this.maxPerSymbol);
    }
  }

  getContext(symbol) {
    const history = this.store_data.get(symbol) || [];
    if (history.length === 0) return null;

    const recent = history.slice(-5);
    const signals = recent.map(h => h.aggregated?.action).filter(Boolean);

    return {
      analysisCount: history.length,
      recentSignals: signals,
      signalTrend: this.detectSignalTrend(signals),
      lastAnalysis: recent[recent.length - 1],
      avgConfidence: recent.reduce((sum, h) =>
        sum + (h.aggregated?.confidence || 50), 0) / recent.length
    };
  }

  detectSignalTrend(signals) {
    if (signals.length < 2) return 'insufficient';

    const latest = signals.slice(-3);
    const buyCount = latest.filter(s => s === 'buy').length;
    const sellCount = latest.filter(s => s === 'sell').length;

    if (buyCount >= 2) return 'improving';
    if (sellCount >= 2) return 'deteriorating';
    return 'mixed';
  }

  getAll() {
    const result = {};
    for (const [symbol, history] of this.store_data) {
      result[symbol] = history;
    }
    return result;
  }

  clear(symbol) {
    if (symbol) {
      this.store_data.delete(symbol);
    } else {
      this.store_data.clear();
    }
  }
}
