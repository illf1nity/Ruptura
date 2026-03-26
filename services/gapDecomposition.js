/**
 * RUPTURA - Gap Decomposition
 * ==============================
 * BEA GDP-by-Industry value-added decomposition.
 *
 * Value Added = Compensation + Taxes on Production + Depreciation + Net Operating Surplus
 *
 * The gap (Vprod - Vpaid) includes depreciation, taxes, AND profit.
 * Presenting the entire gap as "unpaid value" conflates capital
 * maintenance costs with profit extraction. This decomposition
 * separates them so workers can see WHERE the money goes:
 *
 *   - Depreciation: equipment wears out, software becomes obsolete
 *   - Taxes: property taxes, business licenses, excise taxes
 *   - Net Profit: retained earnings, dividends, share buybacks
 *
 * The question becomes not "why is there a gap?" but
 * "is the profit portion too large?"
 *
 * Source: BEA GDP-by-Industry, vintage 2023
 * https://apps.bea.gov/iTable/?reqid=51&step=1
 */

const { SECTOR_LABELS } = require('./industryData');

// Shares of value added by component, by industry sector
// compensation + taxes + depreciation + netOperatingSurplus = 1.0
const VALUE_ADDED_DECOMPOSITION = {
  'tech': {
    compensation: 0.45,
    taxesOnProduction: 0.03,
    depreciation: 0.19,
    netOperatingSurplus: 0.33,
  },
  'manufacturing': {
    compensation: 0.52,
    taxesOnProduction: 0.05,
    depreciation: 0.15,
    netOperatingSurplus: 0.28,
  },
  'retail': {
    compensation: 0.62,
    taxesOnProduction: 0.06,
    depreciation: 0.10,
    netOperatingSurplus: 0.22,
  },
  'healthcare': {
    compensation: 0.72,
    taxesOnProduction: 0.03,
    depreciation: 0.07,
    netOperatingSurplus: 0.18,
  },
  'finance': {
    compensation: 0.38,
    taxesOnProduction: 0.04,
    depreciation: 0.08,
    netOperatingSurplus: 0.50,
  },
  'construction': {
    compensation: 0.58,
    taxesOnProduction: 0.04,
    depreciation: 0.12,
    netOperatingSurplus: 0.26,
  },
  'education': {
    compensation: 0.78,
    taxesOnProduction: 0.03,
    depreciation: 0.06,
    netOperatingSurplus: 0.13,
  },
  'food_service': {
    compensation: 0.55,
    taxesOnProduction: 0.07,
    depreciation: 0.12,
    netOperatingSurplus: 0.26,
  },
  'professional_services': {
    compensation: 0.58,
    taxesOnProduction: 0.03,
    depreciation: 0.08,
    netOperatingSurplus: 0.31,
  },
  'transportation': {
    compensation: 0.50,
    taxesOnProduction: 0.05,
    depreciation: 0.18,
    netOperatingSurplus: 0.27,
  },
  'government': {
    compensation: 0.85,
    taxesOnProduction: 0.02,
    depreciation: 0.10,
    netOperatingSurplus: 0.03,
  },
  'national_average': {
    compensation: 0.56,
    taxesOnProduction: 0.05,
    depreciation: 0.14,
    netOperatingSurplus: 0.25,
  }
};

/**
 * Decompose a gap amount into its constituent parts
 * The gap = value added - compensation, which breaks into:
 *   taxes + depreciation + net profit
 *
 * @param {number} gapAmount - Total gap in dollars
 * @param {string} sector - Broad NAICS sector key
 * @returns {Object} Decomposed gap with amounts, percentages, and context
 */
function decomposeGap(gapAmount, sector) {
  const decomp = VALUE_ADDED_DECOMPOSITION[sector] || VALUE_ADDED_DECOMPOSITION['national_average'];

  // The non-compensation share is what the gap represents
  const nonCompShare = 1 - decomp.compensation;

  // Avoid division by zero for sectors with near-100% labor share
  if (nonCompShare <= 0.01) {
    return {
      totalGap: Math.round(gapAmount),
      depreciation: { amount: 0, percentage: 0, label: 'Capital maintenance' },
      taxes: { amount: 0, percentage: 0, label: 'Taxes on production' },
      netProfit: { amount: 0, percentage: 0, label: 'Net profit' },
      context: `In ${SECTOR_LABELS[sector] || sector}, nearly all value added goes to worker compensation.`
    };
  }

  const depreciationShare = decomp.depreciation / nonCompShare;
  const taxShare = decomp.taxesOnProduction / nonCompShare;
  const profitShare = decomp.netOperatingSurplus / nonCompShare;

  return {
    totalGap: Math.round(gapAmount),
    depreciation: {
      amount: Math.round(gapAmount * depreciationShare),
      percentage: Math.round(depreciationShare * 100),
      label: 'Capital maintenance (equipment, buildings, software)',
    },
    taxes: {
      amount: Math.round(gapAmount * taxShare),
      percentage: Math.round(taxShare * 100),
      label: 'Taxes on production (property tax, licenses)',
    },
    netProfit: {
      amount: Math.round(gapAmount * profitShare),
      percentage: Math.round(profitShare * 100),
      label: 'Net profit (retained earnings, dividends, buybacks)',
    },
    laborShareCurrent: decomp.compensation,
    context: `In ${SECTOR_LABELS[sector] || 'this industry'}, ${(decomp.compensation * 100).toFixed(0)}% of value added goes to worker compensation. The remaining ${((1 - decomp.compensation) * 100).toFixed(0)}% covers capital costs, taxes, and profit.`
  };
}

module.exports = {
  VALUE_ADDED_DECOMPOSITION,
  decomposeGap
};
