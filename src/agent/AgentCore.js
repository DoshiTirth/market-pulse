// StockSage AI — Agent Core
// Modular AI agent with pluggable skill system
// This is the brain of the application

import TechnicalSkill from './skills/TechnicalSkill';
import PatternSkill from './skills/PatternSkill';
import FundamentalSkill from './skills/FundamentalSkill';
import SentimentSkill from './skills/SentimentSkill';
import AgentMemory from './memory/AgentMemory';

class AgentCore {
  constructor() {
    this.skills = new Map();
    this.memory = new AgentMemory();
    this.analysisHistory = [];

    // Register default skills
    this.registerSkill(new TechnicalSkill());
    this.registerSkill(new PatternSkill());
    this.registerSkill(new FundamentalSkill());
    this.registerSkill(new SentimentSkill());
  }

  /**
   * Register a new skill module
   */
  registerSkill(skill) {
    this.skills.set(skill.name, skill);
    console.log(`[Agent] Skill registered: ${skill.name}`);
  }

  /**
   * Remove a skill module
   */
  unregisterSkill(name) {
    this.skills.delete(name);
  }

  /**
   * Run full analysis on a stock using all skills
   */
  async analyzeStock(symbol, stockData, fundamentals = null) {
    const results = {};
    const startTime = Date.now();

    for (const [name, skill] of this.skills) {
      try {
        results[name] = await skill.analyze(stockData, {
          symbol,
          fundamentals,
          memory: this.memory.getContext(symbol)
        });
      } catch (err) {
        console.error(`[Agent] Skill "${name}" failed:`, err.message);
        results[name] = { error: err.message };
      }
    }

    // Aggregate signals from all skills
    const aggregated = this.aggregateSignals(results);

    // Store in memory
    const analysis = {
      symbol,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      skills: results,
      aggregated
    };

    this.memory.store(symbol, analysis);
    this.analysisHistory.push(analysis);

    return analysis;
  }

  /**
   * Aggregate signals from multiple skills into a unified recommendation
   */
  aggregateSignals(skillResults) {
    let totalScore = 0;
    let totalWeight = 0;
    const signals = [];
    const reasonings = [];

    for (const [skillName, result] of Object.entries(skillResults)) {
      if (result.error) continue;

      const weight = this.getSkillWeight(skillName);
      const signalScore = result.signal === 'buy' ? 1
        : result.signal === 'sell' ? -1 : 0;

      totalScore += signalScore * (result.confidence / 100) * weight;
      totalWeight += weight;

      signals.push({
        skill: skillName,
        signal: result.signal,
        confidence: result.confidence,
        weight
      });

      if (result.reasoning) {
        reasonings.push(`[${skillName}] ${result.reasoning}`);
      }
    }

    const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    let action, confidence;
    if (normalizedScore > 0.25) {
      action = 'buy';
      confidence = Math.min(Math.round(normalizedScore * 100), 99);
    } else if (normalizedScore < -0.25) {
      action = 'sell';
      confidence = Math.min(Math.round(Math.abs(normalizedScore) * 100), 99);
    } else {
      action = 'hold';
      confidence = Math.round((1 - Math.abs(normalizedScore)) * 60 + 20);
    }

    return {
      action,
      confidence,
      score: parseFloat(normalizedScore.toFixed(3)),
      signals,
      reasoning: reasonings.join(' | ')
    };
  }

  /**
   * Skill weights — adjust these to tune the agent
   */
  getSkillWeight(skillName) {
    const weights = {
      'technical': 0.35,
      'pattern': 0.25,
      'fundamental': 0.25,
      'sentiment': 0.15
    };
    return weights[skillName] || 0.1;
  }

  /**
   * Generate market-wide insight from multiple stock analyses
   */
  generateMarketInsight(analyses) {
    const buys = analyses.filter(a => a.aggregated.action === 'buy');
    const sells = analyses.filter(a => a.aggregated.action === 'sell');
    const holds = analyses.filter(a => a.aggregated.action === 'hold');

    let insight = '';

    // Market bias
    if (buys.length > sells.length * 1.5) {
      insight += `Market bias is bullish — ${buys.length} of ${analyses.length} stocks signal buy. `;
    } else if (sells.length > buys.length * 1.5) {
      insight += `Caution: bearish bias detected — ${sells.length} of ${analyses.length} stocks showing sell signals. `;
    } else {
      insight += `Mixed signals across the market — ${buys.length} buys, ${sells.length} sells, ${holds.length} holds. `;
    }

    // Top picks
    if (buys.length > 0) {
      const topPicks = buys
        .sort((a, b) => b.aggregated.confidence - a.aggregated.confidence)
        .slice(0, 3);
      insight += `Top picks: ${topPicks.map(p => `${p.symbol} (${p.aggregated.confidence}% confidence)`).join(', ')}. `;
    }

    // Risk warnings
    if (sells.length > 0) {
      const topRisks = sells
        .sort((a, b) => b.aggregated.confidence - a.aggregated.confidence)
        .slice(0, 2);
      insight += `Consider reducing: ${topRisks.map(r => r.symbol).join(', ')}. `;
    }

    return insight;
  }

