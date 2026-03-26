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
const { MSA_WAGE_DATA, STATE_WAGE_DATA } = require('../services/wageData');

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
    let data = db.prepare('SELECT * FROM local_data WHERE zip_code = ?').get(zipCode);
    if (!data) {
      data = db.prepare('SELECT * FROM local_data WHERE zip_code = ?').get('default');
    }
    res.json({
      medianWage: data.median_wage,
      rent: data.rent,
      food: data.food,
      healthcare: data.healthcare,
      transport: data.transport,
      utilities: data.utilities,
      area: data.area,
    });
  });

  // POST /api/impact-calculator — Personalized economic impact metrics
  router.post('/api/impact-calculator', async (req, res) => {
    const { start_year, start_salary, current_salary, current_rent, industry } = req.body;

    const startYear = parseInt(start_year, 10);
    const startSalary = parseFloat(start_salary);
    const currentSalary = parseFloat(current_salary);
    const currentRent = parseFloat(current_rent) || 0;
    const currentYear = new Date().getFullYear();

    if (!startYear || startYear < 1975 || startYear > currentYear) {
      return res.status(400).json({ error: `start_year must be between 1975 and ${currentYear}` });
    }
    if (!startSalary || startSalary <= 0) {
      return res.status(400).json({ error: 'start_salary must be a positive number' });
    }
    if (!currentSalary || currentSalary <= 0) {
      return res.status(400).json({ error: 'current_salary must be a positive number' });
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
        const seniorityGrowth = yearsOfExperience <= 15 ? 0.025 : 0.010;
        simulatedSalary *= (1 + seniorityGrowth);
        standardPath.push({ year, standardIncome: simulatedSalary });
      }
    }

    const simulatedEnd = standardPath[standardPath.length - 1].standardIncome;
    const realityRatio = currentSalary / simulatedEnd;

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

    for (const { year, income, standardIncome } of incomePerYear) {
      const economicData = mergedEconomicData[year];
      if (!economicData) continue;

      const baseRatio = economicData.productivity_index / economicData.wage_index;
      if (industry && !INDUSTRY_GAP_MODIFIERS[industry]) {
        console.warn(`Industry "${industry}" not found in INDUSTRY_GAP_MODIFIERS, using default 1.0`);
      }
      const industryModifier = (industry && INDUSTRY_GAP_MODIFIERS[industry]) || 1.0;
      const productivityWageRatio = baseRatio * industryModifier;
      const fairValue = income * productivityWageRatio;
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

    res.json({
      inputs: {
        start_year: startYear,
        start_salary: startSalary,
        current_salary: currentSalary,
        current_rent: currentRent,
        industry: industry || null,
        industry_modifier: (industry && INDUSTRY_GAP_MODIFIERS[industry]) || 1.0,
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
      methodology: {
        fair_value_formula: "Fair Value = Your Income x (Productivity Index / Wage Index)",
        seniority_model: "2.5% growth per year for first 15 years, 1% after",
        work_year: "2,080 hours (40 hours/week x 52 weeks)",
        rent_burden: `Baseline rent burden: ${(firstYearData.baseline_rent_burden * 100).toFixed(0)}% in ${startYear}, ${(lastYearData.baseline_rent_burden * 100).toFixed(0)}% today`,
        interpolation: "Linear interpolation ensures Year 1 = your starting salary and current year = your current salary",
        sources: [
          { name: "Economic Policy Institute", type: "Productivity-wage gap data (1979-2024)", url: "https://www.epi.org/productivity-pay-gap/" },
          { name: "Bureau of Labor Statistics", type: `CPI inflation data (${cpiDataSource})`, url: "https://www.bls.gov/cpi/" },
          { name: "Federal Reserve", type: "Economic indicators", url: "https://fred.stlouisfed.org/" },
          { name: "Census Bureau", type: "Housing cost trends", url: "https://www.census.gov/topics/housing.html" }
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
    const { current_wage, frequency, zip_code, state, msa, start_year, years_experience, years_experience_role } = req.body;

    if (!current_wage || current_wage <= 0) {
      return res.status(400).json({ error: 'current_wage must be a positive number' });
    }

    // Convert to hourly for internal calculations
    let hourlyWage = parseFloat(current_wage);
    if (frequency === 'annual') {
      hourlyWage = current_wage / 2080;
    } else if (frequency === 'monthly') {
      hourlyWage = current_wage / 173.33;
    }

    const currentYear = new Date().getFullYear();
    const startYearParsed = parseInt(start_year) || currentYear - 5;
    // Use role-specific experience for market comparison (career changers),
    // fall back to total career tenure for backward compatibility
    const yearsExpRole = parseInt(years_experience_role);
    const yearsExp = !isNaN(yearsExpRole) ? yearsExpRole : (parseInt(years_experience) || (currentYear - startYearParsed));
    const derivedState = state || getStateFromZip(zip_code);

    const marketData = calculationService.calculateMarketMedian(
      { zipCode: zip_code, state: derivedState, msa, yearsExperience: yearsExp },
      MSA_WAGE_DATA,
      STATE_WAGE_DATA
    );

    const worthGapData = calculationService.calculateWorthGap({
      currentWage: hourlyWage,
      marketMedian: marketData.adjustedMedian,
      startYear: startYearParsed
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
      opportunityCost,
      lifetimeImpact: lifetimeCost,
      sources: [
        'Bureau of Labor Statistics (BLS) Occupational Employment and Wage Statistics',
        'Economic Policy Institute productivity-wage gap research',
        marketData.source
      ]
    });
  });

  // POST /api/negotiation-script — Personalized negotiation script
  router.post('/api/negotiation-script', async (req, res) => {
    const {
      current_salary,
      market_median,
      years_at_company,
      industry,
      role,
      achievements
    } = req.body;

    if (!current_salary || current_salary <= 0) {
      return res.status(400).json({ error: 'current_salary is required' });
    }

    const annualSalary = parseFloat(current_salary);

    const marketMedianAnnual = parseFloat(market_median) || annualSalary * 1.15;
    const baseline = Math.max(marketMedianAnnual, annualSalary);
    const proposedSalary = Math.round(baseline * 1.05);
    const raiseAmount = proposedSalary - annualSalary;
    const raisePercentage = ((raiseAmount / annualSalary) * 100).toFixed(1);

    const currentYear = new Date().getFullYear();
    const currentData = YEARLY_ECONOMIC_DATA[currentYear] || YEARLY_ECONOMIC_DATA[2024];
    const baselineData = YEARLY_ECONOMIC_DATA[1975];
    const productivityGrowth = ((currentData.productivity_index / baselineData.productivity_index - 1) * 100).toFixed(0);
    const wageGrowth = ((currentData.wage_index / baselineData.wage_index - 1) * 100).toFixed(0);

    const openingStatement = `Based on my research using Bureau of Labor Statistics data, ` +
      `I'd like to discuss adjusting my compensation to better reflect the value I bring to this role. ` +
      `The market median for ${role || 'this position'} in our area is $${marketMedianAnnual.toLocaleString()}, ` +
      `and I believe my ${years_at_company ? `${years_at_company} years of experience here` : 'experience'} ` +
      `and contributions warrant a discussion about my current rate.`;

    const evidenceBullets = [
      `The median salary for ${role || 'comparable roles'} in our metro area is $${marketMedianAnnual.toLocaleString()} (BLS ${currentYear})`,
      `Worker productivity has grown ${productivityGrowth}% since 1975 while wages grew only ${wageGrowth}% (Economic Policy Institute)`,
    ];

    if (achievements && achievements.length > 0) {
      achievements.forEach(achievement => {
        evidenceBullets.push(`Demonstrated value: ${achievement}`);
      });
    }

    const resolutionLanguage = `I'm proposing a salary adjustment to $${proposedSalary.toLocaleString()} annually, ` +
      `which represents a ${raisePercentage}% increase. This would bring my compensation in line with market rates ` +
      `while recognizing my contributions to the team.`;

    const counterofferResponses = {
      lowBall: `I appreciate the offer, but $[AMOUNT] is still significantly below market rate. ` +
        `Given my track record and the data I've shared, I'd like to find a middle ground that better reflects my value.`,
      nonMonetary: `While I value professional development opportunities, they don't address the compensation gap. ` +
        `I'd like to discuss both salary adjustment AND those additional benefits.`,
      waitUntilReview: `I understand the timing concern, but my research shows I'm currently ${raisePercentage}% below market. ` +
        `Waiting another ${12 - new Date().getMonth()} months compounds that gap. ` +
        `Can we discuss an interim adjustment?`,
      noRoomInBudget: `I understand budget constraints. Would you be open to a phased increase? ` +
        `Perhaps half now and the remainder at our next review cycle?`,
      needToThinkAboutIt: `I understand you need time. When can we schedule a follow-up? ` +
        `I'd like to resolve this within the next two weeks if possible.`
    };

    res.json({
      proposedSalary,
      currentSalary: annualSalary,
      raiseAmount,
      raisePercentage: parseFloat(raisePercentage),
      openingStatement,
      evidenceBullets,
      resolutionLanguage,
      counterofferResponses,
      prepNotes: {
        bestTimeToAsk: 'After a successful project completion or positive performance feedback',
        avoidAsking: 'During company-wide budget freezes or layoffs',
        documentEverything: 'Keep notes of this conversation and any promises made',
        followUpEmail: 'Send a summary email after the meeting to create a paper trail'
      }
    });
  });

  return router;
};
