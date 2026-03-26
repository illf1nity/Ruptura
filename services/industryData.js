/**
 * RUPTURA - Industry-Segmented Economic Data
 * =============================================
 * Productivity and wage indices by industry sector (1975-2024)
 * Modeled on BLS Labor Productivity and Costs (LPC) database
 * using broad NAICS categories.
 *
 * This addresses Baumol's cost disease: service sectors (healthcare,
 * education, food service) show flatter productivity growth, while
 * goods-producing and information sectors show massive productivity
 * gains that far outstrip wage growth.
 *
 * Sources (modeled from):
 *   - BLS Major Sector Productivity and Costs (LPC)
 *   - Economic Policy Institute productivity-pay gap analysis
 *   - BLS Industry Productivity studies by NAICS sector
 */

// ============================================
// SECTOR GROWTH CONFIGURATIONS
// ============================================
// Each sector defines base annual growth rates and era-specific
// overrides to model real economic cycles (dot-com boom, 2008 crisis,
// pandemic). All indices start at 100.0 in 1975.

const SECTOR_CONFIGS = {
  national_average: {
    baseProductivityGrowth: 0.0172,
    baseWageGrowth: 0.0065,
    // Fix 7: Historical labor share baselines (BEA NIPA Tables 1.12, 6.2D)
    laborShareBaselines: {
      peakYear: 1970,
      peakLaborShare: 0.65,
      preDivergenceMean: 0.63,   // 1947-1979 average
      currentLaborShare: 0.56,
    },
    oecdComparison: {
      germany: 0.61, france: 0.59, sweden: 0.63, japan: 0.55, uk: 0.58,
    },
    eraOverrides: {
      // Stagflation era
      1980: { p: 0.005, w: -0.009 },
      1981: { p: 0.021, w: 0.003 },
      1982: { p: -0.002, w: 0.006 },
      // Recovery
      1983: { p: 0.030, w: 0.005 },
      1984: { p: 0.030, w: 0.006 },
      // Late 90s boom
      1997: { p: 0.022, w: 0.009 },
      1998: { p: 0.024, w: 0.014 },
      1999: { p: 0.027, w: 0.013 },
      2000: { p: 0.025, w: 0.013 },
      // Dot-com bust
      2001: { p: 0.016, w: 0.007 },
      // Great Recession
      2008: { p: 0.011, w: -0.002 },
      2009: { p: 0.023, w: 0.014 },
      2010: { p: 0.033, w: 0.010 },
      // Pandemic era
      2020: { p: 0.022, w: 0.028 },
      2021: { p: 0.021, w: 0.003 },
      2022: { p: 0.006, w: -0.017 },
      2023: { p: 0.010, w: 0.007 },
    }
  },

  tech: {
    // Information sector (NAICS 51) + software
    // Massive productivity from computing, automation, AI
    baseProductivityGrowth: 0.032,
    baseWageGrowth: 0.013,
    laborShareBaselines: {
      peakYear: 1980, peakLaborShare: 0.72,
      preDivergenceMean: 0.68, currentLaborShare: 0.45,
    },
    oecdComparison: { germany: 0.55, france: 0.52, sweden: 0.58, japan: 0.48, uk: 0.50 },
    eraOverrides: {
      // PC revolution
      1984: { p: 0.055, w: 0.015 },
      1985: { p: 0.048, w: 0.014 },
      // Internet era begins
      1995: { p: 0.045, w: 0.018 },
      1996: { p: 0.050, w: 0.020 },
      1997: { p: 0.058, w: 0.025 },
      1998: { p: 0.062, w: 0.028 },
      1999: { p: 0.065, w: 0.030 },
      2000: { p: 0.055, w: 0.025 },
      // Dot-com bust
      2001: { p: 0.010, w: 0.005 },
      2002: { p: 0.018, w: 0.008 },
      // Recovery + cloud computing
      2005: { p: 0.038, w: 0.015 },
      2006: { p: 0.040, w: 0.014 },
      // Great Recession (tech more resilient)
      2008: { p: 0.020, w: 0.008 },
      2009: { p: 0.028, w: 0.010 },
      // Mobile + cloud boom
      2012: { p: 0.042, w: 0.016 },
      2013: { p: 0.045, w: 0.015 },
      // Pandemic (remote work boom)
      2020: { p: 0.058, w: 0.022 },
      2021: { p: 0.050, w: 0.018 },
      // Tech layoffs + AI productivity
      2022: { p: 0.030, w: 0.005 },
      2023: { p: 0.038, w: 0.008 },
      2024: { p: 0.042, w: 0.010 },
    }
  },

  manufacturing: {
    // NAICS 31-33: Automation, robotics, lean manufacturing
    // Huge productivity gains, wages stagnated
    baseProductivityGrowth: 0.026,
    baseWageGrowth: 0.005,
    laborShareBaselines: {
      peakYear: 1975, peakLaborShare: 0.62,
      preDivergenceMean: 0.60, currentLaborShare: 0.48,
    },
    oecdComparison: { germany: 0.58, france: 0.55, sweden: 0.60, japan: 0.50, uk: 0.52 },
    eraOverrides: {
      // Stagflation hit manufacturing hard
      1980: { p: 0.002, w: -0.012 },
      1981: { p: 0.010, w: -0.005 },
      1982: { p: -0.005, w: -0.008 },
      // Recovery + early automation
      1983: { p: 0.035, w: 0.008 },
      1984: { p: 0.038, w: 0.010 },
      // NAFTA era
      1994: { p: 0.030, w: 0.003 },
      1995: { p: 0.032, w: 0.002 },
      // Late 90s tech in manufacturing
      1998: { p: 0.035, w: 0.006 },
      1999: { p: 0.038, w: 0.005 },
      // China shock begins
      2001: { p: 0.015, w: -0.002 },
      2002: { p: 0.020, w: -0.003 },
      // Great Recession
      2008: { p: 0.005, w: -0.010 },
      2009: { p: 0.015, w: -0.005 },
      2010: { p: 0.040, w: 0.008 },
      // Pandemic supply chain
      2020: { p: 0.010, w: 0.015 },
      2021: { p: 0.025, w: 0.008 },
      2022: { p: 0.018, w: -0.010 },
    }
  },

  retail: {
    // NAICS 44-45: Service sector, moderate tech adoption
    // POS systems, inventory management, but labor-intensive
    baseProductivityGrowth: 0.011,
    baseWageGrowth: 0.004,
    laborShareBaselines: {
      peakYear: 1978, peakLaborShare: 0.68,
      preDivergenceMean: 0.66, currentLaborShare: 0.58,
    },
    oecdComparison: { germany: 0.65, france: 0.62, sweden: 0.67, japan: 0.60, uk: 0.62 },
    eraOverrides: {
      // Walmart effect (90s efficiency gains)
      1993: { p: 0.018, w: 0.003 },
      1994: { p: 0.020, w: 0.003 },
      1995: { p: 0.018, w: 0.004 },
      // E-commerce begins
      1999: { p: 0.015, w: 0.005 },
      2000: { p: 0.016, w: 0.004 },
      // Great Recession
      2008: { p: 0.005, w: -0.005 },
      2009: { p: 0.008, w: 0.002 },
      // Self-checkout, automation push
      2015: { p: 0.015, w: 0.006 },
      2016: { p: 0.016, w: 0.007 },
      // Pandemic (essential workers, temp wage bumps)
      2020: { p: 0.008, w: 0.020 },
      2021: { p: 0.012, w: 0.010 },
      2022: { p: 0.006, w: -0.012 },
      2023: { p: 0.010, w: 0.005 },
    }
  },

  healthcare: {
    // NAICS 62: Baumol's cost disease poster child
    // Can't speed up a nurse checking on patients
    baseProductivityGrowth: 0.007,
    baseWageGrowth: 0.008,
    laborShareBaselines: {
      peakYear: 1980, peakLaborShare: 0.78,
      preDivergenceMean: 0.76, currentLaborShare: 0.70,
    },
    oecdComparison: { germany: 0.74, france: 0.72, sweden: 0.78, japan: 0.68, uk: 0.72 },
    eraOverrides: {
      // Medicare/Medicaid expansion era
      1985: { p: 0.009, w: 0.012 },
      1986: { p: 0.008, w: 0.011 },
      // HMO era (managed care)
      1995: { p: 0.010, w: 0.007 },
      1996: { p: 0.012, w: 0.006 },
      // ACA era
      2010: { p: 0.008, w: 0.010 },
      2011: { p: 0.009, w: 0.009 },
      // Great Recession (healthcare somewhat recession-proof)
      2008: { p: 0.006, w: 0.006 },
      2009: { p: 0.007, w: 0.008 },
      // Pandemic (burnout + demand surge)
      2020: { p: 0.004, w: 0.025 },
      2021: { p: 0.005, w: 0.015 },
      2022: { p: 0.006, w: 0.003 },
      // Post-pandemic staffing crisis
      2023: { p: 0.008, w: 0.012 },
      2024: { p: 0.007, w: 0.010 },
    }
  },

  finance: {
    // NAICS 52: Algorithmic trading, fintech, automation
    baseProductivityGrowth: 0.028,
    baseWageGrowth: 0.011,
    laborShareBaselines: {
      peakYear: 1975, peakLaborShare: 0.55,
      preDivergenceMean: 0.52, currentLaborShare: 0.38,
    },
    oecdComparison: { germany: 0.48, france: 0.45, sweden: 0.50, japan: 0.40, uk: 0.42 },
    eraOverrides: {
      // Deregulation era
      1986: { p: 0.035, w: 0.015 },
      1987: { p: 0.020, w: 0.008 }, // Black Monday
      // Derivatives + electronic trading
      1998: { p: 0.040, w: 0.018 },
      1999: { p: 0.042, w: 0.020 },
      // Great Recession (finance epicenter)
      2008: { p: -0.005, w: -0.015 },
      2009: { p: 0.010, w: -0.008 },
      2010: { p: 0.035, w: 0.015 },
      // Fintech era
      2015: { p: 0.035, w: 0.014 },
      2016: { p: 0.033, w: 0.013 },
      // Pandemic (markets boomed)
      2020: { p: 0.035, w: 0.018 },
      2021: { p: 0.038, w: 0.015 },
      2022: { p: 0.015, w: -0.005 },
    }
  },

  construction: {
    // NAICS 23: Notoriously flat productivity
    baseProductivityGrowth: 0.005,
    baseWageGrowth: 0.006,
    laborShareBaselines: {
      peakYear: 1976, peakLaborShare: 0.65,
      preDivergenceMean: 0.62, currentLaborShare: 0.58,
    },
    oecdComparison: { germany: 0.62, france: 0.60, sweden: 0.64, japan: 0.58, uk: 0.60 },
    eraOverrides: {
      // Building boom (80s)
      1984: { p: 0.012, w: 0.010 },
      1985: { p: 0.010, w: 0.009 },
      // Housing bubble
      2005: { p: 0.008, w: 0.012 },
      2006: { p: 0.007, w: 0.010 },
      // Housing crash
      2008: { p: -0.008, w: -0.010 },
      2009: { p: -0.005, w: -0.008 },
      2010: { p: 0.003, w: 0.002 },
      // Post-pandemic construction boom
      2020: { p: 0.003, w: 0.012 },
      2021: { p: 0.008, w: 0.015 },
      2022: { p: 0.006, w: 0.008 },
    }
  },

  education: {
    // NAICS 61: Another Baumol sector
    // Can't teach 2x students at same quality
    baseProductivityGrowth: 0.004,
    baseWageGrowth: 0.005,
    laborShareBaselines: {
      peakYear: 1975, peakLaborShare: 0.82,
      preDivergenceMean: 0.80, currentLaborShare: 0.75,
    },
    oecdComparison: { germany: 0.80, france: 0.78, sweden: 0.82, japan: 0.75, uk: 0.78 },
    eraOverrides: {
      // Ed-tech push (2010s)
      2012: { p: 0.008, w: 0.004 },
      2013: { p: 0.007, w: 0.004 },
      // Pandemic (forced remote)
      2020: { p: 0.010, w: 0.008 },
      2021: { p: 0.006, w: 0.005 },
      // Great Recession (state budget cuts)
      2008: { p: 0.003, w: -0.002 },
      2009: { p: 0.004, w: 0.001 },
    }
  },

  food_service: {
    // NAICS 72: Low automation, labor-intensive
    baseProductivityGrowth: 0.006,
    baseWageGrowth: 0.003,
    laborShareBaselines: {
      peakYear: 1979, peakLaborShare: 0.62,
      preDivergenceMean: 0.60, currentLaborShare: 0.52,
    },
    oecdComparison: { germany: 0.58, france: 0.55, sweden: 0.60, japan: 0.52, uk: 0.55 },
    eraOverrides: {
      // Fast food automation (90s)
      1995: { p: 0.010, w: 0.004 },
      1996: { p: 0.009, w: 0.003 },
      // Great Recession
      2008: { p: 0.002, w: -0.005 },
      2009: { p: 0.004, w: 0.001 },
      // Fight for $15 era
      2015: { p: 0.007, w: 0.008 },
      2016: { p: 0.008, w: 0.010 },
      // Pandemic (devastating, then recovery)
      2020: { p: -0.010, w: 0.015 },
      2021: { p: 0.012, w: 0.020 },
      2022: { p: 0.008, w: 0.005 },
      2023: { p: 0.007, w: 0.008 },
    }
  },

  professional_services: {
    // NAICS 54: Legal, accounting, consulting, engineering
    baseProductivityGrowth: 0.020,
    baseWageGrowth: 0.012,
    laborShareBaselines: {
      peakYear: 1978, peakLaborShare: 0.68,
      preDivergenceMean: 0.65, currentLaborShare: 0.58,
    },
    oecdComparison: { germany: 0.62, france: 0.60, sweden: 0.65, japan: 0.55, uk: 0.58 },
    eraOverrides: {
      // Computerization of offices
      1990: { p: 0.028, w: 0.014 },
      1991: { p: 0.025, w: 0.012 },
      // Internet enables global services
      1999: { p: 0.030, w: 0.016 },
      2000: { p: 0.028, w: 0.015 },
      // Great Recession
      2008: { p: 0.012, w: 0.005 },
      2009: { p: 0.015, w: 0.008 },
      // Remote work era
      2020: { p: 0.025, w: 0.015 },
      2021: { p: 0.028, w: 0.014 },
    }
  },

  transportation: {
    // NAICS 48-49: Logistics optimization, but labor-heavy last mile
    baseProductivityGrowth: 0.015,
    baseWageGrowth: 0.005,
    laborShareBaselines: {
      peakYear: 1977, peakLaborShare: 0.60,
      preDivergenceMean: 0.58, currentLaborShare: 0.50,
    },
    oecdComparison: { germany: 0.55, france: 0.52, sweden: 0.58, japan: 0.50, uk: 0.52 },
    eraOverrides: {
      // Deregulation (Staggers Act, airline deregulation)
      1980: { p: 0.020, w: 0.003 },
      1981: { p: 0.022, w: 0.002 },
      // GPS + logistics software
      2000: { p: 0.022, w: 0.008 },
      2001: { p: 0.018, w: 0.006 },
      // Great Recession (trade collapse)
      2008: { p: 0.005, w: -0.008 },
      2009: { p: 0.010, w: 0.002 },
      // E-commerce delivery boom
      2015: { p: 0.020, w: 0.007 },
      2016: { p: 0.022, w: 0.006 },
      // Pandemic (essential, supply chain chaos)
      2020: { p: 0.012, w: 0.018 },
      2021: { p: 0.018, w: 0.012 },
      2022: { p: 0.010, w: -0.005 },
    }
  },

  government: {
    // Public sector: constrained by budgets
    baseProductivityGrowth: 0.003,
    baseWageGrowth: 0.005,
    laborShareBaselines: {
      peakYear: 1975, peakLaborShare: 0.88,
      preDivergenceMean: 0.86, currentLaborShare: 0.82,
    },
    oecdComparison: { germany: 0.85, france: 0.84, sweden: 0.88, japan: 0.82, uk: 0.84 },
    eraOverrides: {
      // Reagan-era austerity
      1981: { p: 0.002, w: 0.002 },
      1982: { p: 0.001, w: 0.003 },
      // Great Recession (stimulus)
      2009: { p: 0.005, w: 0.008 },
      2010: { p: 0.004, w: 0.006 },
      // Sequestration
      2013: { p: 0.001, w: 0.002 },
      // Pandemic
      2020: { p: 0.005, w: 0.010 },
      2021: { p: 0.004, w: 0.008 },
    }
  }
};

