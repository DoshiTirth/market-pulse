// ============================================
// Skill: Technical Analysis
// Analyzes price data using RSI, MACD, SMA, Bollinger Bands, ATR
// ============================================

import { calcRSI, calcMACD, calcSMA, calcEMA, calcBollingerBands, calcATR } from '../../utils/indicators';

export default class TechnicalSkill {
  name = 'technical';
  description = 'Analyzes price action using RSI, MACD, moving averages, Bollinger Bands, and ATR';

  async analyze(stockData, context) {
    const closes = stockData.map(d => d.close);
    const highs = stockData.map(d => d.high);
    const lows = stockData.map(d => d.low);
    const volumes = stockData.map(d => d.volume);

    if (closes.length < 26) {
      return { signal: 'hold', confidence: 30, reasoning: 'Insufficient data for technical analysis' };
    }

    // Calculate indicators
    const rsiValues = calcRSI(closes);
    const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50;

    const { macdLine, signalLine, histogram } = calcMACD(closes);
    const macdCurrent = macdLine[macdLine.length - 1] || 0;
    const signalCurrent = signalLine[signalLine.length - 1] || 0;
    const histCurrent = histogram[histogram.length - 1] || 0;
    const histPrev = histogram.length > 1 ? histogram[histogram.length - 2] : 0;

    const sma20 = calcSMA(closes, 20);
    const sma50 = calcSMA(closes, Math.min(50, closes.length));
    const ema12 = calcEMA(closes, 12);

    const bollinger = calcBollingerBands(closes);
    const currentPrice = closes[closes.length - 1];
    const bbUpper = bollinger.upper[bollinger.upper.length - 1];
    const bbLower = bollinger.lower[bollinger.lower.length - 1];
    const bbMiddle = bollinger.middle[bollinger.middle.length - 1];

    const atr = calcATR(highs, lows, closes);
    const currentATR = atr[atr.length - 1] || 0;

    // Score system: -100 to +100
    let score = 0;
    const reasons = [];

    // RSI scoring
    if (rsi < 30) { score += 25; reasons.push(`RSI oversold at ${rsi}`); }
    else if (rsi < 40) { score += 12; reasons.push(`RSI low at ${rsi}`); }
    else if (rsi > 70) { score -= 25; reasons.push(`RSI overbought at ${rsi}`); }
    else if (rsi > 60) { score -= 8; reasons.push(`RSI elevated at ${rsi}`); }

    // MACD scoring
    if (macdCurrent > signalCurrent && histCurrent > histPrev) {
      score += 20;
      reasons.push('MACD bullish crossover with rising histogram');
    } else if (macdCurrent > signalCurrent) {
      score += 10;
      reasons.push('MACD above signal line');
    } else if (macdCurrent < signalCurrent && histCurrent < histPrev) {
      score -= 20;
      reasons.push('MACD bearish crossover with falling histogram');
    } else if (macdCurrent < signalCurrent) {
      score -= 10;
      reasons.push('MACD below signal line');
    }

    // Moving average scoring
    const currentSMA20 = sma20[sma20.length - 1];
    const currentSMA50 = sma50[sma50.length - 1];

    if (currentSMA20 && currentPrice > currentSMA20) {
      score += 10;
      reasons.push('Price above 20 SMA');
    } else if (currentSMA20) {
      score -= 10;
      reasons.push('Price below 20 SMA');
    }

    if (currentSMA50 && currentSMA20 && currentSMA20 > currentSMA50) {
      score += 10;
      reasons.push('Golden cross (20 SMA > 50 SMA)');
    } else if (currentSMA50 && currentSMA20 && currentSMA20 < currentSMA50) {
      score -= 10;
      reasons.push('Death cross (20 SMA < 50 SMA)');
    }

    // Bollinger Bands scoring
    if (bbLower && currentPrice < bbLower) {
      score += 15;
      reasons.push('Price below lower Bollinger Band — potential bounce');
    } else if (bbUpper && currentPrice > bbUpper) {
      score -= 15;
      reasons.push('Price above upper Bollinger Band — potential pullback');
    }

    // Volume confirmation
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const latestVolume = volumes[volumes.length - 1];
    if (latestVolume > avgVolume * 1.5 && score > 0) {
      score += 10;
      reasons.push('Bullish move confirmed by above-average volume');
    } else if (latestVolume > avgVolume * 1.5 && score < 0) {
      score -= 10;
      reasons.push('Selling pressure confirmed by high volume');
    }

    // Trend detection
    const trend = currentSMA20 && currentSMA50
      ? (currentSMA20 > currentSMA50 ? 'uptrend' : 'downtrend')
      : 'unclear';

    // Determine signal
    let signal, confidence;
    if (score >= 25) {
      signal = 'buy';
      confidence = Math.min(Math.round(50 + score * 0.5), 99);
    } else if (score <= -25) {
      signal = 'sell';
      confidence = Math.min(Math.round(50 + Math.abs(score) * 0.5), 99);
    } else {
      signal = 'hold';
      confidence = Math.round(50 + Math.abs(score) * 0.3);
    }

    const macdSignal = macdCurrent > signalCurrent
      ? 'bullish crossover'
      : 'bearish crossover';

    return {
      signal,
      confidence,
      reasoning: reasons.join('. '),
      rsi: Math.round(rsi),
      macdSignal,
      trend,
      volatility: currentATR ? parseFloat((currentATR / currentPrice * 100).toFixed(2)) : null,
      atr: currentATR ? parseFloat(currentATR.toFixed(2)) : null,
      bollingerPosition: bbMiddle
        ? parseFloat(((currentPrice - bbLower) / (bbUpper - bbLower) * 100).toFixed(1))
        : null,
      volumeRatio: parseFloat((latestVolume / avgVolume).toFixed(2)),
      score
    };
  }
}