  /**
   * Natural language query handler
   * Parses user questions and routes to appropriate skills
   */
  async handleQuery(query, availableData) {
    const lowerQuery = query.toLowerCase();

    // Detect intent
    const intents = {
      shouldBuy: /should i (buy|get|invest|pick up)/i.test(query),
      shouldSell: /should i (sell|dump|exit|close)/i.test(query),
      analysis: /analy[sz]e|what do you think|outlook|forecast/i.test(query),
      compare: /compare|versus|vs|better/i.test(query),
      risk: /risk|danger|safe|volatile/i.test(query),
      technicals: /rsi|macd|moving average|technical|chart|pattern/i.test(query),
      fundamentals: /pe ratio|earnings|revenue|fundamental|valuation/i.test(query),
      portfolio: /portfolio|allocation|rebalance|diversif/i.test(query)
    };

    // Extract ticker symbols from query
    const tickerMatch = query.match(/\b[A-Z]{1,5}\b/g);
    const tickers = tickerMatch ? tickerMatch.filter(t =>
      !['I', 'A', 'THE', 'AND', 'OR', 'AT', 'FOR', 'IS', 'IT', 'MY', 'DO', 'IF'].includes(t)
    ) : [];

    let response = '';

    if (tickers.length > 0 && availableData[tickers[0]]) {
      const data = availableData[tickers[0]];
      const analysis = await this.analyzeStock(tickers[0], data);
      const agg = analysis.aggregated;

      if (intents.shouldBuy) {
        response = this.formatBuyAdvice(tickers[0], analysis);
      } else if (intents.shouldSell) {
        response = this.formatSellAdvice(tickers[0], analysis);
      } else if (intents.risk) {
        response = this.formatRiskAssessment(tickers[0], analysis);
      } else {
        response = this.formatFullAnalysis(tickers[0], analysis);
      }
    } else if (intents.portfolio) {
      response = this.formatPortfolioAdvice(availableData);
    } else {
      response = `I can analyze any stock for you. Try asking about a specific ticker like "Should I buy NVDA?" or "Analyze AAPL for me." I'll run my full analysis pipeline including technical indicators, pattern recognition, and fundamental analysis.`;
    }

    return response;
  }

  formatBuyAdvice(symbol, analysis) {
    const { action, confidence, signals } = analysis.aggregated;
    const tech = analysis.skills.technical || {};
    const pattern = analysis.skills.pattern || {};

    let response = `<strong>${symbol} buy analysis (${confidence}% confidence):</strong> `;

    if (action === 'buy') {
      response += `Signals lean bullish. `;
      if (tech.rsi) response += `RSI at ${tech.rsi} — ${tech.rsi < 30 ? 'oversold territory, good entry' : tech.rsi < 50 ? 'below midline, room to run' : 'approaching overbought, partial position recommended'}. `;
      if (tech.macdSignal) response += `MACD ${tech.macdSignal}. `;
      response += `<strong>Recommendation:</strong> Consider a position with a trailing stop at ${tech.atr ? Math.round(tech.atr * 2) + '% below entry' : '8% below entry'}. `;
    } else if (action === 'sell') {
      response += `Signals are bearish — <strong>not recommended to buy at current levels.</strong> `;
      response += `Wait for a pullback to stronger support before entering. `;
    } else {
      response += `Mixed signals suggest waiting. Set a price alert and enter on confirmed breakout with volume. `;
    }

    return response;
  }

  formatSellAdvice(symbol, analysis) {
    const { action, confidence } = analysis.aggregated;
    const tech = analysis.skills.technical || {};

    let response = `<strong>${symbol} exit analysis:</strong> `;

    if (action === 'sell') {
      response += `Multiple indicators confirm selling pressure (${confidence}% confidence). `;
      if (tech.rsi > 70) response += `RSI in overbought territory at ${tech.rsi}. `;
      response += `<strong>Consider taking profits or tightening stops.</strong>`;
    } else if (action === 'buy') {
      response += `Indicators are still bullish — hold your position. Consider trailing stops rather than exiting. `;
    } else {
      response += `Momentum is neutral. If you have profits, consider selling half and holding the rest with a stop-loss. `;
    }

    return response;
  }

  formatRiskAssessment(symbol, analysis) {
    const tech = analysis.skills.technical || {};
    const pattern = analysis.skills.pattern || {};

    let response = `<strong>${symbol} risk assessment:</strong> `;
    if (tech.volatility) {
      response += `Volatility is ${tech.volatility > 2 ? 'HIGH' : tech.volatility > 1 ? 'moderate' : 'low'} (ATR-based). `;
    }
    if (tech.rsi) {
      if (tech.rsi > 75) response += `RSI at ${tech.rsi} signals overbought risk. `;
      else if (tech.rsi < 25) response += `RSI at ${tech.rsi} — deeply oversold, risk of continued decline but also bounce potential. `;
    }
    if (pattern.patterns && pattern.patterns.length > 0) {
      response += `Detected patterns: ${pattern.patterns.join(', ')}. `;
    }

    return response;
  }

  formatFullAnalysis(symbol, analysis) {
    const { action, confidence } = analysis.aggregated;
    const tech = analysis.skills.technical || {};

    let response = `<strong>${symbol} full analysis — ${action.toUpperCase()} (${confidence}%):</strong> `;
    if (tech.rsi) response += `RSI: ${tech.rsi}. `;
    if (tech.macdSignal) response += `MACD: ${tech.macdSignal}. `;
    if (tech.trend) response += `Trend: ${tech.trend}. `;
    response += analysis.aggregated.reasoning || '';
    return response;
  }

  formatPortfolioAdvice(availableData) {
    return `<strong>Portfolio insight:</strong> Review your sector allocation — ensure no single sector exceeds 35% of holdings. Consider rebalancing if tech is overweight. Keep 5-10% cash for buying opportunities during pullbacks.`;
  }

  /**
   * Get analysis history
   */
  getHistory() {
    return this.analysisHistory.slice(-50);
  }

  /**
   * List registered skills
   */
  listSkills() {
    return Array.from(this.skills.entries()).map(([name, skill]) => ({
      name,
      description: skill.description
    }));
  }
}

// Export singleton
const agent = new AgentCore();
export default agent;
