/**
 * RUPTURA — Economic Calculator Routes
 * ======================================
 * All endpoints for the economic experience:
 *   /api/local-data/:zipCode
 *   /api/impact-calculator
 *   /api/worth-gap-analyzer
 *   /api/negotiation-script
 */

const express = require('express');
const router = express.Router();
const { YEARLY_ECONOMIC_DATA } = require('../db');
const calculationService = require('../services/calculationService');
const { ANNUAL_WORK_HOURS } = calculationService;
const { MSA_WAGE_DATA, STATE_WAGE_DATA } = require('../services/wageData');
const { deflateToBaseYear, deflateCareerSeries, BASE_YEAR } = require('../services/deflationData');
const { decomposeGap } = require('../services/gapDecomposition');
const { resolveIndustrySector, calculateMultipleBaselines, INDUSTRY_ECONOMIC_DATA } = require('../services/industryData');
const { buildDataProvenance } = require('../services/sourceRegistry');
const { getStateIndustryVA } = require('../services/rppData');
const { getOccupationAdjustmentByRole, OEWS_INDUSTRY_WAGES } = require('../services/oewsData');

/**
 * Industry-specific productivity gap modifiers.
 * These reflect how much the national productivity-wage gap applies
 * to each sector. Values > 1 mean the gap hits harder in that industry;
 * values < 1 mean the gap is narrower.
 *
 * Sources: BLS Industry Productivity studies, EPI sector analyses.
 * National average = 1.0 (used when no industry provided).
 */
const INDUSTRY_GAP_MODIFIERS = {
  // Agriculture, Forestry, Fishing & Hunting (NAICS 11)
  'agriculture':                  0.95,
  'crop_production':              0.95,
  'animal_production':            0.90,
  'forestry_logging':             1.00,
  'fishing_hunting_trapping':     0.90,
  'support_agriculture':          0.90,

  // Mining, Quarrying & Oil/Gas Extraction (NAICS 21)
  'mining':                       1.25,
  'oil_gas_extraction':           1.35,
  'mining_except_oil_gas':        1.20,
  'support_mining':               1.15,

  // Utilities (NAICS 22)
  'utilities':                    1.15,

  // Construction (NAICS 23)
  'construction':                 1.10,
  'construction_buildings':       1.10,
  'heavy_civil_engineering':      1.15,
  'specialty_trade_contractors':  1.05,

  // Manufacturing (NAICS 31-33)
  'manufacturing':                1.20,
  'food_manufacturing':           1.10,
  'beverage_tobacco_mfg':         1.15,
  'textile_mills':                1.15,
  'textile_product_mills':        1.10,
  'apparel_manufacturing':        1.05,
  'leather_mfg':                  1.05,
  'wood_product_mfg':             1.10,
  'paper_manufacturing':          1.15,
  'printing_support':             1.05,
  'petroleum_coal_mfg':           1.40,
  'chemical_manufacturing':       1.30,
  'plastics_rubber_mfg':          1.15,
  'nonmetallic_mineral_mfg':      1.10,
  'primary_metal_mfg':            1.25,
  'fabricated_metal_mfg':         1.15,
  'machinery_manufacturing':      1.20,
  'computer_electronic_mfg':      1.40,
  'electrical_equipment_mfg':     1.25,
  'transportation_equip_mfg':     1.25,
  'furniture_mfg':                1.05,
  'miscellaneous_mfg':            1.10,

  // Wholesale Trade (NAICS 42)
  'wholesale_trade':              1.10,
  'wholesale_durable':            1.10,
  'wholesale_nondurable':         1.05,
  'wholesale_electronic_markets': 1.15,

  // Retail Trade (NAICS 44-45)
  'retail':                       0.90,
  'motor_vehicle_dealers':        0.95,
  'furniture_home_stores':        0.85,
  'electronics_appliance_stores': 0.90,
  'building_material_stores':     0.90,
  'food_beverage_stores':         0.85,
  'health_personal_care_stores':  0.90,
  'gasoline_stations':            0.85,
  'clothing_stores':              0.85,
  'sporting_hobby_book_stores':   0.85,
  'general_merchandise_stores':   0.90,
  'miscellaneous_store_retailers': 0.85,
  'nonstore_retailers':           1.00,

  // Transportation & Warehousing (NAICS 48-49)
  'transportation':               1.05,
  'air_transportation':           1.15,
  'rail_transportation':          1.20,
  'water_transportation':         1.10,
  'truck_transportation':         1.05,
  'transit_ground_passenger':     0.90,
  'pipeline_transportation':      1.25,
  'scenic_sightseeing':           0.85,
  'support_transportation':       1.00,
  'postal_service':               0.95,
  'couriers_messengers':          0.95,
  'warehousing_storage':          1.00,

  // Information (NAICS 51)
  'information':                  1.30,
  'publishing':                   1.20,
  'motion_picture_sound':         1.10,
  'broadcasting':                 1.15,
  'internet_publishing':          1.35,
  'telecommunications':           1.25,
  'data_processing_hosting':      1.35,
  'other_information_services':   1.25,

  // Finance & Insurance (NAICS 52)
  'finance':                      1.30,
  'monetary_authorities':         1.20,
  'credit_intermediation':        1.25,
  'securities_commodities':       1.40,
  'insurance_carriers':           1.20,
  'funds_trusts':                 1.35,

  // Real Estate & Rental/Leasing (NAICS 53)
  'real_estate_rental':           1.10,
  'real_estate':                  1.10,
  'rental_leasing_services':      1.00,
  'lessors_intangible_assets':    1.20,

  // Professional, Scientific & Technical Services (NAICS 54)
  'professional_services':        1.20,

  // Management of Companies (NAICS 55)
  'management_companies':         1.25,

  // Administrative, Support & Waste Management (NAICS 56)
  'admin_support_waste':          0.95,
  'admin_support_services':       0.90,
  'waste_management':             1.05,

  // Educational Services (NAICS 61)
  'education':                    0.95,

  // Health Care & Social Assistance (NAICS 62)
  'healthcare':                   1.15,
  'ambulatory_health_care':       1.20,
  'hospitals':                    1.15,
  'nursing_residential_care':     1.00,
  'social_assistance':            0.85,

  // Arts, Entertainment & Recreation (NAICS 71)
  'arts_entertainment':           0.80,
  'performing_arts_sports':       0.85,
  'museums_historical_sites':     0.80,
  'amusement_gambling_recreation': 0.85,

  // Accommodation & Food Services (NAICS 72)
  'accommodation_food':           0.85,
  'accommodation':                0.90,
  'food_service':                 0.85,

  // Other Services (NAICS 81)
  'other_services':               0.90,
  'repair_maintenance':           0.95,
  'personal_laundry_services':    0.85,
  'religious_civic_orgs':         0.80,
  'private_households':           0.75,

  // Government
  'government':                   0.80,

  // Catch-all
  'other':                        1.00,

  // Legacy aliases (backward compat with old form submissions)
  'technology':                   1.35,

  // ── Consolidated dropdown keys (v2) ──────────────────────
  // These map to the new 25-option flat dropdown.
  // Representative modifiers are weighted averages of
  // the sub-industries each option covers.
  'agriculture_forestry':         0.95,
  'mining_oil_gas':               1.30,
  'utilities_energy':             1.15,
  'construction_trades':          1.10,
  'food_beverage_mfg':            1.10,
  'chemical_petroleum_mfg':       1.35,
  'metals_machinery_mfg':         1.20,
  'electronics_computer_mfg':     1.40,
  'other_manufacturing':          1.10,
  'wholesale_distribution':       1.10,
  'retail_sales':                 0.90,
  'transportation_delivery':      1.05,
  'tech_software':                1.35,
  'media_telecom':                1.20,
  'finance_banking':              1.30,
  'real_estate_property':         1.10,
  'professional_business':        1.20,
  'admin_support':                0.95,
  'education_teaching':           0.95,
  'healthcare_medical':           1.15,
  'social_services':              0.85,
  'hotels_restaurants':           0.85,
  'arts_entertainment_sports':    0.80,
  'personal_services':            0.88,
  'government_public':            0.80,
};

