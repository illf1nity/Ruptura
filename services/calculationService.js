/**
 * RUPTURA - Calculation Service
 * =====================================
 * Centralized economic calculations for worth gap analysis,
 * negotiation preparation, and impact visualization.
 *
 * Methodology fixes applied:
 *   Fix 1: RPP-based regional price adjustment (replaces GDP-per-capita multiplier)
 *   Fix 2: Normalized experience multiplier (industry average = 1.0)
 *   Fix 3: Edge case guards (clamp, bounds, missing data defaults)
 *   Fix 4: OEWS occupation-within-industry weighting
 *   Fix 5: Stratified benefits multiplier (replaces flat 1.25-1.40 range)
 *   Fix 6: Benefits context in worth gap output
 */

const { YEARLY_ECONOMIC_DATA } = require('../db');
const { INDUSTRY_ECONOMIC_DATA, resolveIndustrySector, SECTOR_CONFIGS } = require('./industryData');

// 48 weeks x 35 hours — shared constant for hourly-to-annual conversions
const ANNUAL_WORK_HOURS = 1680;
const { getRPP, getStateIndustryVA } = require('./rppData');
const { getOccupationAdjustment, getOccupationAdjustmentByRole, getPercentileWage, ROLE_LEVELS } = require('./oewsData');
const { getBenefitsMultiplier } = require('./benefitsData');

// ============================================
// FIX 2 & 3: NORMALIZED EXPERIENCE MULTIPLIER
// ============================================

// Industry-typical median years in role (BLS Employee Tenure Summary, 2024)
// Used to normalize experience multiplier so industry average = 1.0
const INDUSTRY_MEDIAN_EXPERIENCE = {
  'tech': 5,
  'manufacturing': 12,
  'retail': 4,
  'healthcare': 8,
  'finance': 10,
  'construction': 10,
  'education': 12,
  'food_service': 3,
  'professional_services': 8,
  'transportation': 10,
  'government': 14,
  'national_average': 8
};

/**
 * Calculate experience multiplier normalized to industry median
 * A worker with industry-median experience gets multiplier = 1.0
 * More experience > 1.0, less experience < 1.0
 *
 * Fix 2: Normalization prevents unbounded inflation
 * Fix 3: Clamped to [0.5, 2.0], handles E < 1
 *
 * @param {number} yearsExperience - Years of experience in this role
 * @param {string} sector - Broad NAICS sector key
 * @returns {number} Normalized experience multiplier
 */
function calculateNormalizedExperienceMultiplier(yearsExperience, sector) {
  const GROWTH_FACTOR = 0.10;
  const medianExp = INDUSTRY_MEDIAN_EXPERIENCE[sector] || INDUSTRY_MEDIAN_EXPERIENCE['national_average'];

  // Fix 3a: Workers with < 1 year get a below-average multiplier
  // but not zero — they still contribute, just below the median
  const effectiveExperience = Math.max(0, yearsExperience);

  // Raw multiplier for this worker
  const rawMultiplier = 1 + (GROWTH_FACTOR * Math.log(effectiveExperience + 1));

  // Expected multiplier for the industry-median worker
  const expectedMultiplier = 1 + (GROWTH_FACTOR * Math.log(medianExp + 1));

  // Normalize: industry average experience = 1.0
  const normalized = rawMultiplier / expectedMultiplier;

  // Fix 3b: Clamp to [0.5, 2.0] to prevent extreme values
  // (e.g., from career changers with unusual experience patterns)
  return Math.max(0.5, Math.min(2.0, normalized));
}

// ============================================
// FIX 10: LABOR-SHARE-DERIVED PRODUCTIVITY ADJUSTMENT
// ============================================
// Replaces the arbitrary 25% conservative share with a sector-specific
// ratio derived from BEA NIPA labor share data (Tables 1.12, 6.2D).
//
// Logic: labor's share of national income peaked around 1970 (~65%)
// and has declined to ~56%. This decline is the productivity-wage gap
// expressed as income redistribution. A worker who started in 1990
// experienced a fraction of the total decline; a 1975 starter experienced
// nearly all of it.
//
// The adjustment = effectiveShare / currentShare, where effectiveShare
// is the labor share that "should" apply based on career overlap with
// the decline period. This replaces the flat 0.25 with values ranging
// from ~1.01 (2020 starter) to ~1.16 (1975 starter, national avg).

