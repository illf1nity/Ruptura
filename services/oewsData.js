/**
 * RUPTURA - OEWS Occupation Wage Distribution Data
 * ==================================================
 * BLS Occupational Employment and Wage Statistics (OEWS)
 * Wage distributions by sector for within-industry weighting.
 *
 * This addresses the "janitor at Goldman Sachs" problem:
 * without occupation adjustment, every worker in an industry
 * gets the same value-added attribution regardless of role.
 *
 * The adjustment uses the worker's wage relative to the industry
 * mean as a proxy for their occupation level. A worker earning
 * $15/hr in finance is not a trader — their share of industry
 * value-added should be proportionally lower.
 *
 * Formula: occupationAdjustment = workerWage / industryMeanWage
 * Clamped to [0.3, 2.5] to prevent extreme values.
 *
 * Source: BLS OEWS, vintage 2023
 * https://www.bls.gov/oes/
 */

// Industry-wide mean hourly wages and percentile distributions
// Mean wage is the normalization anchor: worker's wage / mean = adjustment factor
const OEWS_INDUSTRY_WAGES = {
  'tech': {
    meanWage: 55.00,
    medianWage: 48.00,
    percentiles: { p10: 22.00, p25: 32.00, p50: 48.00, p75: 72.00, p90: 95.00 },
  },
  'manufacturing': {
    meanWage: 28.50,
    medianWage: 24.00,
    percentiles: { p10: 14.50, p25: 18.00, p50: 24.00, p75: 35.00, p90: 48.00 },
  },
  'retail': {
    meanWage: 18.50,
    medianWage: 15.50,
    percentiles: { p10: 11.00, p25: 12.50, p50: 15.50, p75: 22.00, p90: 32.00 },
  },
  'healthcare': {
    meanWage: 38.00,
    medianWage: 32.00,
    percentiles: { p10: 14.50, p25: 20.00, p50: 32.00, p75: 50.00, p90: 72.00 },
  },
  'finance': {
    meanWage: 48.00,
    medianWage: 38.00,
    percentiles: { p10: 17.00, p25: 24.00, p50: 38.00, p75: 62.00, p90: 92.00 },
  },
  'construction': {
    meanWage: 30.00,
    medianWage: 26.00,
    percentiles: { p10: 16.00, p25: 20.00, p50: 26.00, p75: 38.00, p90: 50.00 },
  },
  'education': {
    meanWage: 30.00,
    medianWage: 28.00,
    percentiles: { p10: 14.00, p25: 20.00, p50: 28.00, p75: 38.00, p90: 52.00 },
  },
  'food_service': {
    meanWage: 16.00,
    medianWage: 14.00,
    percentiles: { p10: 10.00, p25: 11.50, p50: 14.00, p75: 18.00, p90: 26.00 },
  },
  'professional_services': {
    meanWage: 45.00,
    medianWage: 38.00,
    percentiles: { p10: 18.00, p25: 26.00, p50: 38.00, p75: 58.00, p90: 82.00 },
  },
  'transportation': {
    meanWage: 25.00,
    medianWage: 22.00,
    percentiles: { p10: 14.00, p25: 17.00, p50: 22.00, p75: 30.00, p90: 42.00 },
  },
  'government': {
    meanWage: 32.00,
    medianWage: 28.00,
    percentiles: { p10: 16.00, p25: 22.00, p50: 28.00, p75: 40.00, p90: 55.00 },
  },
  'national_average': {
    meanWage: 30.00,
    medianWage: 24.00,
    percentiles: { p10: 12.50, p25: 17.00, p50: 24.00, p75: 38.00, p90: 55.00 },
  }
};

