/**
 * RUPTURA - Stratified Benefits Multiplier Data
 * ================================================
 * BLS Employer Costs for Employee Compensation (ECEC)
 * Benefits multiplier = total compensation / wages and salaries
 *
 * Stratified by industry sector and wage tier because the flat
 * 1.25-1.40 range systematically overstates benefits for low-wage
 * workers (who often receive only legally mandated FICA at ~1.05-1.08)
 * and understates benefits for high-benefit workers (union, large
 * employers with defined-benefit pensions at ~1.50-1.60).
 *
 * Source: BLS ECEC (series CMU), vintage 2024
 * https://www.bls.gov/ncs/ect/
 */

// Benefits multiplier by sector and wage tier
// low: <$15/hr | mid: $15-50/hr | high: >$50/hr
const BENEFITS_MULTIPLIER = {
  'tech': {
    low:  1.15,  // entry-level tech support, interns
    mid:  1.38,  // mid-level engineers, analysts
    high: 1.55,  // senior engineers, managers (stock, 401k match, premium health)
  },
  'manufacturing': {
    low:  1.20,  // line workers (often union benefits even at lower wages)
    mid:  1.42,  // skilled trades, machine operators
    high: 1.52,  // plant managers, engineers
  },
  'retail': {
    low:  1.08,  // part-time cashiers, stockers (near-zero benefits)
    mid:  1.20,  // full-time store managers, supervisors
    high: 1.32,  // district managers, corporate retail
  },
  'healthcare': {
    low:  1.22,  // aides, orderlies (often employer health insurance)
    mid:  1.45,  // nurses, technicians (strong benefits packages)
    high: 1.58,  // physicians, administrators
  },
  'finance': {
    low:  1.15,  // tellers, clerks
    mid:  1.40,  // analysts, underwriters
    high: 1.58,  // portfolio managers, VPs (bonus + stock + pension)
  },
  'construction': {
    low:  1.18,  // laborers (some union benefits)
    mid:  1.38,  // electricians, plumbers (union packages)
    high: 1.48,  // project managers, general contractors
  },
  'education': {
    low:  1.25,  // teaching assistants (often institutional benefits)
    mid:  1.45,  // teachers, professors (pension, health)
    high: 1.55,  // administrators, tenured faculty
  },
  'food_service': {
    low:  1.05,  // servers, fast food (minimal to zero benefits)
    mid:  1.15,  // sous chefs, restaurant managers
    high: 1.28,  // executive chefs, regional management
  },
  'professional_services': {
    low:  1.12,  // admin staff, junior associates
    mid:  1.35,  // consultants, accountants, engineers
    high: 1.52,  // partners, senior consultants
  },
  'transportation': {
    low:  1.15,  // delivery drivers, warehouse workers
    mid:  1.38,  // CDL drivers (union), dispatchers
    high: 1.48,  // pilots, logistics managers
  },
  'government': {
    low:  1.35,  // even low-wage gov workers get benefits
    mid:  1.50,  // strong pension + health packages
    high: 1.58,  // senior civil service
  },
  'national_average': {
    low:  1.12,
    mid:  1.32,
    high: 1.48,
  }
};

// Wage tier boundaries (hourly)
const WAGE_TIER_BOUNDARIES = {
  low_max: 15,    // below $15/hr = low tier
  high_min: 50    // above $50/hr = high tier
};

/**
 * Get benefits multiplier for a specific worker
 * Uses linear interpolation within tiers for smooth transitions
 *
 * @param {string} sector - Broad NAICS sector key
 * @param {number} hourlyWage - Worker's hourly wage
 * @returns {{ multiplier: number, tier: string, totalComp: number }}
 */
function getBenefitsMultiplier(sector, hourlyWage) {
  const sectorData = BENEFITS_MULTIPLIER[sector] || BENEFITS_MULTIPLIER['national_average'];

  let multiplier;
  let tier;

  if (hourlyWage <= WAGE_TIER_BOUNDARIES.low_max) {
    multiplier = sectorData.low;
    tier = 'low';
  } else if (hourlyWage >= WAGE_TIER_BOUNDARIES.high_min) {
    multiplier = sectorData.high;
    tier = 'high';
  } else {
    // Linear interpolation between low and high through mid
    const range = WAGE_TIER_BOUNDARIES.high_min - WAGE_TIER_BOUNDARIES.low_max;
    const position = hourlyWage - WAGE_TIER_BOUNDARIES.low_max;
    const t = position / range;

    if (t <= 0.5) {
      // Interpolate low → mid
      multiplier = sectorData.low + (t * 2) * (sectorData.mid - sectorData.low);
    } else {
      // Interpolate mid → high
      multiplier = sectorData.mid + ((t - 0.5) * 2) * (sectorData.high - sectorData.mid);
    }
    tier = 'mid';
  }

  return {
    multiplier: Math.round(multiplier * 1000) / 1000,
    tier,
    totalCompHourly: Math.round(hourlyWage * multiplier * 100) / 100,
    totalCompAnnual: Math.round(hourlyWage * multiplier * 1680)
  };
}

module.exports = {
  BENEFITS_MULTIPLIER,
  WAGE_TIER_BOUNDARIES,
  getBenefitsMultiplier
};
