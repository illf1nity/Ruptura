/**
 * RUPTURA — Government API Integration
 * ======================================
 * BLS (Bureau of Labor Statistics) and HUD (Housing & Urban Development)
 * API wrappers with caching. Falls back gracefully when API keys are missing.
 */

const https = require('https');

const BLS_API_KEY = process.env.BLS_API_KEY || '';
const HUD_API_KEY = process.env.HUD_API_KEY || '';

const apiCache = new Map();
const API_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ============================================
// HTTP HELPERS
// ============================================

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Ruptura/1.0',
        'Accept': 'application/json',
        ...options.headers
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function httpsPost(url, payload, options = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const urlObj = new URL(url);

    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        ...options.headers
      },
      timeout: 10000,
    };

    const req = https.request(reqOptions, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(data);
    req.end();
  });
}

// ============================================
// BLS — CPI INFLATION DATA
// ============================================

async function fetchCPIData(startYear, endYear) {
  const cacheKey = `cpi_${startYear}_${endYear}`;
  const cached = apiCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < API_CACHE_TTL) {
    return cached.data;
  }

  try {
    const seriesId = 'CUUR0000SA0';
    const url = BLS_API_KEY
      ? 'https://api.bls.gov/publicAPI/v2/timeseries/data/'
      : 'https://api.bls.gov/publicAPI/v1/timeseries/data/';

    const payload = {
      seriesid: [seriesId],
      startyear: startYear.toString(),
      endyear: endYear.toString(),
      ...(BLS_API_KEY && { registrationkey: BLS_API_KEY })
    };

    const response = await httpsPost(url, payload);

    if (response.status !== 'REQUEST_SUCCEEDED') {
      throw new Error(`BLS API error: ${response.message || 'Unknown error'}`);
    }

    const data = {};
    if (response.Results && response.Results.series && response.Results.series[0]) {
      const series = response.Results.series[0].data;

      const yearlyData = {};
      series.forEach(entry => {
        const year = parseInt(entry.year);
        const period = entry.period;
        const value = parseFloat(entry.value);

        if (period === 'M12' || period === 'M13') {
          yearlyData[year] = value;
        }
      });

      const years = Object.keys(yearlyData).map(Number).sort();
      for (let i = 1; i < years.length; i++) {
        const currentYear = years[i];
        const previousYear = years[i - 1];
        const inflationRate = (yearlyData[currentYear] - yearlyData[previousYear]) / yearlyData[previousYear];
        data[currentYear] = inflationRate;
      }
    }

    apiCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error('BLS CPI API error:', error.message);
    return null;
  }
}

// ============================================
// HUD — FAIR MARKET RENT DATA
// ============================================

async function fetchHUDRentData(zipCode) {
  const cacheKey = `hud_fmr_${zipCode}`;
  const cached = apiCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < API_CACHE_TTL) {
    return cached.data;
  }

  if (!HUD_API_KEY) {
    console.warn('HUD_API_KEY not configured - cannot fetch FMR data');
    return null;
  }

  try {
    const formattedZip = zipCode.toString().padStart(5, '0').slice(0, 5);
    const year = new Date().getFullYear();

    const url = `https://www.huduser.gov/hudapi/public/fmr/data/${formattedZip}?year=${year}`;

    const data = await httpsRequest(url, {
      headers: { 'Authorization': `Bearer ${HUD_API_KEY}` }
    });

    if (data && data.data && data.data.basicdata) {
      const fmrData = {
        rent_0br: parseInt(data.data.basicdata.rent_0br) || 0,
        rent_1br: parseInt(data.data.basicdata.rent_1br) || 0,
        rent_2br: parseInt(data.data.basicdata.rent_2br) || 0,
        rent_3br: parseInt(data.data.basicdata.rent_3br) || 0,
        rent_4br: parseInt(data.data.basicdata.rent_4br) || 0,
        area_name: data.data.basicdata.area_name || '',
        county_name: data.data.basicdata.county_name || '',
        state_alpha: data.data.basicdata.state_alpha || ''
      };

      apiCache.set(cacheKey, { data: fmrData, timestamp: Date.now() });
      return fmrData;
    }

    return null;
  } catch (error) {
    console.error('HUD API error:', error.message);
    return null;
  }
}

async function fetchHUDStateData(stateCode) {
  const cacheKey = `hud_state_${stateCode}`;
  const cached = apiCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < API_CACHE_TTL) {
    return cached.data;
  }

  if (!HUD_API_KEY) {
    console.warn('HUD_API_KEY not configured - cannot fetch state FMR data');
    return null;
  }

  try {
    const year = new Date().getFullYear();
    const url = `https://www.huduser.gov/hudapi/public/fmr/statedata/${stateCode}?year=${year}`;

    const data = await httpsRequest(url, {
      headers: { 'Authorization': `Bearer ${HUD_API_KEY}` }
    });

    if (data && data.data) {
      apiCache.set(cacheKey, { data: data.data, timestamp: Date.now() });
      return data.data;
    }

    return null;
  } catch (error) {
    console.error('HUD State API error:', error.message);
    return null;
  }
}

module.exports = {
  fetchCPIData,
  fetchHUDRentData,
  fetchHUDStateData,
};