// Role-level hierarchies by sector
// Each level maps to an OEWS percentile, providing a non-circular
// occupation adjustment when the worker declares their role.
// Labels reflect how workers in each industry actually describe their position.
const ROLE_LEVELS = {
  'tech': [
    { value: 'entry',  label: 'Intern / Entry Level',         percentile: 10 },
    { value: 'junior', label: 'Junior Developer / Analyst',   percentile: 25 },
    { value: 'mid',    label: 'Mid-Level Engineer / Designer', percentile: 50 },
    { value: 'senior', label: 'Senior / Team Lead',           percentile: 75 },
    { value: 'exec',   label: 'Director / VP / Executive',    percentile: 90 },
  ],
  'finance': [
    { value: 'entry',  label: 'Teller / Clerk',               percentile: 10 },
    { value: 'junior', label: 'Associate / Processor',        percentile: 25 },
    { value: 'mid',    label: 'Analyst / Underwriter',        percentile: 50 },
    { value: 'senior', label: 'Manager / AVP',                percentile: 75 },
    { value: 'exec',   label: 'Director / VP / Executive',    percentile: 90 },
  ],
  'manufacturing': [
    { value: 'entry',  label: 'Helper / General Laborer',     percentile: 10 },
    { value: 'junior', label: 'Operator / Assembler',         percentile: 25 },
    { value: 'mid',    label: 'Lead / Skilled Tradesperson',   percentile: 50 },
    { value: 'senior', label: 'Foreman / Supervisor',         percentile: 75 },
    { value: 'exec',   label: 'Plant Manager / Director',     percentile: 90 },
  ],
  'construction': [
    { value: 'entry',  label: 'Helper / Laborer',             percentile: 10 },
    { value: 'junior', label: 'Journeyman / Installer',       percentile: 25 },
    { value: 'mid',    label: 'Lead / Skilled Tradesperson',   percentile: 50 },
    { value: 'senior', label: 'Foreman / Superintendent',     percentile: 75 },
    { value: 'exec',   label: 'Project Manager / Director',   percentile: 90 },
  ],
  'retail': [
    { value: 'entry',  label: 'Cashier / Stocker',            percentile: 10 },
    { value: 'junior', label: 'Sales Associate',              percentile: 25 },
    { value: 'mid',    label: 'Department Lead / Specialist',  percentile: 50 },
    { value: 'senior', label: 'Assistant Manager',            percentile: 75 },
    { value: 'exec',   label: 'Store / District Manager',     percentile: 90 },
  ],
  'healthcare': [
    { value: 'entry',  label: 'Aide / Assistant',             percentile: 10 },
    { value: 'junior', label: 'Technician / LPN',             percentile: 25 },
    { value: 'mid',    label: 'RN / Therapist',               percentile: 50 },
    { value: 'senior', label: 'Specialist / NP / Supervisor', percentile: 75 },
    { value: 'exec',   label: 'Physician / Administrator',    percentile: 90 },
  ],
  'food_service': [
    { value: 'entry',  label: 'Crew / Dishwasher',            percentile: 10 },
    { value: 'junior', label: 'Cook / Host',                  percentile: 25 },
    { value: 'mid',    label: 'Shift Lead / Head Cook',       percentile: 50 },
    { value: 'senior', label: 'Assistant Manager',            percentile: 75 },
    { value: 'exec',   label: 'General Manager / Chef',       percentile: 90 },
  ],
  'education': [
    { value: 'entry',  label: 'Aide / Substitute',            percentile: 10 },
    { value: 'junior', label: 'Paraprofessional / Tutor',     percentile: 25 },
    { value: 'mid',    label: 'Teacher / Instructor',         percentile: 50 },
    { value: 'senior', label: 'Department Head / Coordinator', percentile: 75 },
    { value: 'exec',   label: 'Principal / Dean',             percentile: 90 },
  ],
  'professional_services': [
    { value: 'entry',  label: 'Admin / Junior Associate',     percentile: 10 },
    { value: 'junior', label: 'Associate / Specialist',       percentile: 25 },
    { value: 'mid',    label: 'Consultant / Senior Specialist', percentile: 50 },
    { value: 'senior', label: 'Manager / Senior Consultant',  percentile: 75 },
    { value: 'exec',   label: 'Partner / Director',           percentile: 90 },
  ],
  'transportation': [
    { value: 'entry',  label: 'Helper / Loader',              percentile: 10 },
    { value: 'junior', label: 'Driver / Operator',            percentile: 25 },
    { value: 'mid',    label: 'CDL / Licensed Driver',        percentile: 50 },
    { value: 'senior', label: 'Dispatcher / Supervisor',      percentile: 75 },
    { value: 'exec',   label: 'Fleet / Logistics Manager',    percentile: 90 },
  ],
  'government': [
    { value: 'entry',  label: 'Clerk (GS 1\u20135)',          percentile: 10 },
    { value: 'junior', label: 'Technician (GS 6\u20139)',     percentile: 25 },
    { value: 'mid',    label: 'Analyst (GS 10\u201312)',      percentile: 50 },
    { value: 'senior', label: 'Supervisor (GS 13\u201314)',   percentile: 75 },
    { value: 'exec',   label: 'Senior Executive (SES)',       percentile: 90 },
  ],
  'national_average': [
    { value: 'entry',  label: 'Entry Level',                  percentile: 10 },
    { value: 'junior', label: 'Junior / Associate',           percentile: 25 },
    { value: 'mid',    label: 'Mid-Level',                    percentile: 50 },
    { value: 'senior', label: 'Senior / Supervisor',          percentile: 75 },
    { value: 'exec',   label: 'Manager / Director',           percentile: 90 },
  ],
};