/**
 * Calculate labor-share-derived productivity adjustment for a sector
 * @param {string} sector - Broad NAICS sector key
 * @param {number} startYear - Year the worker started
 * @returns {{ factor: number, peakShare: number, currentShare: number, careerFraction: number, method: string }}
 */
function getLaborShareAdjustment(sector, startYear) {
  const config = SECTOR_CONFIGS[sector] || SECTOR_CONFIGS['national_average'];
  const baselines = config.laborShareBaselines;
  const currentYear = new Date().getFullYear();

  if (!baselines) {
    return { factor: 1.0, peakShare: 0.65, currentShare: 0.56, careerFraction: 0, method: 'fallback' };
  }

  const peakYear = baselines.peakYear;
  const peakShare = baselines.peakLaborShare;
  const currentShare = baselines.currentLaborShare || 0.56;

  // How much of the labor share decline happened during this worker's career?
  const totalDeclineYears = currentYear - peakYear;
  // Worker who started before the peak experienced the full decline from peak
  const workerYears = currentYear - Math.max(startYear, peakYear);
  const careerFraction = totalDeclineYears > 0
    ? Math.min(1, Math.max(0, workerYears / totalDeclineYears))
    : 0;

  // The worker's portion of the total labor share decline
  const totalDecline = peakShare - currentShare;
  const workerDecline = totalDecline * careerFraction;

  // effectiveShare = what labor share "should" be if it hadn't declined during this career
  const effectiveShare = currentShare + workerDecline;
  let factor = effectiveShare / currentShare;

  // Floor at 1.0 (never tell a worker the gap helps them)
  factor = Math.max(1.0, factor);

  return {
    factor: Math.round(factor * 1000) / 1000,
    peakShare: peakShare,
    currentShare: currentShare,
    effectiveShare: Math.round(effectiveShare * 1000) / 1000,
    careerFraction: Math.round(careerFraction * 1000) / 1000,
    method: 'labor-share'
  };
}

/**
 * Calculate market median wage for a given location and role
 * Now enhanced with:
 *   - BEA Regional Price Parities (Fix 1)
 *   - Normalized experience multiplier (Fix 2)
 *   - Edge case guards (Fix 3)
 *
 * @param {Object} params
 * @param {string} params.zipCode - User's ZIP code
 * @param {string} params.state - Two-letter state code
 * @param {string} params.msa - Metropolitan Statistical Area name
 * @param {string} params.industry - Industry category (optional)
 * @param {number} params.yearsExperience - Years doing this kind of work
 * @param {string} [params.roleLevel] - Declared role level (entry/junior/mid/senior/exec)
 * @param {Object} msaWageData - MSA wage data object (fallback)
 * @param {Object} stateWageData - State wage data object (fallback)
 * @returns {Object} { median, adjustedMedian, rpp, experienceMultiplier, industryVA, source }
 */
