# Market Pulse

An AI-powered stock market analysis dashboard with real-time data, interactive charts, and intelligent trade signals. Built with React, Chart.js, Express, and Electron.

![Dashboard](https://img.shields.io/badge/Platform-Web%20%7C%20Desktop-22d3a7?style=flat-square)
![Data](https://img.shields.io/badge/Data-Finnhub%20%7C%20Yahoo-3b82f6?style=flat-square)
![AI](https://img.shields.io/badge/AI-Claude%20%7C%204%20Skills-f59e0b?style=flat-square)

## What it does

Market Pulse connects to live market data and runs AI analysis across 4 different skill modules to generate trade signals. It works as a web app or a native Windows desktop app.

**Data pipeline:**
- Real-time quotes and WebSocket streaming via Finnhub API
- Historical OHLCV candle data via Yahoo Finance
- Live company news feed
- Market index tracking via SPY, QQQ, DIA ETFs

**AI agent with 4 analysis skills:**
- **Technical** — RSI, MACD, SMA, EMA, Bollinger Bands, ATR, volume analysis
- **Pattern** — Double top/bottom detection, trend structure, breakouts, consolidation, volume divergence
- **Fundamental** — P/E ratio, profit margins, revenue growth, 52-week position
- **Sentiment** — OBV analysis, buying pressure ratio, momentum, volume trends

Each skill produces an independent signal. The agent aggregates them with configurable weights into a final buy/sell/hold recommendation with confidence score.

**Claude-powered chat** — Ask questions about any stock in plain English. The Express backend securely proxies requests to Claude API with full market context (live quotes, signals, technical indicators) so responses reference real data.

## Features

- Interactive charts with crosshair cursor, OHLCV tooltips, and daily change
- SMA 20/50 overlay toggles on the price chart
- Timeframe selector (1W, 1M, 3M, ALL)
- Color-coded volume bars (green for up days, red for down days)
- Custom watchlist — search and add any stock, persists across sessions
- Stock screener with working filters (Strong Buy, Oversold, High Volume, etc.)
- Real-time sector performance computed from live data
- Live news feed from Finnhub per selected stock
- Portfolio allocation view with donut chart
- Native Windows desktop app via Electron with system tray

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Chart.js, react-chartjs-2, Recharts |
| Backend | Express.js (API proxy for Claude) |
| Desktop | Electron 28 |
| Market data | Finnhub API (quotes, WebSocket, news), Yahoo Finance (candles) |
| AI chat | Claude API (Anthropic) via Express proxy |
| AI engine | Custom multi-skill agent with memory system |
| Indicators | RSI, MACD, SMA, EMA, Bollinger Bands, ATR, VWAP, Stochastic, OBV, Fibonacci |

## Setup

### Prerequisites

- Node.js 18+
- Free API key from [Finnhub](https://finnhub.io/) (60 calls/min)
- Claude API key from [Anthropic](https://console.anthropic.com/) (optional, for AI chat)

### Install

```bash
git clone https://github.com/DoshiTirth/market-pulse.git
cd market-pulse
npm install
```

### Configure

```bash
copy .env.example .env
```

Edit `.env` and add your API keys:

```
REACT_APP_FINNHUB_KEY=your_finnhub_key
REACT_APP_CLAUDE_API_KEY=your_claude_key
```

### Run

**Web app:**
```bash
npm start
```

**AI chat backend** (separate terminal):
```bash
node server.js
```

**Desktop app:**
```bash
npm run electron-dev
```

**Build Windows .exe:**
```bash
npm run electron-build
```

## Project structure

```
market-pulse/
├── server.js                    # Express backend (Claude API proxy)
├── public/
│   └── electron.js              # Electron main process
├── src/
│   ├── agent/
│   │   ├── AgentCore.js         # Central orchestrator
│   │   ├── skills/
│   │   │   ├── TechnicalSkill.js
│   │   │   ├── PatternSkill.js
│   │   │   ├── FundamentalSkill.js
│   │   │   └── SentimentSkill.js
│   │   └── memory/
│   │       └── AgentMemory.js
│   ├── components/
│   │   ├── InteractiveChart.jsx # Charts with crosshair + OHLCV tooltips
│   │   └── WatchlistManager.jsx # Custom watchlist with search
│   ├── services/
│   │   ├── stockAPI.js          # Finnhub + Yahoo Finance
│   │   └── aiChat.js            # Claude API client
│   ├── hooks/
│   │   ├── useAgent.js
│   │   └── useStockData.js
│   ├── utils/
│   │   └── indicators.js        # Technical indicator math
│   ├── App.jsx
│   └── index.css
└── .env.example
```

## Adding new agent skills

Create a file in `src/agent/skills/`:

```javascript
export default class MySkill {
  name = 'my-skill';
  description = 'What this skill analyzes';

  async analyze(stockData, context) {
    // Your analysis logic here
    return {
      signal: 'buy',      // 'buy' | 'sell' | 'hold'
      confidence: 75,      // 0-100
      reasoning: 'Why'
    };
  }
}
```

Register it in `AgentCore.js`:

```javascript
import MySkill from './skills/MySkill';
this.registerSkill(new MySkill());
```

## API usage

Finnhub free tier: 60 calls/min. The app uses ~20 calls on initial load (quotes + news), then WebSocket for live updates.

Yahoo Finance: No API key needed. Used for historical candle data only.

Claude API: ~$0.005 per chat message. $5 credit covers ~1000 conversations.

## License

MIT