// ============================================
// TIME SERIES GENERATOR
// ============================================

function generateTimeSeries(config) {
  const data = {};
  let prodIndex = 100.0;
  let wageIndex = 100.0;

  for (let year = 1975; year <= 2024; year++) {
    if (year === 1975) {
      data[year] = { productivity_index: 100.0, wage_index: 100.0 };
      continue;
    }

    const override = config.eraOverrides[year];
    const prodGrowth = override?.p ?? config.baseProductivityGrowth;
    const wageGrowth = override?.w ?? config.baseWageGrowth;

    prodIndex *= (1 + prodGrowth);
    wageIndex *= (1 + wageGrowth);

    data[year] = {
      productivity_index: Math.round(prodIndex * 10) / 10,
      wage_index: Math.round(wageIndex * 10) / 10
    };
  }

  return data;
}

// ============================================
// GENERATE ALL INDUSTRY DATA
// ============================================

const INDUSTRY_ECONOMIC_DATA = {};
for (const [sector, config] of Object.entries(SECTOR_CONFIGS)) {
  INDUSTRY_ECONOMIC_DATA[sector] = generateTimeSeries(config);
}

// ============================================
// SUB-INDUSTRY → SECTOR MAPPING
// ============================================
// Maps the 50+ detailed industry keys (from INDUSTRY_GAP_MODIFIERS
// in routes/econ.js) to their broad NAICS sector so that
// calculateWorthGap uses the right productivity curve.
// Unmapped industries fall back to national_average.

