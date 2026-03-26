/**
 * RUPTURA — External Site Scraping
 * ==================================
 * Change.org petition and Telegram group data fetchers.
 * Used by legacy Solidarity Net endpoints.
 */

const https = require('https');

// ============================================
// CHANGE.ORG
// ============================================

const changeOrgCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function isValidChangeOrgUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.change.org' || parsed.hostname === 'change.org';
  } catch {
    return false;
  }
}

function parseChangeOrgPage(html) {
  let signatures = null;
  let goal = null;

  const supportersMatch = html.match(/"supporters_count"\s*:\s*(\d+)/);
  if (supportersMatch) {
    signatures = parseInt(supportersMatch[1], 10);
  }

  if (signatures === null) {
    const totalSigsMatch = html.match(/"total_signatures"\s*:\s*(\d+)/);
    if (totalSigsMatch) {
      signatures = parseInt(totalSigsMatch[1], 10);
    }
  }

  if (signatures === null) {
    const sigCountMatch = html.match(/"signatureCount"\s*:\s*{[^}]*"total"\s*:\s*(\d+)/);
    if (sigCountMatch) {
      signatures = parseInt(sigCountMatch[1], 10);
    }
  }

  if (signatures === null) {
    const visibleMatch = html.match(/([\d,]+)\s+(?:have signed|supporters|signatures)/i);
    if (visibleMatch) {
      signatures = parseInt(visibleMatch[1].replace(/,/g, ''), 10);
    }
  }

  const goalMatch = html.match(/"goal"\s*:\s*(\d+)/);
  if (goalMatch) {
    goal = parseInt(goalMatch[1], 10);
  }

  if (goal === null) {
    const goalTextMatch = html.match(/(?:goal|target)[:\s]+(?:of\s+)?([\d,]+)/i);
    if (goalTextMatch) {
      goal = parseInt(goalTextMatch[1].replace(/,/g, ''), 10);
    }
  }

  return { signatures, goal };
}

function fetchChangeOrgData(url) {
  return new Promise((resolve, reject) => {
    const cached = changeOrgCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return resolve({ signatures: cached.signatures, goal: cached.goal });
    }

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Ruptura/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 8000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchChangeOrgData(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data = parseChangeOrgPage(body);
          if (data.signatures !== null) {
            changeOrgCache.set(url, { ...data, timestamp: Date.now() });
          }
          resolve(data);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ============================================
// TELEGRAM
// ============================================

const telegramCache = new Map();
const TELEGRAM_CACHE_TTL = 10 * 60 * 1000;

function isValidTelegramUrl(url) {
  if (!url || url.trim() === '') return true; // Empty is valid (optional)
  try {
    const parsed = new URL(url);
    return parsed.hostname === 't.me' || parsed.hostname === 'telegram.me';
  } catch {
    return false;
  }
}

function parseTelegramCount(text) {
  if (!text) return null;
  const match = text.match(/([\d.]+)\s*([KMB])?/i);
  if (!match) return null;
  let num = parseFloat(match[1]);
  const suffix = (match[2] || '').toUpperCase();
  if (suffix === 'K') num *= 1000;
  if (suffix === 'M') num *= 1000000;
  if (suffix === 'B') num *= 1000000000;
  return Math.round(num);
}

function parseTelegramPage(html) {
  let members = null;

  const subscribersMatch = html.match(/([\d.,]+[KMB]?)\s*(?:subscribers|members)/i);
  if (subscribersMatch) {
    members = parseTelegramCount(subscribersMatch[1].replace(/,/g, ''));
  }

  if (members === null) {
    const membersJsonMatch = html.match(/"members_count"\s*:\s*(\d+)/);
    if (membersJsonMatch) {
      members = parseInt(membersJsonMatch[1], 10);
    }
  }

  if (members === null) {
    const metaMatch = html.match(/content="[^"]*?([\d.,]+[KMB]?)\s*(?:subscribers|members)[^"]*"/i);
    if (metaMatch) {
      members = parseTelegramCount(metaMatch[1].replace(/,/g, ''));
    }
  }

  return { members };
}

function fetchTelegramData(url) {
  return new Promise((resolve, reject) => {
    if (!url || url.trim() === '') {
      return resolve({ members: null });
    }

    const cached = telegramCache.get(url);
    if (cached && Date.now() - cached.timestamp < TELEGRAM_CACHE_TTL) {
      return resolve({ members: cached.members });
    }

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Ruptura/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 8000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchTelegramData(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data = parseTelegramPage(body);
          if (data.members !== null) {
            telegramCache.set(url, { ...data, timestamp: Date.now() });
          }
          resolve(data);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

module.exports = {
  fetchChangeOrgData,
  isValidChangeOrgUrl,
  fetchTelegramData,
  isValidTelegramUrl,
};
