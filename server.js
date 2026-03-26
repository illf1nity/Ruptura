/**
 * RUPTURA — Server Entry Point
 * ==============================
 * Express 5 server with route mounting and static file serving.
 *
 * Route modules:
 *   routes/econ.js   — Economic calculator (impact, worth-gap, negotiation, local-data)
 *   routes/data.js   — Public data APIs (CPI, yearly indicators, HUD rent, map)
 *   routes/legacy.js — Solidarity Net endpoints (collectives, petitions, buildings, etc.)
 *
 * Service modules:
 *   services/govApi.js          — BLS + HUD API wrappers
 *   services/scraping.js        — Change.org + Telegram scrapers
 *   services/calculationService.js — Economic calculations
 *   services/wageData.js        — BLS wage data by MSA/state
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { getDatabase, YEARLY_ECONOMIC_DATA, STATE_META } = require('./db');
const { fetchCPIData, fetchHUDRentData, fetchHUDStateData } = require('./services/govApi');
const { fetchChangeOrgData, isValidChangeOrgUrl, isValidTelegramUrl } = require('./services/scraping');
const createEconRouter = require('./routes/econ');
const createDataRouter = require('./routes/data');
const createLegacyRouter = require('./routes/legacy');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json());

// Disable caching so file changes show up immediately during development
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false }));

// ============================================
// DATABASE
// ============================================

const db = getDatabase();

// ============================================
// HELPERS
// ============================================

/**
 * Format a timestamp as relative time (e.g. "5m ago", "3d ago")
 */
function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
}

/**
 * Derive 2-letter state code from ZIP via local_data table
 */
function getStateFromZip(zipCode) {
  const row = db.prepare('SELECT area FROM local_data WHERE zip_code = ?').get(zipCode);
  if (!row || !row.area) return null;
  const match = row.area.match(/,\s*([A-Z]{2})$/);
  return match ? match[1] : null;
}

// ============================================
// ROUTES
// ============================================

// Economic calculator — /api/impact-calculator, /api/worth-gap-analyzer, etc.
app.use(createEconRouter({ db, fetchCPIData, getStateFromZip }));

// Data APIs — /api/economic-data/*, /api/rent-data/*, /api/map-data
app.use(createDataRouter({ db, fetchCPIData, fetchHUDRentData, fetchHUDStateData, YEARLY_ECONOMIC_DATA, STATE_META }));

// Legacy Solidarity Net — /api/petitions, /api/worker-collectives, etc.
app.use(createLegacyRouter({ db, timeAgo, fetchChangeOrgData, isValidChangeOrgUrl, isValidTelegramUrl }));

// Econ page route
app.get('/econ', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'econ.html'));
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`Ruptura backend running on port ${PORT}`);
  console.log(`Ruptura Economic Experience available at http://localhost:${PORT}/econ`);
});