const INDUSTRY_SECTOR_MAP = {
  // Tech / Information (NAICS 51)
  'technology':                   'tech',
  'information':                  'tech',
  'publishing':                   'tech',
  'motion_picture_sound':         'tech',
  'broadcasting':                 'tech',
  'internet_publishing':          'tech',
  'telecommunications':           'tech',
  'data_processing_hosting':      'tech',
  'other_information_services':   'tech',

  // Manufacturing (NAICS 31-33)
  'manufacturing':                'manufacturing',
  'food_manufacturing':           'manufacturing',
  'beverage_tobacco_mfg':         'manufacturing',
  'textile_mills':                'manufacturing',
  'textile_product_mills':        'manufacturing',
  'apparel_manufacturing':        'manufacturing',
  'leather_mfg':                  'manufacturing',
  'wood_product_mfg':             'manufacturing',
  'paper_manufacturing':          'manufacturing',
  'printing_support':             'manufacturing',
  'petroleum_coal_mfg':           'manufacturing',
  'chemical_manufacturing':       'manufacturing',
  'plastics_rubber_mfg':          'manufacturing',
  'nonmetallic_mineral_mfg':      'manufacturing',
  'primary_metal_mfg':            'manufacturing',
  'fabricated_metal_mfg':         'manufacturing',
  'machinery_manufacturing':      'manufacturing',
  'computer_electronic_mfg':      'manufacturing',
  'electrical_equipment_mfg':     'manufacturing',
  'transportation_equip_mfg':     'manufacturing',
  'furniture_mfg':                'manufacturing',
  'miscellaneous_mfg':            'manufacturing',

  // Retail (NAICS 44-45)
  'retail':                       'retail',
  'motor_vehicle_dealers':        'retail',
  'furniture_home_stores':        'retail',
  'electronics_appliance_stores': 'retail',
  'building_material_stores':     'retail',
  'food_beverage_stores':         'retail',
  'health_personal_care_stores':  'retail',
  'gasoline_stations':            'retail',
  'clothing_stores':              'retail',
  'sporting_hobby_book_stores':   'retail',
  'general_merchandise_stores':   'retail',
  'miscellaneous_store_retailers':'retail',
  'nonstore_retailers':           'retail',

  // Healthcare (NAICS 62)
  'healthcare':                   'healthcare',
  'ambulatory_health_care':       'healthcare',
  'hospitals':                    'healthcare',
  'nursing_residential_care':     'healthcare',
  'social_assistance':            'healthcare',

  // Finance (NAICS 52 + 53)
  'finance':                      'finance',
  'monetary_authorities':         'finance',
  'credit_intermediation':        'finance',
  'securities_commodities':       'finance',
  'insurance_carriers':           'finance',
  'funds_trusts':                 'finance',
  'real_estate_rental':           'finance',
  'real_estate':                  'finance',
  'rental_leasing_services':      'finance',
  'lessors_intangible_assets':    'finance',

  // Construction (NAICS 23)
  'construction':                 'construction',
  'construction_buildings':       'construction',
  'heavy_civil_engineering':      'construction',
  'specialty_trade_contractors':  'construction',

  // Education (NAICS 61)
  'education':                    'education',

  // Food Service / Accommodation (NAICS 72)
  'accommodation_food':           'food_service',
  'accommodation':                'food_service',
  'food_service':                 'food_service',

  // Professional Services (NAICS 54-55)
  'professional_services':        'professional_services',
  'management_companies':         'professional_services',

  // Transportation (NAICS 48-49, 42)
  'transportation':               'transportation',
  'air_transportation':           'transportation',
  'rail_transportation':          'transportation',
  'water_transportation':         'transportation',
  'truck_transportation':         'transportation',
  'transit_ground_passenger':     'transportation',
  'pipeline_transportation':      'transportation',
  'scenic_sightseeing':           'transportation',
  'support_transportation':       'transportation',
  'postal_service':               'transportation',
  'couriers_messengers':          'transportation',
  'warehousing_storage':          'transportation',
  'wholesale_trade':              'transportation',
  'wholesale_durable':            'transportation',
  'wholesale_nondurable':         'transportation',
  'wholesale_electronic_markets': 'transportation',

  // Government
  'government':                   'government',

  // ── Consolidated dropdown keys (v2) ──────────────────────
  'agriculture_forestry':         'national_average',
  'mining_oil_gas':               'national_average',
  'utilities_energy':             'national_average',
  'construction_trades':          'construction',
  'food_beverage_mfg':            'manufacturing',
  'chemical_petroleum_mfg':       'manufacturing',
  'metals_machinery_mfg':         'manufacturing',
  'electronics_computer_mfg':     'manufacturing',
  'other_manufacturing':          'manufacturing',
  'wholesale_distribution':       'transportation',
  'retail_sales':                 'retail',
  'transportation_delivery':      'transportation',
  'tech_software':                'tech',
  'media_telecom':                'tech',
  'finance_banking':              'finance',
  'real_estate_property':         'finance',
  'professional_business':        'professional_services',
  'admin_support':                'national_average',
  'education_teaching':           'education',
  'healthcare_medical':           'healthcare',
  'social_services':              'healthcare',
  'hotels_restaurants':           'food_service',
  'arts_entertainment_sports':    'national_average',
  'personal_services':            'national_average',
  'government_public':            'government',
};

