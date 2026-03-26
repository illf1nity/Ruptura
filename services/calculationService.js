/**
 * RUPTURA - Calculation Service
 * =====================================
 * Centralized economic calculations for worth gap analysis,
 * negotiation preparation, and impact visualization.
 *
 * All calculations are designed to empower users with data-driven
 * insights about their deserved compensation.
 */

const { YEARLY_ECONOMIC_DATA } = require('../db');

// In-memory cache for API responses (24hr TTL)
const calculationCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Gets cached value or null if expired/missing
 */
function getCached(key) {
  const cached = calculationCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

/**
 * Sets cache value with timestamp
 */
function setCache(key, data) {
  calculationCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Calculate market median wage for a given location and role
 * Uses embedded MSA/state data with BLS API fallback potential
 *
 * @param {Object} params
 * @param {string} params.zipCode - User's ZIP code
 * @param {string} params.state - Two-letter state code
 * @param {string} params.msa - Metropolitan Statistical Area name
 * @param {string} params.industry - Industry category (optional)
 * @param {number} params.yearsExperience - Years doing this kind of work (role-specific, not total career)
 * @param {Object} msaWageData - MSA wage data object
 * @param {Object} stateWageData - State wage data object
 * @returns {Object} { median, source, adjustedMedian }
 */
function calculateMarketMedian(params, msaWageData, stateWageData) {
  const { msa, state, yearsExperience = 0 } = params;

  let baseMedian = 22.45; // National default
  let source = 'National BLS median';

  // Try MSA first (more specific)
  if (msa && msaWageData[msa]) {
    baseMedian = msaWageData[msa];
    source = `BLS MSA median for ${msa}`;
  }
  // Fall back to state
  else if (state && stateWageData[state]) {
    baseMedian = stateWageData[state];
    source = `BLS state median for ${state}`;
  }

  // Apply experience adjustment
  // 2.5% per year for first 10 years, 1% after
  let experienceMultiplier = 1;
  if (yearsExperience > 0) {
    const earlyYears = Math.min(yearsExperience, 10);
    const laterYears = Math.max(0, yearsExperience - 10);
    experienceMultiplier = 1 + (earlyYears * 0.025) + (laterYears * 0.01);
  }

  const adjustedMedian = baseMedian * experienceMultiplier;

  return {
    median: baseMedian,
    adjustedMedian: Math.round(adjustedMedian * 100) / 100,
    experienceMultiplier: Math.round(experienceMultiplier * 1000) / 1000,
    source
  };
}

/**
 * Calculate worth gap between current and deserved compensation
 * Applies productivity-wage gap adjustment
 *
 * @param {Object} params
 * @param {number} params.currentWage - Current hourly wage
 * @param {number} params.marketMedian - Market median hourly wage
 * @param {number} params.startYear - Year started working (for productivity gap)
 * @returns {Object} { deservedWage, worthGap, productivityAdjustment, percentage }
 */
function calculateWorthGap(params) {
  const { currentWage, marketMedian, startYear } = params;
  const currentYear = new Date().getFullYear();

  // Get productivity-wage ratio for the current year
  const currentData = YEARLY_ECONOMIC_DATA[currentYear] || YEARLY_ECONOMIC_DATA[2024];
  const startData = YEARLY_ECONOMIC_DATA[startYear] || YEARLY_ECONOMIC_DATA[1975];

  // Calculate productivity adjustment
  // If productivity grew 82% but wages only 17%, workers deserve more
  const productivityGrowth = (currentData.productivity_index / startData.productivity_index) - 1;
  const wageGrowth = (currentData.wage_index / startData.wage_index) - 1;
  const productivityWageGap = productivityGrowth - wageGrowth;

  // Apply a portion of the productivity gap as adjustment (25% factor - conservative)
  const productivityAdjustment = 1 + (productivityWageGap * 0.25);

  // Calculate deserved wage
  // Start with market median, apply productivity adjustment
  const deservedWage = marketMedian * productivityAdjustment;

  // Calculate gap
  const worthGapHourly = deservedWage - currentWage;
  const worthGapAnnual = worthGapHourly * 2080; // 40hrs * 52 weeks
  const gapPercentage = ((deservedWage - currentWage) / currentWage) * 100;

  return {
    deservedWage: {
      hourly: Math.round(deservedWage * 100) / 100,
      annual: Math.round(deservedWage * 2080)
    },
    currentWage: {
      hourly: currentWage,
      annual: Math.round(currentWage * 2080)
    },
    worthGap: {
      hourly: Math.round(worthGapHourly * 100) / 100,
      annual: Math.round(worthGapAnnual),
      percentage: Math.round(gapPercentage * 10) / 10
    },
    productivityAdjustment: {
      factor: Math.round(productivityAdjustment * 1000) / 1000,
      productivityGrowth: Math.round(productivityGrowth * 1000) / 10, // as percentage
      wageGrowth: Math.round(wageGrowth * 1000) / 10
    }
  };
}

/**
 * Calculate lifetime opportunity cost of underpayment
 * Projects future earnings with compound growth
 *
 * @param {Object} params
 * @param {number} params.annualGap - Annual worth gap in dollars
 * @param {number} params.yearsRemaining - Years until retirement
 * @param {number} params.investmentReturn - Expected annual return (default 7%)
 * @param {number} params.salaryGrowth - Expected annual salary growth (default 2.5%)
 * @returns {Object} { totalLostIncome, lostInvestmentGrowth, totalOpportunityCost, yearlyProjection }
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

  // Calculate year-by-year projection
  for (let year = 1; year <= yearsRemaining; year++) {
    // Gap grows with salary growth
    const yearlyGap = annualGap * Math.pow(1 + salaryGrowth, year - 1);
    totalLostIncome += yearlyGap;

    // Lost investment opportunity (if gap was invested instead)
    // Each year's gap compounds for remaining years
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
 * For the OpportunityCostTicker component
 *
 * @param {Object} params
 * @param {number} params.currentWage - Current hourly wage
 * @param {number} params.deservedWage - Deserved hourly wage
 * @param {Date|string} params.startDate - When underpayment began
 * @returns {Object} { dailyGap, daysUnderpaid, cumulativeCost, monthlyRate }
 */
function calculateOpportunityCost(params) {
  const { currentWage, deservedWage, startDate } = params;

  const start = new Date(startDate);
  const now = new Date();
  const daysUnderpaid = Math.floor((now - start) / (1000 * 60 * 60 * 24));

  // Calculate daily gap (8 hours per day)
  const hourlyGap = deservedWage - currentWage;
  const dailyGap = hourlyGap * 8;
  const annualGap = hourlyGap * 2080;

  // Cumulative cost
  const cumulativeCost = dailyGap * daysUnderpaid;

  return {
    hourlyGap: Math.round(hourlyGap * 100) / 100,
    dailyGap: Math.round(dailyGap * 100) / 100,
    weeklyGap: Math.round(dailyGap * 5 * 100) / 100,
    monthlyGap: Math.round((annualGap / 12) * 100) / 100,
    annualGap: Math.round(annualGap),
    daysUnderpaid,
    cumulativeCost: Math.round(cumulativeCost * 100) / 100
  };
}

/**
 * Generate validation message text
 * Creates empowering "You deserve" messaging
 *
 * @param {Object} worthGapData - Output from calculateWorthGap
 * @param {Object} marketData - Market median data
 * @returns {Object} { primary, secondary, explainer }
 */
function generateValidationMessage(worthGapData, marketData) {
  const { deservedWage, worthGap, productivityAdjustment } = worthGapData;

  const primary = `Based on your region's economics and the value you create, you deserve $${deservedWage.hourly.toFixed(2)}/hour.`;

  const secondary = worthGap.hourly > 0
    ? `That's $${worthGap.hourly.toFixed(2)}/hour more than your current rate — ${worthGap.percentage.toFixed(1)}% higher.`
    : `Your current compensation aligns with market value. You're being paid fairly.`;

  const explainer = `We used ${marketData.source} as a starting point. ` +
    `Workers now produce ${productivityAdjustment.productivityGrowth.toFixed(1)}% more for their bosses ` +
    `but only got ${productivityAdjustment.wageGrowth.toFixed(1)}% in raises. ` +
    `That gap means your work is worth ${((productivityAdjustment.factor - 1) * 100).toFixed(1)}% more ` +
    `than what you're getting paid.`;

  return { primary, secondary, explainer };
}

module.exports = {
  calculateMarketMedian,
  calculateWorthGap,
  calculateLifetimeCost,
  calculateOpportunityCost,
  generateValidationMessage,
  getCached,
  setCache
};
