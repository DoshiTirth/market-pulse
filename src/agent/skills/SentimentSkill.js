// Skill: Sentiment Analysis
// Infers market sentiment from volume patterns,
// price momentum, and relative strength

import { calcRSI, calcOBV } from '../../utils/indicators';

export default class SentimentSkill {
  name = 'sentiment';
  description = 'Infers market sentiment from volume patterns, price momentum, and buying/selling pressure';

  async analyze(stockData, context) {
    const closes = stockData.map(d => d.close);
    const volumes = stockData.map(d => d.volume);
    const highs = stockData.map(d => d.high);
    const lows = stockData.map(d => d.low);

    if (closes.length < 15) {
      return { signal: 'hold', confidence: 25, reasoning: 'Insufficient data for sentiment analysis' };
    }

    let score = 0;
    const reasons = [];

    // 1. On-Balance Volume trend
    const obv = calcOBV(closes, volumes);
    const obvRecent = obv.slice(-5);
    const obvPrev = obv.slice(-10, -5);
    const obvTrendUp = obvRecent[obvRecent.length - 1] > obvPrev[obvPrev.length - 1];
    const priceUp = closes[closes.length - 1] > closes[closes.length - 6];

    if (obvTrendUp && priceUp) {
      score += 15;
      reasons.push('OBV confirms bullish momentum — smart money accumulating');
    } else if (!obvTrendUp && priceUp) {
      score -= 10;
      reasons.push('OBV divergence — price rising on declining volume (distribution)');
    } else if (obvTrendUp && !priceUp) {
      score += 10;
      reasons.push('OBV positive despite price decline — accumulation phase');
    } else {
      score -= 15;
      reasons.push('OBV confirms selling pressure');
    }

    // 2. Buying pressure ratio (close position within daily range)
    const recentBars = stockData.slice(-10);
    let buyingPressure = 0;
    for (const bar of recentBars) {
      const range = bar.high - bar.low;
      if (range > 0) {
        const position = (bar.close - bar.low) / range;
        buyingPressure += position;
      }
    }
    buyingPressure /= recentBars.length;

    if (buyingPressure > 0.65) {
      score += 15;
      reasons.push(`Strong buying pressure (${(buyingPressure * 100).toFixed(0)}% close-to-range)`);
    } else if (buyingPressure < 0.35) {
      score -= 15;
      reasons.push(`Heavy selling pressure (${(buyingPressure * 100).toFixed(0)}% close-to-range)`);
    }

    // 3. Volume trend (is activity increasing?)
    const vol5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const vol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeRatio = vol5 / vol20;

    if (volumeRatio > 1.3 && priceUp) {
      score += 10;
      reasons.push('Increasing volume on upward move — conviction');
    } else if (volumeRatio > 1.3 && !priceUp) {
      score -= 10;
      reasons.push('Increasing volume on downward move — panic selling');
    } else if (volumeRatio < 0.7) {
      reasons.push('Low volume — market indecision');
    }

    // 4. Recent momentum (5-day vs 20-day return)
    const return5d = (closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6];
    const return20d = closes.length >= 21
      ? (closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21]
      : 0;

    if (return5d > 0.03) {
      score += 10;
      reasons.push(`Strong 5-day momentum (+${(return5d * 100).toFixed(1)}%)`);
    } else if (return5d < -0.03) {
      score -= 10;
      reasons.push(`Weak 5-day momentum (${(return5d * 100).toFixed(1)}%)`);
    }

    // 5. Fear/greed proxy — RSI extreme readings
    const rsi = calcRSI(closes);
    const currentRSI = rsi[rsi.length - 1];
    if (currentRSI < 25) {
      score += 10;
      reasons.push('Extreme fear (RSI < 25) — contrarian buy signal');
    } else if (currentRSI > 80) {
      score -= 10;
      reasons.push('Extreme greed (RSI > 80) — contrarian sell signal');
    }

    // Determine signal
    let signal, confidence;
    if (score >= 15) {
      signal = 'buy';
      confidence = Math.min(45 + score, 92);
    } else if (score <= -15) {
      signal = 'sell';
      confidence = Math.min(45 + Math.abs(score), 92);
    } else {
      signal = 'hold';
      confidence = 35;
    }

    return {
      signal,
      confidence,
      reasoning: reasons.join('. '),
      metrics: {
        buyingPressure: parseFloat(buyingPressure.toFixed(2)),
        volumeRatio: parseFloat(volumeRatio.toFixed(2)),
        momentum5d: parseFloat((return5d * 100).toFixed(2)),
        momentum20d: parseFloat((return20d * 100).toFixed(2)),
        obvTrend: obvTrendUp ? 'rising' : 'falling'
      },
      score
    };
  }
}