// Human-readable sector labels for messaging
const SECTOR_LABELS = {
  'tech':                   'the tech sector',
  'manufacturing':          'manufacturing',
  'retail':                 'retail',
  'healthcare':             'healthcare',
  'finance':                'finance and insurance',
  'construction':           'construction',
  'education':              'education',
  'food_service':           'food service and hospitality',
  'professional_services':  'professional services',
  'transportation':         'transportation and logistics',
  'government':             'the public sector',
  'national_average':       'all industries nationally',

  // Consolidated dropdown labels
  'agriculture_forestry':   'agriculture, forestry and fishing',
  'mining_oil_gas':         'mining, oil and gas',
  'utilities_energy':       'utilities',
  'construction_trades':    'construction and skilled trades',
  'food_beverage_mfg':      'food and beverage manufacturing',
  'chemical_petroleum_mfg': 'chemical, petroleum and plastics manufacturing',
  'metals_machinery_mfg':   'metals, machinery and equipment manufacturing',
  'electronics_computer_mfg':'electronics and computer manufacturing',
  'other_manufacturing':    'manufacturing',
  'wholesale_distribution': 'wholesale and distribution',
  'retail_sales':           'retail and sales',
  'transportation_delivery':'transportation, delivery and warehousing',
  'tech_software':          'tech, software and IT',
  'media_telecom':          'media, telecom and publishing',
  'finance_banking':        'finance, banking and insurance',
  'real_estate_property':   'real estate and property',
  'professional_business':  'professional and business services',
  'admin_support':          'administrative and support services',
  'education_teaching':     'education and teaching',
  'healthcare_medical':     'healthcare, hospitals and nursing',
  'social_services':        'social services and nonprofits',
  'hotels_restaurants':     'hotels, restaurants and food service',
  'arts_entertainment_sports':'arts, entertainment and sports',
  'personal_services':      'personal services, repair and home care',
  'government_public':      'government and public administration',
};