function calculateMarketMedian(params, msaWageData, stateWageData) {
  const { msa, state, industry, yearsExperience = 0, roleLevel } = params;

  // 1. Base median from existing MSA/state wage data (preserved as foundation)
  let baseMedian = 22.45; // National default
  let source = 'National BLS median';

  if (msa && msaWageData[msa]) {
    baseMedian = msaWageData[msa];
    source = `BLS MSA median for ${msa}`;
  } else if (state && stateWageData[state]) {
    baseMedian = stateWageData[state];
    source = `BLS state median for ${state}`;
  }

  // 2. Fix 1: Apply RPP adjustment for regional price levels
  // RPP of 112 means prices are 12% above national average
  const { rpp, source: rppSource } = getRPP(msa, state);
  const rppFactor = rpp / 100;

  // 3. Fix 1: Get state-level industry value-added ratio
  const { sector } = resolveIndustrySector(industry);
  const industryVA = getStateIndustryVA(state, sector);

  // 4. OEWS role-level wage: when the worker declares their role,
  // use the OEWS percentile wage for that sector/role as the base
  // instead of the all-occupation geographic median.
  // Always prefer role wage when available — the all-occupation median
  // includes every job in the area and is the wrong comparison
  // for both high-wage AND low-wage role-specific workers.
  let roleAdjustedBase = baseMedian;
  let usedRoleWage = false;
  if (roleLevel && sector) {
    const roles = ROLE_LEVELS[sector] || ROLE_LEVELS['national_average'];
    const role = roles ? roles.find(r => r.value === roleLevel) : null;
    if (role) {
      const roleWage = getPercentileWage(sector, role.percentile);
      if (roleWage) {
        roleAdjustedBase = roleWage;
        usedRoleWage = true;
        source = `BLS OEWS ${role.label} (p${role.percentile}) for ${sector}`;
      }
    }
  }

  // 5. Fix 2: Apply normalized experience multiplier
  const experienceMultiplier = calculateNormalizedExperienceMultiplier(yearsExperience, sector);

  // Adjusted median = role-aware base × RPP factor × experience normalization
  const adjustedMedian = roleAdjustedBase * rppFactor * experienceMultiplier;

  return {
    median: roleAdjustedBase,
    adjustedMedian: Math.round(adjustedMedian * 100) / 100,
    rpp: rpp,
    rppSource: rppSource,
    rppFactor: Math.round(rppFactor * 1000) / 1000,
    industryVA: industryVA,
    experienceMultiplier: Math.round(experienceMultiplier * 1000) / 1000,
    usedRoleWage: usedRoleWage,
    source
  };
}

/**
 * Calculate worth gap between current and deserved compensation
 * Now enhanced with:
 *   - OEWS occupation-within-industry weighting (Fix 4)
 *   - Benefits multiplier context (Fix 6)
 *
 * @param {Object} params
 * @param {number} params.currentWage - Current hourly wage
 * @param {number} params.marketMedian - Market median hourly wage
 * @param {number} params.startYear - Year started working (for productivity gap)
 * @param {string} [params.industry] - Industry key
 * @param {string} [params.roleLevel] - Declared role level (entry/junior/mid/senior/exec)
 * @returns {Object} { deservedWage, worthGap, productivityAdjustment, industryContext, occupationContext, benefitsContext }
 */
