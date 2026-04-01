# AI Stock Trading Agent

An automated stock trading system powered by LLM-based signal generation. See `CLAUDE.md` for full project brief and `SKILLS.md` for development patterns.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind |
| Backend | Node.js + Express + TypeScript |
| Python MS | FastAPI + schwab-py + ta-lib |
| Database | Supabase (PostgreSQL + pgvector) |
| Queues | BullMQ + Redis |
| LLM | Anthropic Claude (claude-sonnet-4-20250514) |
| Broker | TD Ameritrade / Schwab |

## Project Structure

```
trading-agent/
├── CLAUDE.md                  # Project brief (Claude Code context)
├── SKILLS.md                  # Development patterns reference
├── .env.example               # All required environment variables
├── packages/
│   └── types/                 # Shared TypeScript types
├── frontend/                  # React + TypeScript dashboard
├── backend/                   # Node.js Express API + agent orchestration
├── python-ms/                 # FastAPI microservice (Schwab + ta-lib)
└── supabase/
    └── migrations/            # Database schema migrations
```

## Getting Started

### 1. Prerequisites
- Node.js 20+
- pnpm 9+
- Python 3.11+
- Redis (local or Upstash)
- Supabase project

### 2. Install dependencies
```bash
pnpm install
cd python-ms && pip install -r requirements.txt
```

### 3. Configure environment
```bash
cp .env.example .env
# Fill in all values in .env
```

### 4. Run Supabase migrations
```bash
supabase db push
```

### 5. Start development servers
```bash
# Terminal 1 — Backend + Frontend
pnpm dev

# Terminal 2 — Python microservice
cd python-ms && uvicorn main:app --reload --port 8001
```

Frontend: http://localhost:5173  
Backend: http://localhost:3001  
Python MS: http://localhost:8001

## Trading Modes

- **Paper (default)**: All order calls return simulated responses. Safe for development and testing.
- **Live**: Set `TRADING_MODE=live` in `.env`. Real money. Requires all Schwab credentials configured.

> ⚠️ Always paper trade and backtest before going live.

## Development Phases

See `CLAUDE.md` for the full phased development plan with checkboxes.
