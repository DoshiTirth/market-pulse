// Skill: Fundamental Analysis
// Evaluates company fundamentals (P/E, margins, growth)

export default class FundamentalSkill {
  name = 'fundamental';
  description = 'Evaluates company fundamentals: valuation ratios, growth metrics, and financial health';

  async analyze(stockData, context) {
    const { fundamentals } = context;

    // If no fundamental data, provide neutral signal
    if (!fundamentals) {
      return {
        signal: 'hold',
        confidence: 30,
        reasoning: 'No fundamental data available — analysis based on price action only'
      };
    }

    let score = 0;
    const reasons = [];

    // P/E Ratio analysis
    if (fundamentals.peRatio) {
      if (fundamentals.peRatio < 15) {
        score += 20;
        reasons.push(`Low P/E of ${fundamentals.peRatio} — potentially undervalued`);
      } else if (fundamentals.peRatio < 25) {
        score += 5;
        reasons.push(`Moderate P/E of ${fundamentals.peRatio}`);
      } else if (fundamentals.peRatio > 40) {
        score -= 15;
        reasons.push(`High P/E of ${fundamentals.peRatio} — priced for perfection`);
      } else if (fundamentals.peRatio > 30) {
        score -= 5;
        reasons.push(`Elevated P/E of ${fundamentals.peRatio}`);
      }
    }

    // Profit margin
    if (fundamentals.profitMargin) {
      if (fundamentals.profitMargin > 0.20) {
        score += 15;
        reasons.push(`Strong profit margin at ${(fundamentals.profitMargin * 100).toFixed(1)}%`);
      } else if (fundamentals.profitMargin > 0.10) {
        score += 5;
        reasons.push(`Healthy profit margin at ${(fundamentals.profitMargin * 100).toFixed(1)}%`);
      } else if (fundamentals.profitMargin < 0) {
        score -= 20;
        reasons.push('Company is unprofitable');
      }
    }

    // Revenue growth
    if (fundamentals.revenueGrowth) {
      if (fundamentals.revenueGrowth > 0.20) {
        score += 20;
        reasons.push(`Strong revenue growth at ${(fundamentals.revenueGrowth * 100).toFixed(1)}% YoY`);
      } else if (fundamentals.revenueGrowth > 0.05) {
        score += 8;
        reasons.push(`Moderate revenue growth at ${(fundamentals.revenueGrowth * 100).toFixed(1)}% YoY`);
      } else if (fundamentals.revenueGrowth < 0) {
        score -= 15;
        reasons.push(`Revenue declining at ${(fundamentals.revenueGrowth * 100).toFixed(1)}% YoY`);
      }
    }

    // 52-week range position
    if (fundamentals.fiftyTwoWeekHigh && fundamentals.fiftyTwoWeekLow) {
      const currentPrice = stockData[stockData.length - 1].close;
      const range = fundamentals.fiftyTwoWeekHigh - fundamentals.fiftyTwoWeekLow;
      const position = (currentPrice - fundamentals.fiftyTwoWeekLow) / range;

      if (position < 0.25) {
        score += 10;
        reasons.push('Near 52-week low — potential value opportunity');
      } else if (position > 0.9) {
        score -= 10;
        reasons.push('Near 52-week high — limited upside risk');
      }
    }

    // Moving average vs price (fundamental trend)
    if (fundamentals.movingAvg200) {
      const currentPrice = stockData[stockData.length - 1].close;
      if (currentPrice > fundamentals.movingAvg200 * 1.1) {
        score += 5;
        reasons.push('Trading well above 200 DMA — strong long-term trend');
      } else if (currentPrice < fundamentals.movingAvg200 * 0.9) {
        score -= 10;
        reasons.push('Trading well below 200 DMA — weak long-term trend');
      }
    }

    // Dividend
    if (fundamentals.dividendYield && fundamentals.dividendYield > 0.02) {
      score += 5;
      reasons.push(`Pays ${(fundamentals.dividendYield * 100).toFixed(1)}% dividend yield`);
    }

    // Signal determination
    let signal, confidence;
    if (score >= 20) {
      signal = 'buy';
      confidence = Math.min(50 + score, 95);
    } else if (score <= -15) {
      signal = 'sell';
      confidence = Math.min(50 + Math.abs(score), 95);
    } else {
      signal = 'hold';
      confidence = 45;
    }

    return {
      signal,
      confidence,
      reasoning: reasons.join('. ') || 'Fundamentals are neutral',
      metrics: {
        pe: fundamentals.peRatio,
        profitMargin: fundamentals.profitMargin,
        revenueGrowth: fundamentals.revenueGrowth,
        dividendYield: fundamentals.dividendYield
      },
      score
    };
  }
}