/**
 * Calculate within-industry occupation adjustment using declared role level.
 * Breaks the circularity of using wage-as-proxy by looking up the
 * OEWS percentile wage for the worker's declared role.
 *
 * Falls back to wage-based adjustment if no role level provided.
 *
 * @param {string} sector - Broad NAICS sector key
 * @param {string|null} roleLevel - Declared role level value (entry/junior/mid/senior/exec)
 * @param {number} hourlyWage - Worker's hourly wage (used for fallback and percentile estimate)
 * @returns {{ adjustment: number, industryMean: number, percentileEstimate: string, method: string }}
 */
function getOccupationAdjustmentByRole(sector, roleLevel, hourlyWage) {
  // No role level provided — fall back to wage-based proxy
  if (!roleLevel) {
    const result = getOccupationAdjustment(sector, hourlyWage);
    result.method = 'wage-proxy';
    return result;
  }

  const sectorData = OEWS_INDUSTRY_WAGES[sector] || OEWS_INDUSTRY_WAGES['national_average'];
  const roles = ROLE_LEVELS[sector] || ROLE_LEVELS['national_average'];
  const role = roles.find(r => r.value === roleLevel);

  if (!role) {
    const result = getOccupationAdjustment(sector, hourlyWage);
    result.method = 'wage-proxy';
    return result;
  }

  // Use the OEWS percentile wage for the declared role, not the worker's own wage
  const percentileWage = getPercentileWage(sector, role.percentile);
  const ratio = percentileWage / sectorData.meanWage;
  const adjustment = Math.max(0.3, Math.min(2.5, ratio));

  // Percentile estimate comes from the declared role, not the wage
  const percentileLabels = { 10: 'below 10th', 25: '10th-25th', 50: '25th-50th', 75: '50th-75th', 90: '75th-90th' };

  return {
    adjustment: Math.round(adjustment * 1000) / 1000,
    industryMean: sectorData.meanWage,
    industryMedian: sectorData.medianWage,
    percentileEstimate: percentileLabels[role.percentile] || '25th-50th',
    declaredRole: role.label,
    method: 'role-declared'
  };
}

/**
 * Calculate within-industry occupation adjustment
 * A worker earning below the industry mean gets adjustment < 1.0
 * A worker earning above gets adjustment > 1.0
 *
 * @param {string} sector - Broad NAICS sector key
 * @param {number} hourlyWage - Worker's hourly wage
 * @returns {{ adjustment: number, industryMean: number, percentileEstimate: string }}
 */
function getOccupationAdjustment(sector, hourlyWage) {
  const sectorData = OEWS_INDUSTRY_WAGES[sector] || OEWS_INDUSTRY_WAGES['national_average'];

  const ratio = hourlyWage / sectorData.meanWage;

  // Clamp to [0.3, 2.5] — prevents extreme distortion
  const adjustment = Math.max(0.3, Math.min(2.5, ratio));

  // Estimate percentile for context
  let percentileEstimate;
  const p = sectorData.percentiles;
  if (hourlyWage <= p.p10) percentileEstimate = 'below 10th';
  else if (hourlyWage <= p.p25) percentileEstimate = '10th-25th';
  else if (hourlyWage <= p.p50) percentileEstimate = '25th-50th';
  else if (hourlyWage <= p.p75) percentileEstimate = '50th-75th';
  else if (hourlyWage <= p.p90) percentileEstimate = '75th-90th';
  else percentileEstimate = 'above 90th';

  return {
    adjustment: Math.round(adjustment * 1000) / 1000,
    industryMean: sectorData.meanWage,
    industryMedian: sectorData.medianWage,
    percentileEstimate
  };
}

/**
 * Get the wage at a specific percentile for an industry
 * Useful for estimating missing starting salaries (Fix 3c)
 *
 * @param {string} sector - Broad NAICS sector key
 * @param {number} percentile - 10, 25, 50, 75, or 90
 * @returns {number|null} Hourly wage at that percentile
 */
function getPercentileWage(sector, percentile) {
  const sectorData = OEWS_INDUSTRY_WAGES[sector] || OEWS_INDUSTRY_WAGES['national_average'];
  const key = `p${percentile}`;
  return sectorData.percentiles[key] || null;
}

module.exports = {
  OEWS_INDUSTRY_WAGES,
  ROLE_LEVELS,
  getOccupationAdjustment,
  getOccupationAdjustmentByRole,
  getPercentileWage
};