/**
 * Resolves a detailed industry key to its broad NAICS sector.
 * Returns the sector key if found, otherwise 'national_average'.
 *
 * @param {string|null|undefined} industry - Detailed industry key from frontend
 * @returns {{ sector: string, label: string, usedFallback: boolean }}
 */
function resolveIndustrySector(industry) {
  if (!industry) {
    return { sector: 'national_average', label: SECTOR_LABELS['national_average'], usedFallback: true };
  }

  const normalized = industry.toLowerCase().trim();

  // Direct match (industry key IS a sector key)
  if (INDUSTRY_ECONOMIC_DATA[normalized]) {
    return { sector: normalized, label: SECTOR_LABELS[normalized] || normalized, usedFallback: false };
  }

  // Map sub-industry to sector
  // Use the original key's label if available (e.g., 'agriculture_forestry'
  // maps to national_average data but should still say "agriculture")
  const mappedSector = INDUSTRY_SECTOR_MAP[normalized];
  if (mappedSector && INDUSTRY_ECONOMIC_DATA[mappedSector]) {
    const label = SECTOR_LABELS[normalized] || SECTOR_LABELS[mappedSector] || mappedSector;
    return { sector: mappedSector, label, usedFallback: false };
  }

  // Fallback
  return { sector: 'national_average', label: SECTOR_LABELS['national_average'], usedFallback: true };
}

