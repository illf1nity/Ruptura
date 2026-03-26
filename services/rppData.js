/**
 * RUPTURA - Regional Price Parities & State Industry Value-Added
 * ================================================================
 * Replaces crude GDP-per-capita MSA multiplier with:
 *   1. BEA Regional Price Parities (RPPs) — clean price-level adjustment
 *   2. State-level industry value-added per worker — productivity by location+industry
 *
 * RPPs measure the price level relative to national average (national = 100).
 * An RPP of 112 means prices are 12% above national average.
 * This eliminates headquarters effect, commuter distortion, and industry-composition
 * contamination that plagued the GDP-per-capita approach.
 *
 * Sources:
 *   - BEA Regional Price Parities (SARPP/MARPP), vintage 2022
 *   - BEA GDP by State and Industry (SAGDP), vintage 2023
 */

// ============================================
// STATE-LEVEL RPPs (BEA SARPP)
// ============================================
// All values: national average = 100.0
const STATE_RPP = {
  'AL': 87.1, 'AK': 105.5, 'AZ': 97.7, 'AR': 86.0,
  'CA': 113.4, 'CO': 105.1, 'CT': 108.0, 'DE': 101.5,
  'FL': 100.4, 'GA': 93.1, 'HI': 119.2, 'ID': 95.6,
  'IL': 97.7, 'IN': 90.5, 'IA': 89.8, 'KS': 90.4,
  'KY': 88.3, 'LA': 89.7, 'ME': 98.6, 'MD': 109.4,
  'MA': 110.3, 'MI': 93.0, 'MN': 98.0, 'MS': 84.9,
  'MO': 89.1, 'MT': 95.2, 'NE': 90.8, 'NV': 98.1,
  'NH': 107.1, 'NJ': 113.5, 'NM': 91.5, 'NY': 115.4,
  'NC': 92.3, 'ND': 92.4, 'OH': 90.5, 'OK': 88.6,
  'OR': 101.5, 'PA': 97.3, 'RI': 100.4, 'SC': 90.4,
  'SD': 90.1, 'TN': 90.8, 'TX': 96.4, 'UT': 98.4,
  'VT': 102.2, 'VA': 103.7, 'WA': 107.4, 'WV': 86.7,
  'WI': 93.2, 'WY': 94.3, 'DC': 117.3,
  'default': 100.0
};

// ============================================
// METRO-LEVEL RPPs (BEA MARPP)
// ============================================
// Major MSAs — same format, national = 100.0
const METRO_RPP = {
  'New York-Newark-Jersey City, NY-NJ-PA': 122.5,
  'Los Angeles-Long Beach-Anaheim, CA': 116.8,
  'Chicago-Naperville-Elgin, IL-IN-WI': 102.7,
  'Dallas-Fort Worth-Arlington, TX': 99.4,
  'Houston-The Woodlands-Sugar Land, TX': 97.8,
  'Washington-Arlington-Alexandria, DC-VA-MD-WV': 113.8,
  'San Francisco-Oakland-Berkeley, CA': 125.3,
  'Boston-Cambridge-Newton, MA-NH': 115.2,
  'Seattle-Tacoma-Bellevue, WA': 112.4,
  'San Jose-Sunnyvale-Santa Clara, CA': 127.1,
  'Philadelphia-Camden-Wilmington, PA-NJ-DE-MD': 103.6,
  'Miami-Fort Lauderdale-Pompano Beach, FL': 107.5,
  'Atlanta-Sandy Springs-Alpharetta, GA': 96.7,
  'Phoenix-Mesa-Chandler, AZ': 98.3,
  'Detroit-Warren-Dearborn, MI': 94.3,
  'Minneapolis-St. Paul-Bloomington, MN-WI': 101.6,
  'San Diego-Chula Vista-Carlsbad, CA': 116.2,
  'Denver-Aurora-Lakewood, CO': 107.9,
  'Portland-Vancouver-Hillsboro, OR-WA': 106.3,
  'Tampa-St. Petersburg-Clearwater, FL': 96.5,
  'St. Louis, MO-IL': 89.8,
  'Baltimore-Columbia-Towson, MD': 107.2,
  'Charlotte-Concord-Gastonia, NC-SC': 95.4,
  'San Antonio-New Braunfels, TX': 92.1,
  'Austin-Round Rock-Georgetown, TX': 101.8,
  'Pittsburgh, PA': 93.1,
  'Las Vegas-Henderson-Paradise, NV': 99.4,
  'Nashville-Davidson-Murfreesboro-Franklin, TN': 96.2,
  'Kansas City, MO-KS': 92.5,
  'Columbus, OH': 93.8,
  'Indianapolis-Carmel-Anderson, IN': 91.7,
  'Cleveland-Elyria, OH': 91.4,
  'Raleigh-Cary, NC': 97.1,
  'Milwaukee-Waukesha, WI': 96.8,
  'Salt Lake City, UT': 99.1,
  'default': 100.0
};

