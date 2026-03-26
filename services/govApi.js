/**
 * RUPTURA — Government API Integration
 * ======================================
 * BLS (Bureau of Labor Statistics) and HUD (Housing & Urban Development)
 * API wrappers with caching. Falls back gracefully when API keys are missing.
 */

const https = require('https');

const BLS_API_KEY = process.env.BLS_API_KEY || '';
const HUD_API_KEY = process.env.HUD_API_KEY || '';
const BEA_API_KEY = process.env.BEA_API_KEY || '';

const apiCache = new Map();
const API_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const OEWS_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days (OEWS is annual)

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

// ============================================
// BLS — CES STATE AVERAGE HOURLY EARNINGS
// ============================================
// Fetches average hourly earnings (all private workers) for every state
// using Current Employment Statistics (CES) — a monthly time series.
// Series format: SMU + StateFIPS(2) + AreaCode(5) + SuperSector(2) + DataType(6)
// SuperSector 05 = Total Private, DataType 000003 = Avg Hourly Earnings (All Employees)
// BLS v2 allows 50 series per request — we batch in two calls (51 states+DC).

const STATE_FIPS = {
  'AL':'01','AK':'02','AZ':'04','AR':'05','CA':'06','CO':'08','CT':'09','DE':'10',
  'DC':'11','FL':'12','GA':'13','HI':'15','ID':'16','IL':'17','IN':'18','IA':'19',
  'KS':'20','KY':'21','LA':'22','ME':'23','MD':'24','MA':'25','MI':'26','MN':'27',
  'MS':'28','MO':'29','MT':'30','NE':'31','NV':'32','NH':'33','NJ':'34','NM':'35',
  'NY':'36','NC':'37','ND':'38','OH':'39','OK':'40','OR':'41','PA':'42','RI':'44',
  'SC':'45','SD':'46','TN':'47','TX':'48','UT':'49','VT':'50','VA':'51','WA':'53',
  'WV':'54','WI':'55','WY':'56'
};
const FIPS_TO_STATE = Object.fromEntries(Object.entries(STATE_FIPS).map(([s, f]) => [f, s]));

async function fetchCESStateWages() {
  const cacheKey = 'ces_state_wages';
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < OEWS_CACHE_TTL) {
    return cached.data;
  }

  if (!BLS_API_KEY) {
    console.warn('BLS_API_KEY not configured — CES live data unavailable (using hardcoded fallback)');
    return null;
  }

  try {
    const states = Object.entries(STATE_FIPS);
    // SMU + FIPS(2) + 00000(statewide) + 05(total private) + 000003(avg hourly earnings)
    const allSeriesIds = states.map(([, fips]) => `SMU${fips}000000500000003`);

    const currentYear = new Date().getFullYear();

    // BLS v2 allows max 50 series per request — split into batches
    const batchSize = 50;
    const result = {};
    let count = 0;

    for (let i = 0; i < allSeriesIds.length; i += batchSize) {
      const batch = allSeriesIds.slice(i, i + batchSize);

      const response = await httpsPost('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
        seriesid: batch,
        startyear: (currentYear - 1).toString(),
        endyear: currentYear.toString(),
        registrationkey: BLS_API_KEY
      });

      if (response.status !== 'REQUEST_SUCCEEDED' || !response.Results || !response.Results.series) {
        throw new Error(`BLS CES API: ${response.message || 'no results'}`);
      }

      for (const series of response.Results.series) {
        // Extract state FIPS from series ID (chars 3-4)
        const fips = series.seriesID.substring(3, 5);
        const stateCode = FIPS_TO_STATE[fips];
        if (!stateCode || series.data.length === 0) continue;

        // Get the most recent monthly value
        const sorted = series.data.sort((a, b) => {
          const ya = parseInt(a.year), yb = parseInt(b.year);
          if (ya !== yb) return yb - ya;
          return parseInt(b.period.replace('M', '')) - parseInt(a.period.replace('M', ''));
        });

        const wage = parseFloat(sorted[0].value);
        if (wage > 0) {
          result[stateCode] = wage;
          count++;
        }
      }
    }

    if (count > 0) {
      console.log(`BLS CES: updated ${count} state avg hourly wages (live data)`);
      apiCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    return null;
  } catch (error) {
    console.error('BLS CES API error:', error.message);
    return null;
  }
}

