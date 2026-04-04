// useAgent — React hook for the AI agent

import { useState, useCallback } from 'react';
import agent from '../agent/AgentCore';

export function useAgent() {
  const [analyses, setAnalyses] = useState({});
  const [insight, setInsight] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);

  const analyzeStock = useCallback(async (symbol, stockData, fundamentals) => {
    setLoading(true);
    try {
      const result = await agent.analyzeStock(symbol, stockData, fundamentals);
      setAnalyses(prev => ({ ...prev, [symbol]: result }));
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const analyzeMultiple = useCallback(async (stocksMap, fundamentalsMap = {}) => {
    setLoading(true);
    const results = {};

    for (const [symbol, data] of Object.entries(stocksMap)) {
      try {
        results[symbol] = await agent.analyzeStock(symbol, data, fundamentalsMap[symbol]);
      } catch (err) {
        console.error(`Analysis failed for ${symbol}:`, err);
      }
    }

    setAnalyses(results);

    // Generate market-wide insight
    const allAnalyses = Object.entries(results).map(([symbol, r]) => ({
      symbol,
      ...r
    }));
    const marketInsight = agent.generateMarketInsight(allAnalyses);
    setInsight(marketInsight);

    setLoading(false);
    return results;
  }, []);

  const askAgent = useCallback(async (query, availableData) => {
    setLoading(true);
    try {
      const response = await agent.handleQuery(query, availableData);
      setChatHistory(prev => [...prev, { query, response, timestamp: Date.now() }]);
      return response;
    } finally {
      setLoading(false);
    }
  }, []);

  const getSignals = useCallback(() => {
    return Object.entries(analyses).map(([symbol, analysis]) => ({
      symbol,
      action: analysis.aggregated.action,
      confidence: analysis.aggregated.confidence,
      reasoning: analysis.aggregated.reasoning
    }));
  }, [analyses]);

  return {
    analyses,
    insight,
    loading,
    chatHistory,
    analyzeStock,
    analyzeMultiple,
    askAgent,
    getSignals,
    skills: agent.listSkills()
  };
}
