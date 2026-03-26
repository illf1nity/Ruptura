# Ruptura

Your economic reality, in numbers. See how much value your work creates and how much of it you actually receive.

Anonymous. No tracking. No accounts.

## Quick Start

```bash
npm install
npm start
```

Open **http://localhost:3000** in your browser.

> **No server?** You can also open `public/econ.html` directly in your browser to preview the UI. The calculator requires the server, but all static content will render.

## What It Does

Enter your salary, ZIP code, and work history. Ruptura calculates:

- **Productivity-wage gap** -- how much more value you produce than you're paid
- **Worth gap** -- your pay vs. local market median for your experience level
- **Housing burden** -- rent as a percentage of income, homeownership affordability
- **Survival metrics** -- your gap translated into days and months of rent
- **Negotiation script** -- a personalized script backed by your numbers

## Prerequisites

- Node.js (v18 or higher)
- npm

## Project Structure

```
server.js                    Entry point (Express 5, middleware, route mounting)
db.js                        SQLite schema, seed data, yearly indicators 1975-2024
routes/
  econ.js                    Economic calculator endpoints
  data.js                    Public data APIs (CPI, yearly, HUD rent, map)
  legacy.js                  Solidarity Net endpoints (collectives, petitions)
services/
  calculationService.js      Market median, worth gap, lifetime cost calculations
  wageData.js                MSA and state-level wage data (BLS)
  govApi.js                  BLS + HUD API wrappers with caching
  scraping.js                Change.org + Telegram data fetchers
public/                      Client-side files (served as static by Express)
  index.html                 Redirects to econ.html
  econ.html                  Main interface (single page)
  econ.js                    Client-side logic (vanilla JS, IIFE pattern)
  econ.css                   Styles (uses ruptura-tokens.css design tokens)
  ruptura-tokens.css         Shared design tokens (colors, fonts, spacing)
  content.json               All UI copy (labels, errors, messaging)
  video-card.js              Downloadable results card generation (canvas/MediaRecorder)
  ruptura_logo.svg           Logo
  images/
    ruptura-logo.jpg         Logo raster fallback
```

## Configuration (Optional)

The app works out of the box with embedded economic data. For live government API data:

### BLS API Key (Bureau of Labor Statistics)

1. Register at https://www.bls.gov/developers/
2. Set the environment variable:

```bash
export BLS_API_KEY="your-key-here"
```

### HUD API Key (Housing and Urban Development)

1. Register at https://www.huduser.gov/portal/dataset/fmr-api.html
2. Set the environment variable:

```bash
export HUD_API_KEY="your-key-here"
```

Then start with:

```bash
BLS_API_KEY="your-key" HUD_API_KEY="your-key" npm start
```

If API keys are not set, the app falls back to local data automatically.

## API Endpoints

### Core Calculator

- `GET /api/local-data/:zipCode` -- Cost of living data by ZIP
- `POST /api/impact-calculator` -- Productivity-wage gap analysis
- `POST /api/worth-gap-analyzer` -- Market comparison with experience adjustment
- `POST /api/negotiation-script` -- Personalized negotiation script

### Data

- `GET /api/economic-data/cpi?startYear=YYYY&endYear=YYYY` -- CPI inflation (BLS API)
- `GET /api/economic-data/yearly?startYear=YYYY&endYear=YYYY` -- Yearly economic indicators
- `GET /api/rent-data/hud/:zipCode` -- HUD Fair Market Rent by ZIP

## Data Sources

- **Economic Policy Institute** -- Productivity-wage gap data (1979-2024)
- **Bureau of Labor Statistics** -- CPI inflation, wage data by MSA/state
- **Census Bureau** -- Housing cost trends
- **Federal Reserve** -- Economic indicators
- **HUD** -- Fair Market Rent data

## Database

SQLite via better-sqlite3. The database is **automatically created and seeded** on first run. No setup required.

```bash
# Re-seed if needed
npm run seed
```

## Stack

- **Frontend**: Vanilla JS (no frameworks, no build step)
- **Backend**: Express 5 + SQLite
- **Design**: Custom tokens (Gold/Dark theme)
- **Fonts**: Space Grotesk, Inter, JetBrains Mono

## License

ISC
