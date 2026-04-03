// ============================================
// Market Pulse — Backend Server
// Proxies Claude API calls to keep keys secure
// Run with: node server.js
// ============================================

const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = 3001;

// Load API key from .env file manually (no dotenv dependency needed)
const fs = require('fs');
const path = require('path');

let CLAUDE_API_KEY = process.env.REACT_APP_CLAUDE_API_KEY || '';

// Try to read from .env file
try {
  const envPath = path.join(__dirname, '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/REACT_APP_CLAUDE_API_KEY=(.+)/);
  if (match) CLAUDE_API_KEY = match[1].trim();
} catch (e) {
  console.warn('[Server] No .env file found, using environment variable');
}

if (!CLAUDE_API_KEY) {
  console.error('[Server] ERROR: No Claude API key found! Add REACT_APP_CLAUDE_API_KEY to your .env file');
}

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasKey: !!CLAUDE_API_KEY });
});

// Claude AI chat endpoint
app.post('/api/chat', async (req, res) => {
  const { message, stockContext } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!CLAUDE_API_KEY) {
    return res.status(500).json({ error: 'Claude API key not configured' });
  }

  try {
    // Build context-aware system prompt
    const systemPrompt = buildSystemPrompt(stockContext);

    const requestBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        { role: 'user', content: message }
      ]
    });

    // Make request to Claude API using native https (no extra dependency)
    const response = await makeClaudeRequest(requestBody);
    
    // Extract text from response
    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    res.json({ response: text });

  } catch (err) {
    console.error('[Server] Claude API error:', err.message);
    res.status(500).json({ error: 'Failed to get AI response: ' + err.message });
  }
});

function makeClaudeRequest(body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(parsed.error?.message || `API returned ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Failed to parse API response'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function buildSystemPrompt(stockContext) {
  let prompt = `You are Market Pulse AI — a professional stock market analysis assistant built into a trading dashboard. You provide concise, data-driven insights.

RULES:
- Be concise. Keep responses under 200 words unless asked for detail.
- Use specific numbers: RSI values, price levels, percentage changes.
- Format key points with <strong> tags for emphasis.
- Always mention risk factors alongside opportunities.
- Never say "I'm just an AI" or add excessive disclaimers. One brief risk note at the end is enough.
- Structure: Lead with the key takeaway, then supporting data, then action items.
- Use bullet points sparingly — prefer flowing prose with bold highlights.`;

  if (stockContext) {
    prompt += `\n\nCURRENT MARKET DATA:\n${stockContext}`;
  }

  return prompt;
}

// Format stock data for Claude's context
app.post('/api/chat-with-context', async (req, res) => {
  const { message, quotes, signals, analyses } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!CLAUDE_API_KEY) {
    return res.status(500).json({ error: 'Claude API key not configured' });
  }

  // Build rich context from live data
  let contextParts = [];

  if (quotes && Object.keys(quotes).length > 0) {
    contextParts.push('LIVE QUOTES:');
    Object.entries(quotes).forEach(([symbol, q]) => {
      contextParts.push(`${symbol}: $${q.price?.toFixed(2)} (${q.changePct >= 0 ? '+' : ''}${q.changePct?.toFixed(2)}%)`);
    });
  }

  if (signals && signals.length > 0) {
    contextParts.push('\nAI SIGNALS:');
    signals.forEach(s => {
      contextParts.push(`${s.symbol}: ${s.action.toUpperCase()} (${s.confidence}% confidence) — ${s.reasoning?.slice(0, 100)}`);
    });
  }

  if (analyses && Object.keys(analyses).length > 0) {
    contextParts.push('\nTECHNICAL ANALYSIS:');
    Object.entries(analyses).forEach(([symbol, a]) => {
      const tech = a.skills?.technical;
      if (tech) {
        contextParts.push(`${symbol}: RSI ${tech.rsi}, ${tech.macdSignal}, trend: ${tech.trend}, volatility: ${tech.volatility}%, volume ratio: ${tech.volumeRatio}x`);
      }
    });
  }

  const stockContext = contextParts.join('\n');

  try {
    const systemPrompt = buildSystemPrompt(stockContext);

    const requestBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        { role: 'user', content: message }
      ]
    });

    const response = await makeClaudeRequest(requestBody);

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    res.json({ response: text });

  } catch (err) {
    console.error('[Server] Claude API error:', err.message);
    res.status(500).json({ error: 'Failed to get AI response: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Market Pulse API server running on http://localhost:${PORT}`);
  console.log(`   Claude API key: ${CLAUDE_API_KEY ? '✓ loaded' : '✗ missing'}`);
  console.log(`   Endpoints:`);
  console.log(`     POST /api/chat — simple chat`);
  console.log(`     POST /api/chat-with-context — chat with live market data`);
  console.log(`     GET  /api/health — health check\n`);
});