/**
 * Fix 7: Calculate multiple labor share baselines for a sector
 * Shows workers what they'd earn under different historical benchmarks
 *
 * @param {string} sector - Broad NAICS sector key
 * @param {number} currentAnnualWage - Worker's current annual compensation
 * @returns {Object} { scenarios: Array, oecdComparison: Object|null }
 */
function calculateMultipleBaselines(sector, currentAnnualWage) {
  const config = SECTOR_CONFIGS[sector] || SECTOR_CONFIGS['national_average'];
  const baselines = config.laborShareBaselines;
  const sectorLabel = SECTOR_LABELS[sector] || sector;

  if (!baselines) {
    return { scenarios: [], oecdComparison: null };
  }

  // Avoid division by zero
  const currentShare = baselines.currentLaborShare || 0.56;

  return {
    scenarios: [
      {
        label: `Peak labor share (${baselines.peakYear})`,
        laborShare: baselines.peakLaborShare,
        impliedAnnualWage: Math.round(currentAnnualWage * (baselines.peakLaborShare / currentShare)),
        difference: Math.round(currentAnnualWage * ((baselines.peakLaborShare / currentShare) - 1)),
        context: `In ${baselines.peakYear}, workers in ${sectorLabel} received ${(baselines.peakLaborShare * 100).toFixed(0)}% of value added as compensation.`
      },
      {
        label: 'Pre-divergence average (1947-1979)',
        laborShare: baselines.preDivergenceMean,
        impliedAnnualWage: Math.round(currentAnnualWage * (baselines.preDivergenceMean / currentShare)),
        difference: Math.round(currentAnnualWage * ((baselines.preDivergenceMean / currentShare) - 1)),
        context: `Before the productivity-pay divergence, workers in ${sectorLabel} averaged ${(baselines.preDivergenceMean * 100).toFixed(0)}% of value added.`
      },
      {
        label: 'Current labor share',
        laborShare: currentShare,
        impliedAnnualWage: currentAnnualWage,
        difference: 0,
        context: `Today, workers in ${sectorLabel} receive ${(currentShare * 100).toFixed(0)}% of value added.`
      }
    ],
    oecdComparison: config.oecdComparison || null,
    sectorLabel
  };
}

module.exports = {
  INDUSTRY_ECONOMIC_DATA,
  INDUSTRY_SECTOR_MAP,
  SECTOR_LABELS,
  SECTOR_CONFIGS,
  resolveIndustrySector,
  calculateMultipleBaselines
};
