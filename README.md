# StockSage AI — Personal Stock Market Intelligence Agent

![StockSage AI](https://img.shields.io/badge/StockSage-AI%20Agent-22d3a7?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Desktop-3b82f6?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-f59e0b?style=for-the-badge)

A modular AI-powered stock market analysis agent with a production-grade dashboard. Runs as a web app or native Windows desktop app via Electron.

## Features

- **AI Agent Core** — Modular skill-based architecture for technical analysis, pattern recognition, and trade signals
- **Real-time Dashboard** — Interactive charts, watchlists, sector heatmaps, portfolio allocation
- **Technical Indicators** — RSI, MACD, SMA, EMA, Bollinger Bands, VWAP, Fibonacci
- **Signal Engine** — AI-generated buy/sell/hold signals with confidence scores
- **Natural Language Chat** — Ask questions about any stock in plain English
- **Electron Desktop App** — Native Windows app with system tray, notifications, keyboard shortcuts
- **Extensible Plugin System** — Add new analysis skills without touching existing code

## Tech Stack

- **Frontend**: React 18 + Chart.js + Recharts + Tailwind CSS
- **Desktop**: Electron 28
- **Data**: Alpha Vantage API + Finnhub WebSocket
- **AI**: Modular agent with pluggable skill modules
- **Build**: Electron Builder for .exe packaging

## Quick Start

### Prerequisites
- Node.js 18+ (https://nodejs.org)
- Git (https://git-scm.com)
- Free API key from [Alpha Vantage](https://www.alphavantage.co/support/#api-key)
- (Optional) Free API key from [Finnhub](https://finnhub.io/) for real-time WebSocket data

### Installation

```bash
git clone https://github.com/yourusername/stocksage-ai.git
cd stocksage-ai
npm install
```

### Configure API Keys

Copy the example env file and add your keys:
```bash
cp .env.example .env
```

Edit `.env`:
```
REACT_APP_ALPHA_VANTAGE_KEY=your_key_here
REACT_APP_FINNHUB_KEY=your_key_here
```

### Run as Web App
```bash
npm start
```

### Run as Desktop App
```bash
npm run electron-dev
```

### Build Desktop .exe
```bash
npm run electron-build
```
Output: `dist/StockSage AI Setup.exe`

## Project Structure

```
stocksage-ai/
├── public/
│   └── electron.js              # Electron main process
├── src/
│   ├── agent/                   # AI Agent core
│   │   ├── AgentCore.js         # Central agent orchestrator
│   │   ├── skills/              # Pluggable analysis skills
│   │   │   ├── TechnicalSkill.js
│   │   │   ├── PatternSkill.js
│   │   │   ├── FundamentalSkill.js
│   │   │   └── SentimentSkill.js
│   │   └── memory/
│   │       └── AgentMemory.js   # Conversation + analysis memory
│   ├── components/              # React UI components
│   │   ├── Dashboard.jsx
│   │   ├── PriceChart.jsx
│   │   ├── Watchlist.jsx
│   │   ├── AISignals.jsx
│   │   ├── SectorMap.jsx
│   │   ├── PortfolioRing.jsx
│   │   ├── AIChat.jsx
│   │   └── Screener.jsx
│   ├── services/                # Data layer
│   │   ├── stockAPI.js
│   │   ├── websocket.js
│   │   └── cache.js
│   ├── utils/
│   │   └── indicators.js
│   ├── hooks/
│   │   ├── useStockData.js
│   │   └── useAgent.js
│   ├── App.jsx
│   └── index.css
├── .env.example
├── package.json
└── README.md
```

## Adding New Agent Skills

Create a new file in `src/agent/skills/`:

```javascript
export default class MyNewSkill {
  name = 'my-skill';
  description = 'What this skill does';

  async analyze(stockData, context) {
    // Your analysis logic
    return {
      signal: 'buy' | 'sell' | 'hold',
      confidence: 0-100,
      reasoning: 'Why this signal was generated'
    };
  }
}
```

Register it in `AgentCore.js`:
```javascript
import MyNewSkill from './skills/MyNewSkill';
this.registerSkill(new MyNewSkill());
```

## Roadmap

- [ ] WebSocket real-time streaming
- [ ] Backtesting engine
- [ ] Options flow analysis
- [ ] Earnings calendar integration
- [ ] Multi-timeframe analysis
- [ ] Export reports to PDF
- [ ] Cloud sync for watchlists

## License

MIT
