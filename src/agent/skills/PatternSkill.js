// ============================================
// Skill: Pattern Recognition
// Detects common chart patterns in price data
// ============================================

export default class PatternSkill {
  name = 'pattern';
  description = 'Detects chart patterns like double tops/bottoms, head & shoulders, breakouts, and support/resistance';

  async analyze(stockData, context) {
    const closes = stockData.map(d => d.close);
    const highs = stockData.map(d => d.high);
    const lows = stockData.map(d => d.low);
    const volumes = stockData.map(d => d.volume);

    if (closes.length < 20) {
      return { signal: 'hold', confidence: 20, reasoning: 'Insufficient data for pattern detection' };
    }

    const patterns = [];
    let score = 0;

    // Detect double top
    const doubleTop = this.detectDoubleTop(highs, closes);
    if (doubleTop.detected) {
      patterns.push('Double top');
      score -= 20;
    }

    // Detect double bottom
    const doubleBottom = this.detectDoubleBottom(lows, closes);
    if (doubleBottom.detected) {
      patterns.push('Double bottom');
      score += 20;
    }

    // Detect higher highs / higher lows (uptrend)
    const trendPattern = this.detectTrend(highs, lows);
    if (trendPattern === 'uptrend') {
      patterns.push('Higher highs & higher lows');
      score += 15;
    } else if (trendPattern === 'downtrend') {
      patterns.push('Lower highs & lower lows');
      score -= 15;
    }

    // Detect support/resistance breakout
    const breakout = this.detectBreakout(closes, highs, lows, volumes);
    if (breakout.type === 'resistance') {
      patterns.push(`Resistance breakout at ${breakout.level.toFixed(2)}`);
      score += 25;
    } else if (breakout.type === 'support') {
      patterns.push(`Support breakdown at ${breakout.level.toFixed(2)}`);
      score -= 25;
    }

    // Detect consolidation (tightening range)
    const consolidation = this.detectConsolidation(highs, lows);
    if (consolidation) {
      patterns.push('Consolidation — breakout imminent');
      score += 5; // Slight bullish bias
    }

    // Detect volume divergence
    const volDiv = this.detectVolumeDivergence(closes, volumes);
    if (volDiv === 'bullish') {
      patterns.push('Bullish volume divergence');
      score += 10;
    } else if (volDiv === 'bearish') {
      patterns.push('Bearish volume divergence');
      score -= 10;
    }

    // Signal
    let signal, confidence;
    if (score >= 15) {
      signal = 'buy';
      confidence = Math.min(50 + score, 95);
    } else if (score <= -15) {
      signal = 'sell';
      confidence = Math.min(50 + Math.abs(score), 95);
    } else {
      signal = 'hold';
      confidence = 40;
    }

    return {
      signal,
      confidence,
      reasoning: patterns.length > 0
        ? `Detected: ${patterns.join(', ')}`
        : 'No significant patterns detected',
      patterns,
      score
    };
  }

  detectDoubleTop(highs, closes) {
    const recent = highs.slice(-30);
    if (recent.length < 20) return { detected: false };

    const max1Idx = recent.indexOf(Math.max(...recent.slice(0, 15)));
    const max2Idx = 15 + recent.slice(15).indexOf(Math.max(...recent.slice(15)));
    const max1 = recent[max1Idx];
    const max2 = recent[max2Idx];

    const tolerance = max1 * 0.02;
    if (Math.abs(max1 - max2) < tolerance && max2Idx - max1Idx > 5) {
      const neckline = Math.min(...recent.slice(max1Idx, max2Idx));
      if (closes[closes.length - 1] < neckline) {
        return { detected: true, level: max1 };
      }
    }
    return { detected: false };
  }

  detectDoubleBottom(lows, closes) {
    const recent = lows.slice(-30);
    if (recent.length < 20) return { detected: false };

    const min1Idx = recent.indexOf(Math.min(...recent.slice(0, 15)));
    const min2Idx = 15 + recent.slice(15).indexOf(Math.min(...recent.slice(15)));
    const min1 = recent[min1Idx];
    const min2 = recent[min2Idx];

    const tolerance = min1 * 0.02;
    if (Math.abs(min1 - min2) < tolerance && min2Idx - min1Idx > 5) {
      const neckline = Math.max(...recent.slice(min1Idx, min2Idx));
      if (closes[closes.length - 1] > neckline) {
        return { detected: true, level: min1 };
      }
    }
    return { detected: false };
  }

  detectTrend(highs, lows) {
    const recent = 10;
    if (highs.length < recent * 2) return 'unclear';

    const recentHighs = highs.slice(-recent);
    const prevHighs = highs.slice(-recent * 2, -recent);
    const recentLows = lows.slice(-recent);
    const prevLows = lows.slice(-recent * 2, -recent);

    const avgRecentHigh = recentHighs.reduce((a, b) => a + b, 0) / recent;
    const avgPrevHigh = prevHighs.reduce((a, b) => a + b, 0) / recent;
    const avgRecentLow = recentLows.reduce((a, b) => a + b, 0) / recent;
    const avgPrevLow = prevLows.reduce((a, b) => a + b, 0) / recent;

    if (avgRecentHigh > avgPrevHigh && avgRecentLow > avgPrevLow) return 'uptrend';
    if (avgRecentHigh < avgPrevHigh && avgRecentLow < avgPrevLow) return 'downtrend';
    return 'sideways';
  }

  detectBreakout(closes, highs, lows, volumes) {
    if (closes.length < 20) return { type: null };

    const lookback = closes.slice(-20, -1);
    const resistance = Math.max(...lookback);
    const support = Math.min(...lookback);
    const current = closes[closes.length - 1];
    const avgVol = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19;
    const currentVol = volumes[volumes.length - 1];

    // Breakout above resistance on higher volume
    if (current > resistance && currentVol > avgVol * 1.3) {
      return { type: 'resistance', level: resistance };
    }

    // Breakdown below support on higher volume
    if (current < support && currentVol > avgVol * 1.3) {
      return { type: 'support', level: support };
    }

    return { type: null };
  }

  detectConsolidation(highs, lows) {
    if (highs.length < 10) return false;

    const ranges = [];
    for (let i = highs.length - 10; i < highs.length; i++) {
      ranges.push(highs[i] - lows[i]);
    }

    // Check if ranges are decreasing (tightening)
    const firstHalf = ranges.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const secondHalf = ranges.slice(5).reduce((a, b) => a + b, 0) / 5;

    return secondHalf < firstHalf * 0.7;
  }

  detectVolumeDivergence(closes, volumes) {
    if (closes.length < 10) return null;

    const priceUp = closes[closes.length - 1] > closes[closes.length - 6];
    const avgVolRecent = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const avgVolPrev = volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
    const volumeUp = avgVolRecent > avgVolPrev;

    if (priceUp && !volumeUp) return 'bearish'; // Price up on declining volume
    if (!priceUp && volumeUp) return 'bullish'; // Price down but volume increasing (accumulation)
    return null;
  }
}