/**
 * Inject dependencies from server.js:
 *   db        — better-sqlite3 database instance
 *   fetchCPIData  — BLS CPI fetcher
 *   getStateFromZip — ZIP→state helper
 */
module.exports = function createEconRouter({ db, fetchCPIData, getStateFromZip }) {

  // GET /api/local-data/:zipCode — Cost of living data by ZIP code
  router.get('/api/local-data/:zipCode', (req, res) => {
    const { zipCode } = req.params;
    if (!/^\d{5}$/.test(zipCode)) {
      return res.status(400).json({ error: 'Invalid ZIP code format' });
    }
    let data = db.prepare('SELECT * FROM local_data WHERE zip_code = ?').get(zipCode);
    if (!data) {
      data = db.prepare('SELECT * FROM local_data WHERE zip_code = ?').get('default');
    }
    // Derive state from ZIP for state-level tax estimation on client
    const derivedState = getStateFromZip(zipCode) || null;
    res.json({
      medianWage: data.median_wage,
      rent: data.rent,
      food: data.food,
      healthcare: data.healthcare,
      transport: data.transport,
      utilities: data.utilities,
      area: data.area,
      stateCode: derivedState,
    });
  });

  // POST /api/impact-calculator — Personalized economic impact metrics
  router.post('/api/impact-calculator', async (req, res) => {
    const { start_year, start_salary, current_salary, current_rent, industry, role_level, zip_code } = req.body;

    const startYear = parseInt(start_year, 10);
    const startSalary = parseFloat(start_salary);
    const currentSalary = parseFloat(current_salary);
    const currentRent = parseFloat(current_rent) || 0;
    const currentYear = new Date().getFullYear();

    if (!startYear || startYear < 1975 || startYear > currentYear) {
      return res.status(400).json({ error: `start_year must be between 1975 and ${currentYear}` });
    }
    if (!startSalary || startSalary <= 0 || startSalary > 10_000_000) {
      return res.status(400).json({ error: 'start_salary must be a positive number under $10M' });
    }
    if (!currentSalary || currentSalary <= 0 || currentSalary > 10_000_000) {
      return res.status(400).json({ error: 'current_salary must be a positive number under $10M' });
    }

    const yearsWorked = currentYear - startYear;

    // Fetch live CPI data from BLS API
    let cpiDataSource = 'LOCAL';
    const liveCPIData = await fetchCPIData(startYear, currentYear);

    // Merge live CPI data with local economic data
    const mergedEconomicData = {};
    for (let year = startYear; year <= currentYear; year++) {
      if (YEARLY_ECONOMIC_DATA[year]) {
        mergedEconomicData[year] = {
          ...YEARLY_ECONOMIC_DATA[year],
          ...(liveCPIData && liveCPIData[year] !== undefined && {
            cpi_inflation: liveCPIData[year]
          })
        };
        if (liveCPIData && liveCPIData[year] !== undefined) {
          cpiDataSource = 'BLS_API';
        }
      }
    }

    // Current-year wage index used as denominator for median wage scaling
    const currentWageIndex = (mergedEconomicData[currentYear] || YEARLY_ECONOMIC_DATA[2024]).wage_index;

    // Interpolated Growth Model (Productivity-Wage Gap)
    const standardPath = [];
    let simulatedSalary = startSalary;

    for (let year = startYear; year <= currentYear; year++) {
      const economicData = mergedEconomicData[year];
      if (!economicData) continue;

      if (year === startYear) {
        standardPath.push({ year, standardIncome: startSalary });
      } else {
        const inflationFactor = 1 + economicData.cpi_inflation;
        simulatedSalary *= inflationFactor;
        const yearsOfExperience = year - startYear;
        // Three-tier experience growth (BLS age-earnings data):
        // Years 1-10: 2.5%/year (steep early-career growth)
        // Years 11-20: 1.0%/year (mid-career deceleration)
        // Years 21+: 0.2%/year (late-career near-stagnation)
        const seniorityGrowth = yearsOfExperience <= 10 ? 0.025
          : yearsOfExperience <= 20 ? 0.010
          : 0.002;
        simulatedSalary *= (1 + seniorityGrowth);
        standardPath.push({ year, standardIncome: simulatedSalary });
      }
    }

    // Edge case: worker started this year or future year — no historical data to model
    if (standardPath.length === 0) {
      standardPath.push({ year: currentYear, standardIncome: currentSalary });
    }

    const simulatedEnd = standardPath[standardPath.length - 1].standardIncome;
    const realityRatio = simulatedEnd > 0 ? currentSalary / simulatedEnd : 1;

    const totalYears = standardPath.length;
    const incomePerYear = standardPath.map(({ year, standardIncome }, index) => {
      const interpolationFactor = 1 + (realityRatio - 1) * (index / (totalYears - 1 || 1));
      const actualIncome = standardIncome * interpolationFactor;
      return { year, income: actualIncome, standardIncome };
    });

    // Calculate unpaid labor value (value gap)
    let cumulativeProductivityGap = 0;
    let cumulativeRentBurden = 0;
    const yearlyBreakdown = [];

    // Anchor point: economic conditions when this worker started
    const startYearEconData = mergedEconomicData[startYear] || YEARLY_ECONOMIC_DATA[startYear] || YEARLY_ECONOMIC_DATA[1975];

    if (industry && !INDUSTRY_GAP_MODIFIERS[industry]) {
      console.warn(`Unknown industry key (length ${String(industry).length}), using default modifier 1.0`);
    }
    const industryModifier = (industry && INDUSTRY_GAP_MODIFIERS[industry]) || 1.0;

    // Resolve to broad NAICS sector for industry-specific productivity curves
    const { sector: resolvedSectorForGap } = resolveIndustrySector(industry);
    const sectorTimeSeries = INDUSTRY_ECONOMIC_DATA[resolvedSectorForGap] || INDUSTRY_ECONOMIC_DATA['national_average'];
    const sectorStartData = sectorTimeSeries[startYear] || sectorTimeSeries[1975];

    // BEA value-added ceiling: no worker's "fair value" should exceed industry VA per worker
    const derivedState = zip_code ? getStateFromZip(zip_code) : null;
    const industryVAData = getStateIndustryVA(derivedState || 'default', resolvedSectorForGap);
    const industryVACeiling = industryVAData.valueAddedPerWorker;

    // OEWS role-appropriate median for dampening (replaces flat $60k)
    const sectorWageData = OEWS_INDUSTRY_WAGES[resolvedSectorForGap] || OEWS_INDUSTRY_WAGES['national_average'];
    const roleMedianAnnual = sectorWageData.medianWage * ANNUAL_WORK_HOURS;

    // Occupation adjustment from declared role level
    const currentHourlyWage = currentSalary / ANNUAL_WORK_HOURS;
    const occupationData = getOccupationAdjustmentByRole(resolvedSectorForGap, role_level || null, currentHourlyWage);
    const occupationFactor = Math.sqrt(occupationData.adjustment); // dampen extreme ratios

    for (const { year, income, standardIncome } of incomePerYear) {
      const economicData = mergedEconomicData[year];
      if (!economicData) continue;

      // Dynamic median wage using OEWS sector median, scaled to each year's wage index
      const medianWageHeuristic = roleMedianAnnual * (economicData.wage_index / currentWageIndex);

      // --- Blended multiplier using INDUSTRY-SPECIFIC productivity/wage curves ---
      // Uses sector-specific indices (e.g., construction has flat productivity)
      // instead of national aggregates where the gap is massive.
      const sectorYearData = sectorTimeSeries[year];
      const absoluteRatio = sectorYearData
        ? sectorYearData.productivity_index / sectorYearData.wage_index
        : economicData.productivity_index / economicData.wage_index;
      const careerRelativeRatio = sectorYearData && sectorStartData
        ? (sectorYearData.productivity_index / sectorStartData.productivity_index)
          / (sectorYearData.wage_index / sectorStartData.wage_index)
        : (economicData.productivity_index / startYearEconData.productivity_index)
          / (economicData.wage_index / startYearEconData.wage_index);

      const careerYears = year - startYear;
      const blendWeight = Math.min(1, careerYears / 20);
      const baseMultiplier = careerRelativeRatio * (1 - blendWeight) + absoluteRatio * blendWeight;

      // Apply industry modifier to the gap portion only
      const fullMultiplier = 1 + ((baseMultiplier - 1) * industryModifier);

      // Smooth marginal dampening using role-appropriate median
      // When role is declared, use a gentler sqrt curve (trusts OEWS calibration more)
      // When wage-proxy, use the original hard dampening ratio
      const dampFactor = income <= medianWageHeuristic
        ? 1.0
        : occupationData.method === 'role-declared'
          ? Math.sqrt(medianWageHeuristic / income)
          : medianWageHeuristic / income;

      // Apply occupation adjustment to the gap portion
      const gapPortion = income * (fullMultiplier - 1) * dampFactor * occupationFactor;
      const rawFairValue = income + gapPortion;

      // Cap at BEA value-added per worker (inflation-adjusted to loop year)
      const yearsFromVABase = year - 2023;
      const adjustedVACeiling = industryVACeiling * Math.pow(1.02, yearsFromVABase);
      const fairValue = Math.min(rawFairValue, adjustedVACeiling);

      // Allow negative gaps (worker is paid above industry value-added)
      const unpaidLabor = fairValue - income;

      const userRentBurden = currentRent > 0 ? (currentRent * 12) / currentSalary : 0;
      const excessBurden = Math.max(0, userRentBurden - economicData.baseline_rent_burden);
      const yearlyExcessRent = income * excessBurden;

      cumulativeProductivityGap += unpaidLabor;
      cumulativeRentBurden += yearlyExcessRent;

      yearlyBreakdown.push({
        year,
        income: Math.round(income),
        standard_path: Math.round(standardIncome),
        productivity_index: economicData.productivity_index,
        wage_index: economicData.wage_index,
        fair_value: Math.round(fairValue),
        unpaid_labor: Math.round(unpaidLabor),
        excess_rent: Math.round(yearlyExcessRent),
      });
    }

    const cumulativeEconomicImpact = cumulativeProductivityGap + cumulativeRentBurden;
    const yearsOfWorkEquivalent = cumulativeEconomicImpact > 0
      ? (cumulativeEconomicImpact / currentSalary).toFixed(1)
      : '0.0';

    const totalValueGenerated = yearlyBreakdown.reduce((sum, yr) => sum + yr.fair_value, 0);
    const totalWagesReceived = yearlyBreakdown.reduce((sum, yr) => sum + yr.income, 0);

    const firstYearData = mergedEconomicData[startYear] || YEARLY_ECONOMIC_DATA[1975];
    const lastYearData = mergedEconomicData[currentYear] || YEARLY_ECONOMIC_DATA[2024];

    const totalProductivityGrowth = ((lastYearData.productivity_index / firstYearData.productivity_index - 1) * 100).toFixed(1);
    const totalWageGrowth = ((lastYearData.wage_index / firstYearData.wage_index - 1) * 100).toFixed(1);

    // Housing opportunity cost
    const historicalData = db.prepare('SELECT * FROM historical_economic_data WHERE id = 1').get();
    const baselineRatio = historicalData.home_price_to_income_1985;
    const currentRatio = historicalData.home_price_to_income_now;
    const medianHomePrice = currentSalary * currentRatio;
    const yearsToAffordThen = baselineRatio;
    const yearsToAffordNow = currentRatio;
    const housingTimeGap = yearsToAffordNow - yearsToAffordThen;

    // Fix 7/8: Deflate yearly breakdown to constant dollars
    const deflatedBreakdown = deflateCareerSeries(yearlyBreakdown, BASE_YEAR);

    // Real-dollar summary totals
    const totalValueGeneratedReal = deflatedBreakdown.reduce((sum, yr) => sum + (yr.fair_value_real || yr.fair_value), 0);
    const totalWagesReceivedReal = deflatedBreakdown.reduce((sum, yr) => sum + (yr.income_real || yr.income), 0);
    const cumulativeProductivityGapReal = deflatedBreakdown.reduce((sum, yr) => sum + (yr.unpaid_labor_real || yr.unpaid_labor), 0);

    // Fix 8: Gap decomposition — where does the money go?
    // Only decompose if there's a positive gap to explain
    const gapDecomposition = cumulativeProductivityGap > 0
      ? decomposeGap(cumulativeProductivityGap, resolvedSectorForGap)
      : null;

    // Fix 9: Data provenance
    const impactProvenance = buildDataProvenance([
      'epi_productivity_pay',
      'bls_cpi_u',
      'bea_gdp_by_industry',
      'bls_cpi_u_rs',
      'industry_gap_modifiers'
    ]);

    res.json({
      inputs: {
        start_year: startYear,
        start_salary: startSalary,
        current_salary: currentSalary,
        current_rent: currentRent,
        industry: industry || null,
        industry_modifier: industryModifier,
        resolved_sector: resolvedSectorForGap,
        role_level: role_level || null,
        occupation_factor: parseFloat(occupationFactor.toFixed(3)),
        va_ceiling: industryVACeiling,
        years_worked: yearsWorked,
        reality_ratio: parseFloat(realityRatio.toFixed(3)),
        simulated_end_salary: Math.round(simulatedEnd),
      },
      summary: {
        cumulative_economic_impact: Math.round(cumulativeEconomicImpact),
        unrealized_productivity_gains: Math.round(cumulativeProductivityGap),
        excess_rent_burden: Math.round(cumulativeRentBurden),
        years_of_work_equivalent: parseFloat(yearsOfWorkEquivalent),
        total_value_generated: totalValueGenerated,
        total_wages_received: totalWagesReceived,
      },
      metrics: {
        productivity: {
          label: 'Productivity Growth Over Career',
          value: `${totalProductivityGrowth}%`,
          detail: `Productivity index grew from ${firstYearData.productivity_index.toFixed(1)} to ${lastYearData.productivity_index.toFixed(1)}`,
        },
        wages: {
          label: 'Real Wage Growth Over Career',
          value: `${totalWageGrowth}%`,
          detail: `Wage index grew from ${firstYearData.wage_index.toFixed(1)} to ${lastYearData.wage_index.toFixed(1)}`,
        },
        gap: {
          label: 'Productivity-Wage Gap',
          value: `${(parseFloat(totalProductivityGrowth) - parseFloat(totalWageGrowth)).toFixed(1)}%`,
          detail: `If wages had tracked productivity, your cumulative earnings would be ${Math.round(cumulativeProductivityGap)} higher`,
        },
        rent: {
          label: 'Rent Burden Increase',
          value: `${((lastYearData.baseline_rent_burden - firstYearData.baseline_rent_burden) * 100).toFixed(1)}%`,
          detail: `Baseline rent burden increased from ${(firstYearData.baseline_rent_burden * 100).toFixed(0)}% to ${(lastYearData.baseline_rent_burden * 100).toFixed(0)}% of income`,
        },
        housing: {
          label: 'Housing Time Gap',
          value: `${housingTimeGap.toFixed(1)} years`,
          detail: `In 1985, a median home cost ${yearsToAffordThen} years of income. Today it costs ${yearsToAffordNow} years - an additional ${housingTimeGap.toFixed(1)} years of labor required`,
          median_home_price: Math.round(medianHomePrice),
          baseline_ratio: baselineRatio,
          current_ratio: currentRatio,
        },
      },
      yearly_breakdown: yearlyBreakdown,
      yearly_breakdown_real: deflatedBreakdown,
      summary_real: {
        total_value_generated_real: Math.round(totalValueGeneratedReal),
        total_wages_received_real: Math.round(totalWagesReceivedReal),
        unrealized_productivity_gains_real: Math.round(cumulativeProductivityGapReal),
        base_year: BASE_YEAR,
        note: `All _real values are in constant ${BASE_YEAR} dollars (CPI-U-RS deflated)`
      },
      gap_decomposition: gapDecomposition,
      data_provenance: impactProvenance,
      methodology: {
        fair_value_formula: "Fair Value = Market Median \u00d7 Productivity Adjustment \u00d7 Experience Factor",
        seniority_model: "Experience adds value on a curve. The interpolation model uses three tiers: 2.5% per year for years 1-10, 1.0% for years 11-20, and 0.2% for years 21+ (reflecting late-career wage stagnation per BLS age-earnings data). The worth-gap model uses a logarithmic curve (growth factor 0.10) normalized to industry-median tenure.",
        work_year: "1,680 hours (35 hours/week x 48 weeks)",
        rent_burden: `Baseline rent burden: ${(firstYearData.baseline_rent_burden * 100).toFixed(0)}% in ${startYear}, ${(lastYearData.baseline_rent_burden * 100).toFixed(0)}% today`,
        interpolation: "Your income is modeled year-by-year using CPI inflation and experience growth, then calibrated so year one matches your starting salary and the current year matches your actual salary.",
        sources: [
          { name: "Economic Policy Institute", type: "Productivity-wage gap data (1979-2024)", url: "https://www.epi.org/productivity-pay-gap/" },
          { name: "Bureau of Labor Statistics", type: `CPI inflation data (${cpiDataSource})`, url: "https://www.bls.gov/cpi/" },
          { name: "Federal Reserve", type: "Economic indicators", url: "https://fred.stlouisfed.org/" },
          { name: "Census Bureau", type: "Housing cost trends", url: "https://www.census.gov/topics/housing.html" },
          ...(startYear >= 2019 && startYear <= 2021 ? [{ name: "Note on 2020 Wage Data", type: "Wage index in 2020 reflects a temporary pandemic-era spike due to low-wage job losses. Your anchor year may show a slightly larger gap as wages corrected in 2021-2022." }] : [])
        ]
      },
      data_sources: {
        cpi_inflation: cpiDataSource,
        productivity_wage: 'LOCAL',
      },
      sources: [
        'Economic Policy Institute (productivity-wage gap data)',
        `Bureau of Labor Statistics (CPI data${cpiDataSource === 'BLS_API' ? ' - Live API' : ' - Local fallback'})`,
        'Federal Reserve (economic indicators)',
        'Census Bureau (housing cost trends)',
      ],
    });
  });

  // POST /api/worth-gap-analyzer — Worth gap with empowerment-focused response
  router.post('/api/worth-gap-analyzer', async (req, res) => {
    const { current_wage, frequency, zip_code, state, msa, start_year, years_experience, years_experience_role, industry, role_level } = req.body;

    if (!current_wage || current_wage <= 0 || current_wage > 10_000_000) {
      return res.status(400).json({ error: 'current_wage must be a positive number under $10M' });
    }

    // Convert to hourly for internal calculations
    let hourlyWage = parseFloat(current_wage);
    if (frequency === 'annual') {
      hourlyWage = current_wage / ANNUAL_WORK_HOURS;
    } else if (frequency === 'monthly') {
      hourlyWage = current_wage / 140;
    }

    const currentYear = new Date().getFullYear();
    const startYearParsed = parseInt(start_year) || currentYear - 5;
    // Use role-specific experience for market comparison (career changers),
    // fall back to total career tenure for backward compatibility
    const yearsExpRole = parseInt(years_experience_role);
    const yearsExp = !isNaN(yearsExpRole) ? yearsExpRole : (parseInt(years_experience) || (currentYear - startYearParsed));
    const sanitizedState = typeof state === 'string' && /^[A-Z]{2}$/.test(state) ? state : null;
    const sanitizedMsa = typeof msa === 'string' ? msa.slice(0, 100) : null;
    const derivedState = sanitizedState || getStateFromZip(zip_code);

    const marketData = calculationService.calculateMarketMedian(
      { zipCode: zip_code, state: derivedState, msa: sanitizedMsa, industry, yearsExperience: yearsExp, roleLevel: role_level || null },
      MSA_WAGE_DATA,
      STATE_WAGE_DATA
    );

    const worthGapData = calculationService.calculateWorthGap({
      currentWage: hourlyWage,
      marketMedian: marketData.adjustedMedian,
      startYear: startYearParsed,
      industry,
      roleLevel: role_level || null
    });

    const validationMessage = calculationService.generateValidationMessage(worthGapData, marketData);

    let opportunityCost = null;
    if (worthGapData.worthGap.hourly > 0) {
      opportunityCost = calculationService.calculateOpportunityCost({
        currentWage: hourlyWage,
        deservedWage: worthGapData.deservedWage.hourly,
        startDate: new Date(startYearParsed, 0, 1)
      });
    }

    const yearsToRetirement = Math.max(0, 67 - (currentYear - startYearParsed + 22));
    const lifetimeCost = worthGapData.worthGap.annual > 0
      ? calculationService.calculateLifetimeCost({
          annualGap: worthGapData.worthGap.annual,
          yearsRemaining: yearsToRetirement
        })
      : null;

    res.json({
      deservedWage: worthGapData.deservedWage,
      currentWage: worthGapData.currentWage,
      worthGap: worthGapData.worthGap,
      validationMessage,
      marketData: {
        median: marketData.median,
        adjustedMedian: marketData.adjustedMedian,
        source: marketData.source,
        experienceAdjustment: marketData.experienceMultiplier
      },
      productivityContext: worthGapData.productivityAdjustment,
      industryContext: worthGapData.industryContext,
      occupationContext: worthGapData.occupationContext,
      benefitsContext: worthGapData.benefitsContext,
      opportunityCost,
      lifetimeImpact: lifetimeCost,
      gapDecomposition: worthGapData.worthGap.annual > 0
        ? decomposeGap(worthGapData.worthGap.annual, worthGapData.industryContext.resolvedSector)
        : null,
      laborShareBaselines: calculateMultipleBaselines(
        worthGapData.industryContext.resolvedSector,
        worthGapData.deservedWage.annual
      ),
      marketDataExtended: {
        median: marketData.median,
        adjustedMedian: marketData.adjustedMedian,
        source: marketData.source,
        experienceAdjustment: marketData.experienceMultiplier,
        rpp: marketData.rpp,
        rppSource: marketData.rppSource,
        rppFactor: marketData.rppFactor,
        industryVA: marketData.industryVA
      },
      data_provenance: buildDataProvenance([
        'bls_oews',
        'bls_ecec',
        'bea_rpp_state',
        'bea_gdp_by_industry',
        'epi_productivity_pay',
        'bea_nipa_labor_share',
        'mincer_coefficients'
      ]),
      sources: [
        'Bureau of Labor Statistics (BLS) Occupational Employment and Wage Statistics',
        'Economic Policy Institute productivity-wage gap research',
        'BLS Labor Productivity and Costs (LPC) by industry sector',
        'BEA Regional Price Parities (RPP)',
        'BLS Employer Costs for Employee Compensation (ECEC)',
        marketData.source
      ]
    });
  });

  // POST /api/negotiation-script — Practical negotiation framework (3-path)
  //
  // Path A: Below market (salary < market median) — actionable framework
  // Path B: At/above market (salary >= market median) — maintenance advice
  // Path C: Research mode (mode === 'research') — data only, no negotiation
  router.post('/api/negotiation-script', async (req, res) => {
    const {
      current_salary,
      market_median,
      years_at_company,
      industry,
      role,
      achievements,
      mode
    } = req.body;

    if (!current_salary || current_salary <= 0) {
      return res.status(400).json({ error: 'current_salary is required' });
    }

    const annualSalary = parseFloat(current_salary);
    const parsedMedian = Math.round(parseFloat(market_median));
    const hasMarketData = parsedMedian > 0 && !isNaN(parsedMedian);
    const marketMedianAnnual = hasMarketData ? parsedMedian : null;
    const isAboveMarket = hasMarketData ? annualSalary >= marketMedianAnnual : null;
    const marketDiffPercent = hasMarketData
      ? Math.abs(((annualSalary - marketMedianAnnual) / marketMedianAnnual) * 100).toFixed(1)
      : null;

    const currentYear = new Date().getFullYear();
    const currentData = YEARLY_ECONOMIC_DATA[currentYear] || YEARLY_ECONOMIC_DATA[2024];
    const baselineData = YEARLY_ECONOMIC_DATA[1979] || YEARLY_ECONOMIC_DATA[1975];
    const productivityGrowth = ((currentData.productivity_index / baselineData.productivity_index - 1) * 100).toFixed(0);
    const wageGrowth = ((currentData.wage_index / baselineData.wage_index - 1) * 100).toFixed(0);

    // Structural context: background information for all paths.
    // This validates the worker's experience but is NOT negotiation ammunition.
    const structuralContext = {
      productivityGrowth: `${productivityGrowth}%`,
      wageGrowth: `${wageGrowth}%`,
      gapRatio: `~${Math.round(parseFloat(productivityGrowth) / Math.max(1, parseFloat(wageGrowth)))}x`,
      summary: `Since 1979, worker productivity has grown roughly ${Math.round(parseFloat(productivityGrowth) / Math.max(1, parseFloat(wageGrowth)))}x faster than typical pay. Your individual gap reflects a broader structural pattern.`,
      note: 'This context helps you understand why wages have not kept pace. It is not something to cite in a negotiation meeting.',
      source: 'Economic Policy Institute, productivity-pay gap data'
    };

    // PATH C: Research mode (data only, no negotiation advice)
    if (mode === 'research') {
      return res.json({
        mode: 'research',
        currentSalary: annualSalary,
        marketMedian: marketMedianAnnual,
        isAboveMarket,
        marketDiffPercent: parseFloat(marketDiffPercent),
        structuralContext,
        dataOnly: {
          marketMedianAnnual,
          marketMedianHourly: Math.round((marketMedianAnnual / ANNUAL_WORK_HOURS) * 100) / 100,
          industryContext: industry || 'not specified',
          role: role || 'not specified'
        }
      });
    }

    // PATH D: No market data available — structural context only
    if (!hasMarketData) {
      return res.json({
        mode: 'no_market_data',
        currentSalary: annualSalary,
        marketMedian: null,
        isAboveMarket: null,
        marketDiffPercent: null,
        openingStatement: `We could not find reliable market data for this specific role and location. The structural context below shows the broader productivity-wage gap, and the preparation notes can still help you research and negotiate.`,
        evidenceBullets: [
          `Your current pay: $${annualSalary.toLocaleString()}/year`,
          `Market median for this role was not available — check BLS.gov/oes for your occupation and area`,
          `Since 1979, productivity has grown ~${productivityGrowth}% while typical wages grew ~${wageGrowth}%`
        ],
        recommendations: [
          `Look up your specific occupation at bls.gov/oes to find the actual market median`,
          `Ask colleagues in similar roles about their compensation range`,
          `Document your contributions quarterly for review conversations`,
          `Consider negotiating non-salary benefits: equity, flexibility, title, professional development`
        ],
        resolutionLanguage: `Research the market rate for your role at BLS.gov/oes before your conversation. A precise number grounded in data is always more effective than a general request.`,
        structuralContext,
        prepNotes: {
          bestTimeToAsk: 'After a win: a project shipped, a strong review, a problem solved',
          documentEverything: 'Track your contributions quarterly so you have data ready at review time',
          followUpEmail: 'After any compensation conversation, send an email summarizing what was discussed',
          researchFirst: 'Visit bls.gov/oes and search your occupation code to find the actual median wage for your area'
        }
      });
    }

    // PATH B: At or above market
    if (isAboveMarket) {
      return res.json({
        mode: 'at_above_market',
        currentSalary: annualSalary,
        marketMedian: marketMedianAnnual,
        isAboveMarket: true,
        marketDiffPercent: parseFloat(marketDiffPercent),
        // Kept for backward compat with existing client rendering
        openingStatement: `Your pay exceeds the market median for this role by ${marketDiffPercent}%. You are in a strong position.`,
        evidenceBullets: [
          `Market median for this role: $${marketMedianAnnual.toLocaleString()}/year (BLS, ${currentYear})`,
          `Your current pay: $${annualSalary.toLocaleString()}/year, which is ${marketDiffPercent}% above market`
        ],
        recommendations: [
          `Document your contributions quarterly for review conversations`,
          `Research whether your role's market rate is trending up or down`,
          `Consider negotiating non-salary benefits: equity, flexibility, title, professional development`
        ],
        resolutionLanguage: `You are being compensated competitively. Focus on maintaining your position by documenting wins, staying current on market trends, and helping coworkers who may be underpaid.`,
        counterofferResponses: {
          stayingCompetitive: `I want to make sure my compensation stays aligned with my contributions as I take on new responsibilities.`,
          nonSalary: `I would like to discuss professional development budget, additional PTO, or remote flexibility.`,
          helpingOthers: `I am in a good position. Are there opportunities to mentor or advocate for team members who may be below market?`
        },
        structuralContext,
        prepNotes: {
          bestTimeToAsk: 'After a win: a project shipped, a strong review, a problem solved',
          documentEverything: 'Track your contributions quarterly so you have data ready at review time',
          followUpEmail: 'After any compensation conversation, send an email summarizing what was discussed'
        }
      });
    }

    // PATH A: Below market (practical negotiation framework)
    // Use a precise number (research shows precise asks are more effective)
    const preciseTarget = Math.round(marketMedianAnnual / 100) * 100 + 500;

    const theGap = [
      `Market median for this role: $${marketMedianAnnual.toLocaleString()}/year (BLS, ${currentYear})`,
      `Your current pay: $${annualSalary.toLocaleString()}/year, which is ${marketDiffPercent}% below market median`,
    ];

    if (years_at_company) {
      theGap.push(`With ${years_at_company} years of experience, workers in your position typically earn at or above market median`);
    }

    if (achievements && Array.isArray(achievements)) {
      achievements.slice(0, 10).forEach(function(achievement) {
        if (typeof achievement === 'string' && achievement.length <= 500) {
          theGap.push(achievement.trim());
        }
      });
    }

    res.json({
      mode: 'below_market',
      currentSalary: annualSalary,
      marketMedian: marketMedianAnnual,
      isAboveMarket: false,
      marketDiffPercent: parseFloat(marketDiffPercent),
      proposedSalary: preciseTarget,
      raiseAmount: preciseTarget - annualSalary,
      raisePercentage: parseFloat((((preciseTarget - annualSalary) / annualSalary) * 100).toFixed(1)),
      // Backward compat: openingStatement, evidenceBullets, resolutionLanguage still present
      openingStatement: `Based on BLS occupational wage data, the market median for this role in your area is $${marketMedianAnnual.toLocaleString()}. ` +
        `Your current pay of $${annualSalary.toLocaleString()} is ${marketDiffPercent}% below that benchmark.`,
      evidenceBullets: theGap,
      resolutionLanguage: `I am requesting $${preciseTarget.toLocaleString()}, a ${(((preciseTarget - annualSalary) / annualSalary) * 100).toFixed(1)}% adjustment to bring my compensation in line with the market rate for this role.`,
      // New structured fields for the 3-path UI
      theNumber: {
        marketMedian: marketMedianAnnual,
        experienceAdjustedTarget: preciseTarget,
        raiseAmount: preciseTarget - annualSalary,
        raisePercentage: parseFloat((((preciseTarget - annualSalary) / annualSalary) * 100).toFixed(1))
      },
      theAsk: `Based on ${years_at_company ? years_at_company + ' years of experience and ' : ''}BLS data for this role, I am requesting $${preciseTarget.toLocaleString()}.`,
      framingAdvice: [
        'Lead with your contributions, not your needs',
        `Reference market data: "Based on BLS occupational wage data for this role, the median is $${marketMedianAnnual.toLocaleString()}"`,
        `Use a precise number ($${preciseTarget.toLocaleString()}, not "around $${Math.round(preciseTarget / 1000) * 1000}") because research shows precise asks are more effective`,
        'If they say no to salary, ask about: signing bonus, extra PTO, remote flexibility, professional development budget'
      ],
      counterofferResponses: {
        lowBall: `I appreciate the offer. That still leaves me below market rate. Can we meet closer to $${preciseTarget.toLocaleString()}?`,
        nonMonetary: `I appreciate perks, but I would like to discuss the base salary first, then we can talk about additional benefits.`,
        waitUntilReview: `Every month at my current rate costs me $${Math.round((preciseTarget - annualSalary) / 12).toLocaleString()} relative to market. Can we do a partial adjustment now?`,
        noRoomInBudget: `I understand. Could we do half now and the rest at next review? Or put a target in writing that we revisit in 90 days?`,
        needToThinkAboutIt: `Of course. Can we set a specific date to follow up? I would like to have an answer within two weeks.`
      },
      structuralContext,
      prepNotes: {
        bestTimeToAsk: 'After a win: a project shipped, a strong review, a problem solved',
        avoidAsking: 'During layoffs or budget freezes',
        documentEverything: 'Write down what they say. Promises without paper do not count.',
        followUpEmail: 'After the meeting, send an email summarizing what was agreed'
      }
    });
  });

  return router;
};