// ============================================
// STATE-LEVEL INDUSTRY VALUE ADDED PER WORKER
// ============================================
// BEA SAGDP: Value added per FTE employee by state and NAICS sector
// Used to compute industry-location-specific productivity
// Values in annual dollars (2023 vintage)
const STATE_INDUSTRY_VALUE_ADDED = {
  'CA': {
    'tech':                   { valueAddedPerWorker: 285000, avgCompPerWorker: 165000 },
    'manufacturing':          { valueAddedPerWorker: 195000, avgCompPerWorker: 85000 },
    'retail':                 { valueAddedPerWorker: 68000,  avgCompPerWorker: 42000 },
    'healthcare':             { valueAddedPerWorker: 95000,  avgCompPerWorker: 72000 },
    'finance':                { valueAddedPerWorker: 235000, avgCompPerWorker: 120000 },
    'construction':           { valueAddedPerWorker: 105000, avgCompPerWorker: 72000 },
    'education':              { valueAddedPerWorker: 58000,  avgCompPerWorker: 52000 },
    'food_service':           { valueAddedPerWorker: 38000,  avgCompPerWorker: 28000 },
    'professional_services':  { valueAddedPerWorker: 175000, avgCompPerWorker: 105000 },
    'transportation':         { valueAddedPerWorker: 115000, avgCompPerWorker: 62000 },
    'government':             { valueAddedPerWorker: 82000,  avgCompPerWorker: 78000 },
    'national_average':       { valueAddedPerWorker: 145000, avgCompPerWorker: 82000 },
  },
  'TX': {
    'tech':                   { valueAddedPerWorker: 240000, avgCompPerWorker: 140000 },
    'manufacturing':          { valueAddedPerWorker: 210000, avgCompPerWorker: 78000 },
    'retail':                 { valueAddedPerWorker: 62000,  avgCompPerWorker: 36000 },
    'healthcare':             { valueAddedPerWorker: 88000,  avgCompPerWorker: 65000 },
    'finance':                { valueAddedPerWorker: 215000, avgCompPerWorker: 105000 },
    'construction':           { valueAddedPerWorker: 98000,  avgCompPerWorker: 58000 },
    'education':              { valueAddedPerWorker: 52000,  avgCompPerWorker: 46000 },
    'food_service':           { valueAddedPerWorker: 32000,  avgCompPerWorker: 24000 },
    'professional_services':  { valueAddedPerWorker: 155000, avgCompPerWorker: 92000 },
    'transportation':         { valueAddedPerWorker: 125000, avgCompPerWorker: 58000 },
    'government':             { valueAddedPerWorker: 75000,  avgCompPerWorker: 70000 },
    'national_average':       { valueAddedPerWorker: 135000, avgCompPerWorker: 72000 },
  },
  'NY': {
    'tech':                   { valueAddedPerWorker: 310000, avgCompPerWorker: 180000 },
    'manufacturing':          { valueAddedPerWorker: 170000, avgCompPerWorker: 82000 },
    'retail':                 { valueAddedPerWorker: 72000,  avgCompPerWorker: 45000 },
    'healthcare':             { valueAddedPerWorker: 98000,  avgCompPerWorker: 75000 },
    'finance':                { valueAddedPerWorker: 385000, avgCompPerWorker: 195000 },
    'construction':           { valueAddedPerWorker: 115000, avgCompPerWorker: 82000 },
    'education':              { valueAddedPerWorker: 62000,  avgCompPerWorker: 58000 },
    'food_service':           { valueAddedPerWorker: 42000,  avgCompPerWorker: 32000 },
    'professional_services':  { valueAddedPerWorker: 195000, avgCompPerWorker: 125000 },
    'transportation':         { valueAddedPerWorker: 105000, avgCompPerWorker: 62000 },
    'government':             { valueAddedPerWorker: 88000,  avgCompPerWorker: 85000 },
    'national_average':       { valueAddedPerWorker: 165000, avgCompPerWorker: 95000 },
  },
  'FL': {
    'tech':                   { valueAddedPerWorker: 210000, avgCompPerWorker: 125000 },
    'manufacturing':          { valueAddedPerWorker: 155000, avgCompPerWorker: 68000 },
    'retail':                 { valueAddedPerWorker: 58000,  avgCompPerWorker: 34000 },
    'healthcare':             { valueAddedPerWorker: 82000,  avgCompPerWorker: 62000 },
    'finance':                { valueAddedPerWorker: 190000, avgCompPerWorker: 95000 },
    'construction':           { valueAddedPerWorker: 88000,  avgCompPerWorker: 55000 },
    'education':              { valueAddedPerWorker: 48000,  avgCompPerWorker: 42000 },
    'food_service':           { valueAddedPerWorker: 35000,  avgCompPerWorker: 26000 },
    'professional_services':  { valueAddedPerWorker: 145000, avgCompPerWorker: 85000 },
    'transportation':         { valueAddedPerWorker: 95000,  avgCompPerWorker: 52000 },
    'government':             { valueAddedPerWorker: 72000,  avgCompPerWorker: 68000 },
    'national_average':       { valueAddedPerWorker: 118000, avgCompPerWorker: 68000 },
  },
  'IL': {
    'tech':                   { valueAddedPerWorker: 245000, avgCompPerWorker: 145000 },
    'manufacturing':          { valueAddedPerWorker: 185000, avgCompPerWorker: 78000 },
    'retail':                 { valueAddedPerWorker: 62000,  avgCompPerWorker: 38000 },
    'healthcare':             { valueAddedPerWorker: 92000,  avgCompPerWorker: 70000 },
    'finance':                { valueAddedPerWorker: 250000, avgCompPerWorker: 130000 },
    'construction':           { valueAddedPerWorker: 108000, avgCompPerWorker: 72000 },
    'education':              { valueAddedPerWorker: 55000,  avgCompPerWorker: 50000 },
    'food_service':           { valueAddedPerWorker: 36000,  avgCompPerWorker: 28000 },
    'professional_services':  { valueAddedPerWorker: 165000, avgCompPerWorker: 100000 },
    'transportation':         { valueAddedPerWorker: 110000, avgCompPerWorker: 58000 },
    'government':             { valueAddedPerWorker: 80000,  avgCompPerWorker: 75000 },
    'national_average':       { valueAddedPerWorker: 132000, avgCompPerWorker: 75000 },
  },
  'WA': {
    'tech':                   { valueAddedPerWorker: 320000, avgCompPerWorker: 185000 },
    'manufacturing':          { valueAddedPerWorker: 225000, avgCompPerWorker: 92000 },
    'retail':                 { valueAddedPerWorker: 72000,  avgCompPerWorker: 44000 },
    'healthcare':             { valueAddedPerWorker: 95000,  avgCompPerWorker: 72000 },
    'finance':                { valueAddedPerWorker: 195000, avgCompPerWorker: 105000 },
    'construction':           { valueAddedPerWorker: 108000, avgCompPerWorker: 72000 },
    'education':              { valueAddedPerWorker: 58000,  avgCompPerWorker: 52000 },
    'food_service':           { valueAddedPerWorker: 40000,  avgCompPerWorker: 32000 },
    'professional_services':  { valueAddedPerWorker: 185000, avgCompPerWorker: 115000 },
    'transportation':         { valueAddedPerWorker: 118000, avgCompPerWorker: 62000 },
    'government':             { valueAddedPerWorker: 85000,  avgCompPerWorker: 80000 },
    'national_average':       { valueAddedPerWorker: 148000, avgCompPerWorker: 85000 },
  },
  'PA': {
    'tech':                   { valueAddedPerWorker: 215000, avgCompPerWorker: 130000 },
    'manufacturing':          { valueAddedPerWorker: 175000, avgCompPerWorker: 72000 },
    'retail':                 { valueAddedPerWorker: 58000,  avgCompPerWorker: 36000 },
    'healthcare':             { valueAddedPerWorker: 90000,  avgCompPerWorker: 68000 },
    'finance':                { valueAddedPerWorker: 210000, avgCompPerWorker: 108000 },
    'construction':           { valueAddedPerWorker: 100000, avgCompPerWorker: 68000 },
    'education':              { valueAddedPerWorker: 54000,  avgCompPerWorker: 48000 },
    'food_service':           { valueAddedPerWorker: 34000,  avgCompPerWorker: 26000 },
    'professional_services':  { valueAddedPerWorker: 155000, avgCompPerWorker: 95000 },
    'transportation':         { valueAddedPerWorker: 105000, avgCompPerWorker: 55000 },
    'government':             { valueAddedPerWorker: 78000,  avgCompPerWorker: 72000 },
    'national_average':       { valueAddedPerWorker: 125000, avgCompPerWorker: 72000 },
  },
  'OH': {
    'tech':                   { valueAddedPerWorker: 195000, avgCompPerWorker: 115000 },
    'manufacturing':          { valueAddedPerWorker: 175000, avgCompPerWorker: 68000 },
    'retail':                 { valueAddedPerWorker: 55000,  avgCompPerWorker: 34000 },
    'healthcare':             { valueAddedPerWorker: 85000,  avgCompPerWorker: 62000 },
    'finance':                { valueAddedPerWorker: 185000, avgCompPerWorker: 95000 },
    'construction':           { valueAddedPerWorker: 92000,  avgCompPerWorker: 62000 },
    'education':              { valueAddedPerWorker: 50000,  avgCompPerWorker: 45000 },
    'food_service':           { valueAddedPerWorker: 30000,  avgCompPerWorker: 24000 },
    'professional_services':  { valueAddedPerWorker: 140000, avgCompPerWorker: 85000 },
    'transportation':         { valueAddedPerWorker: 100000, avgCompPerWorker: 52000 },
    'government':             { valueAddedPerWorker: 72000,  avgCompPerWorker: 68000 },
    'national_average':       { valueAddedPerWorker: 115000, avgCompPerWorker: 65000 },
  },
  'MI': {
    'tech':                   { valueAddedPerWorker: 200000, avgCompPerWorker: 120000 },
    'manufacturing':          { valueAddedPerWorker: 195000, avgCompPerWorker: 75000 },
    'retail':                 { valueAddedPerWorker: 55000,  avgCompPerWorker: 34000 },
    'healthcare':             { valueAddedPerWorker: 85000,  avgCompPerWorker: 65000 },
    'finance':                { valueAddedPerWorker: 175000, avgCompPerWorker: 88000 },
    'construction':           { valueAddedPerWorker: 92000,  avgCompPerWorker: 62000 },
    'education':              { valueAddedPerWorker: 50000,  avgCompPerWorker: 46000 },
    'food_service':           { valueAddedPerWorker: 30000,  avgCompPerWorker: 24000 },
    'professional_services':  { valueAddedPerWorker: 135000, avgCompPerWorker: 82000 },
    'transportation':         { valueAddedPerWorker: 105000, avgCompPerWorker: 55000 },
    'government':             { valueAddedPerWorker: 75000,  avgCompPerWorker: 70000 },
    'national_average':       { valueAddedPerWorker: 118000, avgCompPerWorker: 65000 },
  },
  'GA': {
    'tech':                   { valueAddedPerWorker: 225000, avgCompPerWorker: 135000 },
    'manufacturing':          { valueAddedPerWorker: 165000, avgCompPerWorker: 68000 },
    'retail':                 { valueAddedPerWorker: 58000,  avgCompPerWorker: 35000 },
    'healthcare':             { valueAddedPerWorker: 85000,  avgCompPerWorker: 62000 },
    'finance':                { valueAddedPerWorker: 205000, avgCompPerWorker: 100000 },
    'construction':           { valueAddedPerWorker: 92000,  avgCompPerWorker: 55000 },
    'education':              { valueAddedPerWorker: 48000,  avgCompPerWorker: 42000 },
    'food_service':           { valueAddedPerWorker: 32000,  avgCompPerWorker: 25000 },
    'professional_services':  { valueAddedPerWorker: 150000, avgCompPerWorker: 90000 },
    'transportation':         { valueAddedPerWorker: 115000, avgCompPerWorker: 55000 },
    'government':             { valueAddedPerWorker: 72000,  avgCompPerWorker: 68000 },
    'national_average':       { valueAddedPerWorker: 122000, avgCompPerWorker: 68000 },
  },
  'MS': {
    'tech':                   { valueAddedPerWorker: 165000, avgCompPerWorker: 95000 },
    'manufacturing':          { valueAddedPerWorker: 155000, avgCompPerWorker: 58000 },
    'retail':                 { valueAddedPerWorker: 48000,  avgCompPerWorker: 28000 },
    'healthcare':             { valueAddedPerWorker: 72000,  avgCompPerWorker: 52000 },
    'finance':                { valueAddedPerWorker: 145000, avgCompPerWorker: 72000 },
    'construction':           { valueAddedPerWorker: 78000,  avgCompPerWorker: 48000 },
    'education':              { valueAddedPerWorker: 42000,  avgCompPerWorker: 38000 },
    'food_service':           { valueAddedPerWorker: 26000,  avgCompPerWorker: 20000 },
    'professional_services':  { valueAddedPerWorker: 115000, avgCompPerWorker: 68000 },
    'transportation':         { valueAddedPerWorker: 88000,  avgCompPerWorker: 45000 },
    'government':             { valueAddedPerWorker: 62000,  avgCompPerWorker: 58000 },
    'national_average':       { valueAddedPerWorker: 92000,  avgCompPerWorker: 52000 },
  },
  // National defaults for states without explicit data
  'default': {
    'tech':                   { valueAddedPerWorker: 220000, avgCompPerWorker: 135000 },
    'manufacturing':          { valueAddedPerWorker: 175000, avgCompPerWorker: 72000 },
    'retail':                 { valueAddedPerWorker: 60000,  avgCompPerWorker: 36000 },
    'healthcare':             { valueAddedPerWorker: 88000,  avgCompPerWorker: 65000 },
    'finance':                { valueAddedPerWorker: 210000, avgCompPerWorker: 105000 },
    'construction':           { valueAddedPerWorker: 95000,  avgCompPerWorker: 62000 },
    'education':              { valueAddedPerWorker: 52000,  avgCompPerWorker: 46000 },
    'food_service':           { valueAddedPerWorker: 32000,  avgCompPerWorker: 25000 },
    'professional_services':  { valueAddedPerWorker: 155000, avgCompPerWorker: 95000 },
    'transportation':         { valueAddedPerWorker: 105000, avgCompPerWorker: 55000 },
    'government':             { valueAddedPerWorker: 75000,  avgCompPerWorker: 72000 },
    'national_average':       { valueAddedPerWorker: 125000, avgCompPerWorker: 72000 },
  }
};