// ============================================
// BEA — REGIONAL PRICE PARITIES
// ============================================
// Fetches state-level RPPs (all items) from BEA Regional data API.
// RPP = 100 is national average. Higher = more expensive.

async function fetchBEARPPs() {
  const cacheKey = 'bea_rpps';
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < OEWS_CACHE_TTL) {
    return cached.data;
  }

  if (!BEA_API_KEY) {
    console.warn('BEA_API_KEY not configured — RPP live data unavailable (using hardcoded fallback)');
    return null;
  }

  try {
    const url = `https://apps.bea.gov/api/data/?UserID=${encodeURIComponent(BEA_API_KEY)}` +
      `&method=GetData&DataSetName=Regional&TableName=SARPP&LineCode=1&GeoFips=STATE&Year=LAST5` +
      `&ResultFormat=JSON`;

    const response = await httpsRequest(url);

    if (!response || !response.BEAAPI || !response.BEAAPI.Results || !response.BEAAPI.Results.Data) {
      throw new Error('BEA RPP: unexpected response format');
    }

    const data = response.BEAAPI.Results.Data;
    const result = {};
    let count = 0;

    // Group by GeoFips, take most recent year
    const byGeo = {};
    for (const row of data) {
      if (!row.DataValue || row.DataValue === '(NA)') continue;
      const fips = row.GeoFips;
      const year = parseInt(row.TimePeriod);
      if (!byGeo[fips] || year > byGeo[fips].year) {
        byGeo[fips] = { year, value: parseFloat(row.DataValue), name: row.GeoName };
      }
    }

    // Map FIPS to state codes
    for (const [fips, { value, name }] of Object.entries(byGeo)) {
      // BEA uses 5-digit GeoFips for states: "01000" for AL, etc.
      const fips2 = fips.substring(0, 2);
      const stateCode = FIPS_TO_STATE[fips2];
      if (stateCode && !isNaN(value)) {
        result[stateCode] = value;
        count++;
      }
    }

    if (count > 0) {
      console.log(`BEA RPP: updated ${count} state price parities (live data)`);
      apiCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    return null;
  } catch (error) {
    console.error('BEA RPP API error:', error.message);
    return null;
  }
}

// ============================================
// STARTUP DATA REFRESH
// ============================================
// Called once on server start. Updates hardcoded data objects in-place
// with live API data. Falls back silently if APIs are unavailable.

async function refreshLiveData({ STATE_WAGE_DATA, STATE_RPP }) {
  const results = { rpp: false };

  // NOTE: We intentionally do NOT overwrite STATE_WAGE_DATA with CES data.
  // CES "average hourly earnings" is a different statistic than the OEWS
  // "median hourly wage" the calculation engine was calibrated against.
  // CES includes overtime/shift differentials and averages run 40-60% higher
  // than OEWS medians, which distorts gap calculations.
  // STATE_WAGE_DATA retains its hardcoded OEWS-sourced values.

  // Fetch BEA RPPs (safe to update — RPPs are the same statistic regardless)
  const rppData = await fetchBEARPPs();

  // Merge BEA RPPs into rppData
  if (rppData) {
    let updated = 0;
    for (const [state, rpp] of Object.entries(rppData)) {
      if (rpp > 0) {
        STATE_RPP[state] = rpp;
        updated++;
      }
    }
    if (updated > 0) {
      results.rpp = true;
      console.log(`Live data: ${updated} state RPPs updated from BEA`);
    }
  }

  return results;
}

module.exports = {
  fetchCPIData,
  fetchHUDRentData,
  fetchHUDStateData,
  fetchCESStateWages,
  fetchBEARPPs,
  refreshLiveData,
};