function calculateWorthGap(params) {
  const { currentWage, marketMedian, startYear, industry, roleLevel } = params;
  const currentYear = new Date().getFullYear();

  // Resolve detailed industry key to broad NAICS sector
  const { sector, label: industryLabel, usedFallback } = resolveIndustrySector(industry);

  // Get industry-specific productivity/wage data
  const sectorData = INDUSTRY_ECONOMIC_DATA[sector] || INDUSTRY_ECONOMIC_DATA['national_average'];
  const currentData = sectorData[currentYear] || sectorData[2024];
  const startData = sectorData[startYear] || sectorData[1975];

  // Calculate productivity adjustment using sector-specific trajectory
  const productivityGrowth = (currentData.productivity_index / startData.productivity_index) - 1;
  const wageGrowth = (currentData.wage_index / startData.wage_index) - 1;
  const productivityWageGap = productivityGrowth - wageGrowth;

  // Fix 10: Labor-share-derived adjustment replaces the flat 25%.
  // Uses BEA NIPA labor share data to determine what fraction of the
  // gap is attributable to labor share compression during this worker's career.
  // Sector-specific and career-length-sensitive.
  const laborShareData = getLaborShareAdjustment(sector, startYear);
  const productivityAdjustment = laborShareData.factor;
  const fullGapAdjustment = 1 + productivityWageGap;

  // Fix 4: Within-industry occupation adjustment
  // When role level is declared, uses OEWS percentile wage for that role
  // instead of the worker's own wage (breaks circularity)
  const occupationData = getOccupationAdjustmentByRole(sector, roleLevel, currentWage);

  // Blend occupation adjustment: it should moderate the gap, not dominate it
  // Use sqrt to dampen extreme ratios while preserving direction
  const occupationFactor = Math.sqrt(occupationData.adjustment);

  // Calculate deserved wage: apply occupation factor to the gap portion only
  // (consistent with impact calculator — occupation moderates the gap, not the full wage)
  const baseDeservedWage = marketMedian * productivityAdjustment;
  const gapPortion = baseDeservedWage - marketMedian;
  const rawDeservedWage = marketMedian + (gapPortion * occupationFactor);

  // Dignity floor: never tell a worker they "deserve" less than federal minimum wage.
  // $7.25/hr is the federal minimum — the tool should never output below this.
  const MINIMUM_WAGE_HOURLY = 7.25;
  const deservedWage = Math.max(rawDeservedWage, MINIMUM_WAGE_HOURLY);

  // Calculate gap
  const worthGapHourly = deservedWage - currentWage;
  const worthGapAnnual = worthGapHourly * ANNUAL_WORK_HOURS;
  const gapPercentage = currentWage > 0
    ? ((deservedWage - currentWage) / currentWage) * 100
    : 0;

  // Fix 6: Benefits context (shown as information, not used to inflate gap)
  const benefitsData = getBenefitsMultiplier(sector, currentWage);

  return {
    deservedWage: {
      hourly: Math.round(deservedWage * 100) / 100,
      annual: Math.round(deservedWage * ANNUAL_WORK_HOURS)
    },
    currentWage: {
      hourly: currentWage,
      annual: Math.round(currentWage * ANNUAL_WORK_HOURS)
    },
    worthGap: {
      hourly: Math.round(worthGapHourly * 100) / 100,
      annual: Math.round(worthGapAnnual),
      percentage: Math.round(gapPercentage * 10) / 10
    },
    productivityAdjustment: {
      factor: Math.round(productivityAdjustment * 1000) / 1000,
      fullGapFactor: Math.round(fullGapAdjustment * 1000) / 1000,
      laborShare: {
        method: laborShareData.method,
        peakShare: laborShareData.peakShare,
        currentShare: laborShareData.currentShare,
        effectiveShare: laborShareData.effectiveShare,
        careerFraction: laborShareData.careerFraction
      },
      productivityGrowth: Math.round(productivityGrowth * 1000) / 10,
      wageGrowth: Math.round(wageGrowth * 1000) / 10,
      note: 'Adjustment derived from BEA NIPA labor share data. Factor = effectiveShare / currentShare, where effectiveShare accounts for labor share compression during your career. Full raw gap shown for transparency.'
    },
    industryContext: {
      requestedIndustry: industry || null,
      resolvedSector: sector,
      sectorLabel: industryLabel,
      usedNationalFallback: usedFallback
    },
    occupationContext: {
      adjustment: occupationData.adjustment,
      appliedFactor: Math.round(occupationFactor * 1000) / 1000,
      industryMeanWage: occupationData.industryMean,
      percentileEstimate: occupationData.percentileEstimate
    },
    benefitsContext: {
      multiplier: benefitsData.multiplier,
      tier: benefitsData.tier,
      totalCompHourly: benefitsData.totalCompHourly,
      totalCompAnnual: benefitsData.totalCompAnnual,
      note: `Your estimated total compensation (wages + benefits) is $${benefitsData.totalCompHourly.toFixed(2)}/hour. Benefits vary widely by employer — this is a sector average for your wage tier.`
    }
  };
}

/**
 * Calculate lifetime opportunity cost of underpayment
 * Projects future earnings with compound growth
 */