/**
 * Get RPP for a location (metro > state > national fallback)
 * @param {string} msa - Metropolitan Statistical Area name
 * @param {string} state - Two-letter state code
 * @returns {{ rpp: number, source: string }}
 */
function getRPP(msa, state) {
  if (msa && METRO_RPP[msa]) {
    return { rpp: METRO_RPP[msa], source: `BEA RPP for ${msa}` };
  }
  if (state && STATE_RPP[state]) {
    return { rpp: STATE_RPP[state], source: `BEA RPP for ${state}` };
  }
  return { rpp: 100.0, source: 'National baseline (RPP = 100)' };
}

/**
 * Get industry value-added ratio for a state+sector
 * Returns how much value each worker creates relative to compensation
 * @param {string} state - Two-letter state code
 * @param {string} sector - Broad NAICS sector key
 * @returns {{ valueAddedPerWorker: number, avgCompPerWorker: number, ratio: number }}
 */
function getStateIndustryVA(state, sector) {
  const stateData = STATE_INDUSTRY_VALUE_ADDED[state] || STATE_INDUSTRY_VALUE_ADDED['default'];
  const sectorData = stateData[sector] || stateData['national_average'];
  return {
    valueAddedPerWorker: sectorData.valueAddedPerWorker,
    avgCompPerWorker: sectorData.avgCompPerWorker,
    ratio: Math.round((sectorData.valueAddedPerWorker / sectorData.avgCompPerWorker) * 1000) / 1000
  };
}

module.exports = {
  STATE_RPP,
  METRO_RPP,
  STATE_INDUSTRY_VALUE_ADDED,
  getRPP,
  getStateIndustryVA
};
