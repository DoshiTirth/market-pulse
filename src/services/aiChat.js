// ============================================
// Market Pulse — AI Chat Service
// Sends queries to the Express backend
// which securely proxies them to Claude API
// ============================================

import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

/**
 * Send a chat message with full market context to Claude
 */
export async function askClaude(message, { quotes = {}, signals = [], analyses = {} } = {}) {
  try {
    const { data } = await axios.post(`${API_BASE}/chat-with-context`, {
      message,
      quotes,
      signals,
      analyses: formatAnalyses(analyses)
    });

    return data.response;
  } catch (err) {
    console.error('[AI Chat] Error:', err.response?.data?.error || err.message);

    // If backend is not running, return helpful message
    if (err.code === 'ERR_NETWORK' || err.message.includes('Network Error')) {
      return '<strong>Backend server not running.</strong> Start it with: <code>node server.js</code> in a separate terminal. The AI chat needs the backend to securely connect to Claude.';
    }

    return `<strong>AI Error:</strong> ${err.response?.data?.error || err.message}. Check that the backend server is running.`;
  }
}

/**
 * Simple chat without market context
 */
export async function askClaudeSimple(message) {
  try {
    const { data } = await axios.post(`${API_BASE}/chat`, { message });
    return data.response;
  } catch (err) {
    console.error('[AI Chat] Error:', err.message);
    return `<strong>Error:</strong> ${err.message}`;
  }
}

/**
 * Check if backend server is running
 */
export async function checkBackendHealth() {
  try {
    const { data } = await axios.get(`${API_BASE}/health`, { timeout: 2000 });
    return { online: true, hasKey: data.hasKey };
  } catch {
    return { online: false, hasKey: false };
  }
}

/**
 * Format analyses object for the API (strip unnecessary data)
 */
function formatAnalyses(analyses) {
  const formatted = {};
  Object.entries(analyses).forEach(([symbol, analysis]) => {
    if (analysis?.skills) {
      formatted[symbol] = { skills: {} };
      Object.entries(analysis.skills).forEach(([skill, result]) => {
        formatted[symbol].skills[skill] = {
          signal: result.signal,
          confidence: result.confidence,
          rsi: result.rsi,
          macdSignal: result.macdSignal,
          trend: result.trend,
          volatility: result.volatility,
          volumeRatio: result.volumeRatio,
          reasoning: result.reasoning?.slice(0, 150)
        };
      });
    }
  });
  return formatted;
}
