// ============================================
// StockSage AI — Technical Indicators Library
// Pure math functions, no side effects
// ============================================

/**
 * Simple Moving Average
 */
export function calcSMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const avg = slice.reduce((sum, val) => sum + val, 0) / period;
      result.push(parseFloat(avg.toFixed(2)));
    }
  }
  return result;
}

/**
 * Exponential Moving Average
 */
export function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema.map(v => parseFloat(v.toFixed(2)));
}

/**
 * RSI — Relative Strength Index
 */
export function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return [];

  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  const rsi = [];
  rsi.push(parseFloat((100 - 100 / (1 + avgGain / (avgLoss || 0.001))).toFixed(2)));

  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi.push(parseFloat((100 - 100 / (1 + avgGain / (avgLoss || 0.001))).toFixed(2)));
  }
  return rsi;
}

/**
 * MACD — Moving Average Convergence Divergence
 */
export function calcMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = calcEMA(closes, fastPeriod);
  const emaSlow = calcEMA(closes, slowPeriod);

  const macdLine = emaFast.map((val, i) =>
    parseFloat((val - emaSlow[i]).toFixed(4))
  );

  const signalLine = calcEMA(macdLine.slice(slowPeriod - 1), signalPeriod);
  const macdTrimmed = macdLine.slice(slowPeriod - 1);

  const histogram = macdTrimmed.map((val, i) => {
    if (i < signalLine.length) {
      return parseFloat((val - signalLine[i]).toFixed(4));
    }
    return 0;
  });

  return { macdLine: macdTrimmed, signalLine, histogram };
}

/**
 * Bollinger Bands
 */
export function calcBollingerBands(closes, period = 20, multiplier = 2) {
  const sma = calcSMA(closes, period);
  const upper = [];
  const lower = [];

  for (let i = 0; i < closes.length; i++) {
    if (sma[i] === null) {
      upper.push(null);
      lower.push(null);
    } else {
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = sma[i];
      const stdDev = Math.sqrt(
        slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period
      );
      upper.push(parseFloat((mean + multiplier * stdDev).toFixed(2)));
      lower.push(parseFloat((mean - multiplier * stdDev).toFixed(2)));
    }
  }

  return { upper, middle: sma, lower };
}

/**
 * VWAP — Volume Weighted Average Price
 */
export function calcVWAP(highs, lows, closes, volumes) {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  const vwap = [];

  for (let i = 0; i < closes.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    cumulativeTPV += typicalPrice * volumes[i];
    cumulativeVolume += volumes[i];
    vwap.push(parseFloat((cumulativeTPV / cumulativeVolume).toFixed(2)));
  }
  return vwap;
}

/**
 * Fibonacci Retracement Levels
 */
export function calcFibonacci(high, low) {
  const diff = high - low;
  return {
    level0: high,
    level236: parseFloat((high - diff * 0.236).toFixed(2)),
    level382: parseFloat((high - diff * 0.382).toFixed(2)),
    level500: parseFloat((high - diff * 0.500).toFixed(2)),
    level618: parseFloat((high - diff * 0.618).toFixed(2)),
    level786: parseFloat((high - diff * 0.786).toFixed(2)),
    level100: low
  };
}

/**
 * Average True Range (ATR) — volatility indicator
 */
export function calcATR(highs, lows, closes, period = 14) {
  const trueRanges = [highs[0] - lows[0]];

  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }

  return calcSMA(trueRanges, period);
}

/**
 * Stochastic Oscillator
 */
export function calcStochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
  const kValues = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < kPeriod - 1) {
      kValues.push(null);
    } else {
      const highSlice = highs.slice(i - kPeriod + 1, i + 1);
      const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
      const highestHigh = Math.max(...highSlice);
      const lowestLow = Math.min(...lowSlice);
      const k = ((closes[i] - lowestLow) / (highestHigh - lowestLow || 0.001)) * 100;
      kValues.push(parseFloat(k.toFixed(2)));
    }
  }

  const dValues = calcSMA(kValues.filter(v => v !== null), dPeriod);
  return { k: kValues, d: dValues };
}

/**
 * On-Balance Volume (OBV)
 */
export function calcOBV(closes, volumes) {
  const obv = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv.push(obv[i - 1] + volumes[i]);
    else if (closes[i] < closes[i - 1]) obv.push(obv[i - 1] - volumes[i]);
    else obv.push(obv[i - 1]);
  }
  return obv;
}