function calculateLifetimeCost(params) {
  const {
    annualGap,
    yearsRemaining,
    investmentReturn = 0.07,
    salaryGrowth = 0.025
  } = params;

  let totalLostIncome = 0;
  let lostInvestmentGrowth = 0;
  const yearlyProjection = [];

  for (let year = 1; year <= yearsRemaining; year++) {
    const yearlyGap = annualGap * Math.pow(1 + salaryGrowth, year - 1);
    totalLostIncome += yearlyGap;

    const remainingYears = yearsRemaining - year;
    const investmentValue = yearlyGap * Math.pow(1 + investmentReturn, remainingYears);
    lostInvestmentGrowth += (investmentValue - yearlyGap);

    yearlyProjection.push({
      year,
      lostIncome: Math.round(yearlyGap),
      cumulativeLost: Math.round(totalLostIncome),
      investmentValue: Math.round(investmentValue)
    });
  }

  return {
    totalLostIncome: Math.round(totalLostIncome),
    lostInvestmentGrowth: Math.round(lostInvestmentGrowth),
    totalOpportunityCost: Math.round(totalLostIncome + lostInvestmentGrowth),
    yearsRemaining,
    yearlyProjection
  };
}

/**
 * Calculate daily opportunity cost
 */
function calculateOpportunityCost(params) {
  const { currentWage, deservedWage, startDate } = params;

  const start = new Date(startDate);
  const now = new Date();
  const calendarDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  // Convert calendar days to working days (5/7 ratio) for accurate cost
  const workingDays = Math.round(calendarDays * 5 / 7);

  const hourlyGap = deservedWage - currentWage;
  // Daily gap based on 1,680 hrs / 240 working days = 7 hrs per working day
  const dailyGap = hourlyGap * 7;
  const annualGap = hourlyGap * ANNUAL_WORK_HOURS;

  const cumulativeCost = dailyGap * workingDays;

  return {
    hourlyGap: Math.round(hourlyGap * 100) / 100,
    dailyGap: Math.round(dailyGap * 100) / 100,
    weeklyGap: Math.round(dailyGap * 5 * 100) / 100,
    monthlyGap: Math.round((annualGap / 12) * 100) / 100,
    annualGap: Math.round(annualGap),
    daysUnderpaid: workingDays,
    cumulativeCost: Math.round(cumulativeCost * 100) / 100
  };
}

/**
 * Generate validation message text
 * Creates empowering "You deserve" messaging with industry-specific context
 */
function generateValidationMessage(worthGapData, marketData) {
  const { deservedWage, worthGap, productivityAdjustment, industryContext } = worthGapData;

  const hasIndustry = industryContext && !industryContext.usedNationalFallback;
  const workerPhrase = hasIndustry
    ? `Workers in ${industryContext.sectorLabel}`
    : `Workers`;
  const basisPhrase = hasIndustry
    ? `your region's economics, ${industryContext.sectorLabel} productivity data, and the value you create`
    : `your region's economics and the value you create`;

  const primary = `Based on ${basisPhrase}, you deserve $${deservedWage.hourly.toFixed(2)}/hour.`;

  const secondary = worthGap.hourly > 0
    ? `That's $${worthGap.hourly.toFixed(2)}/hour more than your current rate — ${worthGap.percentage.toFixed(1)}% higher.`
    : `Your current compensation aligns with market value. You're being paid fairly.`;

  const fallbackNote = (industryContext && industryContext.usedNationalFallback && industryContext.requestedIndustry)
    ? ` (We used national averages because we don't yet have sector-specific data for "${industryContext.requestedIndustry}.")`
    : '';

  const explainer = `We used ${marketData.source} as a starting point, adjusted for regional prices (RPP: ${marketData.rpp || 100}). ` +
    `${workerPhrase} now produce ${productivityAdjustment.productivityGrowth.toFixed(1)}% more for their bosses ` +
    `but only got ${productivityAdjustment.wageGrowth.toFixed(1)}% in raises. ` +
    `That gap means your work is worth ${((productivityAdjustment.factor - 1) * 100).toFixed(1)}% more ` +
    `than what you're getting paid.${fallbackNote}`;

  return { primary, secondary, explainer };
}

module.exports = {
  ANNUAL_WORK_HOURS,
  calculateMarketMedian,
  calculateWorthGap,
  calculateLifetimeCost,
  calculateOpportunityCost,
  generateValidationMessage,
  calculateNormalizedExperienceMultiplier,
  getLaborShareAdjustment,
};
