/**
 * RUPTURA - Source Registry
 * ==========================
 * Machine-readable registry of every data source, series ID, vintage,
 * and limitation used in calculations. Provides full traceability
 * for all coefficients and data points.
 *
 * Every entry documents: what data, where from, which series,
 * what year, what population, how transformed, and known limitations.
 */

const SOURCE_REGISTRY = {
  bea_rpp_state: {
    id: 'bea_rpp_state',
    name: 'Regional Price Parities by State',
    series: 'SARPP',
    agency: 'Bureau of Economic Analysis',
    url: 'https://apps.bea.gov/iTable/?reqid=70&step=1&acrdn=8',
    vintage: '2022',
    population: 'All 50 states + DC',
    transformation: 'RPP index relative to national average (national = 100)',
    limitations: 'Published with 2-year lag; does not capture within-state variation',
    usedIn: ['calculateMarketMedian']
  },

  bea_rpp_metro: {
    id: 'bea_rpp_metro',
    name: 'Regional Price Parities by Metropolitan Statistical Area',
    series: 'MARPP',
    agency: 'Bureau of Economic Analysis',
    url: 'https://apps.bea.gov/iTable/?reqid=70&step=1&acrdn=8',
    vintage: '2022',
    population: 'All MSAs with population > 50,000',
    transformation: 'RPP index relative to national average (national = 100)',
    limitations: 'Published with 2-year lag; does not capture sub-MSA variation; commuter effects partially addressed by measuring prices not output',
    usedIn: ['calculateMarketMedian']
  },

  bea_gdp_by_industry: {
    id: 'bea_gdp_by_industry',
    name: 'Value Added by Industry (GDP-by-Industry)',
    series: 'GDPbyIndustry',
    agency: 'Bureau of Economic Analysis',
    url: 'https://apps.bea.gov/iTable/?reqid=51&step=1',
    vintage: '2023',
    population: 'All private industries by NAICS sector',
    transformation: 'Value added = gross output - intermediate inputs. Decomposed into: compensation of employees, taxes on production, depreciation (CFC), net operating surplus',
    limitations: 'Includes imputed owner-occupied housing (~8% of GDP with no corresponding compensation); FISIM complicates finance sector',
    usedIn: ['gapDecomposition', 'laborShareBaselines']
  },

  bea_sagdp: {
    id: 'bea_sagdp',
    name: 'GDP by State and Industry',
    series: 'SAGDP',
    agency: 'Bureau of Economic Analysis',
    url: 'https://apps.bea.gov/iTable/?reqid=70&step=1&acrdn=2',
    vintage: '2023',
    population: 'All 50 states by NAICS sector',
    transformation: 'Value added per FTE = state industry value added / state industry FTE employees',
    limitations: 'State-level only (not MSA); NAICS classification changes can break time-series comparability',
    usedIn: ['calculateMarketMedian']
  },

  bls_oews: {
    id: 'bls_oews',
    name: 'Occupational Employment and Wage Statistics',
    series: 'OEWS',
    agency: 'Bureau of Labor Statistics',
    url: 'https://www.bls.gov/oes/',
    vintage: '2023',
    population: 'All nonfarm establishments; 830+ occupations by SOC code',
    transformation: 'Percentile wages (10th, 25th, 50th, 75th, 90th) by occupation within industry. Mean wage computed across all occupations in industry for normalization.',
    limitations: 'Does not cover self-employed; surveys establishments not households; hourly wages may exclude tips/commissions for some occupations',
    usedIn: ['getOccupationAdjustment', 'calculateMarketMedian']
  },

  bls_ecec: {
    id: 'bls_ecec',
    name: 'Employer Costs for Employee Compensation',
    series: 'CMU',
    agency: 'Bureau of Labor Statistics',
    url: 'https://www.bls.gov/ncs/ect/',
    vintage: '2024',
    population: 'Private industry workers by NAICS, wage quintile, establishment size, union status',
    transformation: 'Benefits multiplier = total compensation / wages and salaries. Stratified by industry and wage tier (low/mid/high).',
    limitations: 'Published quarterly; establishment-level not individual; part-time workers may be underrepresented in benefits data',
    usedIn: ['getBenefitsMultiplier']
  },

  bls_cpi_u_rs: {
    id: 'bls_cpi_u_rs',
    name: 'CPI-U-RS (Research Series Using Current Methods)',
    series: 'CPI-U-RS',
    agency: 'Bureau of Labor Statistics',
    url: 'https://www.bls.gov/cpi/research-series/r-cpi-u-rs-home.htm',
    vintage: '2024',
    population: 'All Urban Consumers, retroactively adjusted for methodology changes',
    transformation: 'Deflator index with 2024 = 1.000. Used for converting nominal career totals to constant 2024 dollars.',
    limitations: 'CPI measures consumer prices, not output prices; using same deflator for both sides of gap avoids deflator-mismatch bias (Feldstein 2008)',
    usedIn: ['deflateToBaseYear', 'deflateCareerSeries']
  },

  bls_cpi_u: {
    id: 'bls_cpi_u',
    name: 'Consumer Price Index for All Urban Consumers',
    series: 'CUUR0000SA0',
    agency: 'Bureau of Labor Statistics',
    url: 'https://www.bls.gov/cpi/',
    vintage: 'live',
    population: 'All urban consumers, U.S. city average',
    transformation: 'Year-over-year percentage change for inflation adjustment',
    limitations: 'Annual average; does not capture intra-year volatility',
    usedIn: ['fetchCPIData']
  },

  epi_productivity_pay: {
    id: 'epi_productivity_pay',
    name: 'Productivity-Pay Gap',
    series: null,
    agency: 'Economic Policy Institute',
    url: 'https://www.epi.org/productivity-pay-gap/',
    vintage: '2024',
    population: 'Nonfarm business sector, production/nonsupervisory workers',
    transformation: 'Cumulative growth indices (1979 = 100) for productivity (output per hour) and typical worker compensation',
    limitations: 'Uses CPI-U-RS for compensation deflation and GDP deflator for productivity; this deflator mismatch explains ~15-20% of the measured gap (Pessoa and Van Reenen 2013)',
    usedIn: ['YEARLY_ECONOMIC_DATA', 'calculateWorthGap']
  },

  bea_nipa_labor_share: {
    id: 'bea_nipa_labor_share',
    name: 'Labor Share of Income (NIPA Tables 1.12, 6.2D)',
    series: 'NIPA',
    agency: 'Bureau of Economic Analysis',
    url: 'https://apps.bea.gov/iTable/?reqid=19&step=2',
    vintage: '2023',
    population: 'All industries, compensation of employees as share of gross value added',
    transformation: 'Peak year, pre-divergence mean (1947-1979), and current share computed by industry',
    limitations: 'Proprietors income (~$1.8T/yr) contains both labor and capital returns that BEA cannot separate; imputation method choice explains ~1/3 of published decline (Elsby et al. 2013)',
    usedIn: ['laborShareBaselines', 'calculateMultipleBaselines']
  },

  bls_employee_tenure: {
    id: 'bls_employee_tenure',
    name: 'Employee Tenure Summary',
    series: null,
    agency: 'Bureau of Labor Statistics',
    url: 'https://www.bls.gov/news.release/tenure.nr0.htm',
    vintage: '2024',
    population: 'Wage and salary workers 16+, by industry and occupation',
    transformation: 'Median tenure in years by industry used for experience multiplier normalization (industry average = 1.0)',
    limitations: 'Biennial survey; measures tenure at current employer, not total career experience in industry',
    usedIn: ['calculateNormalizedExperienceMultiplier']
  },

  hud_fmr: {
    id: 'hud_fmr',
    name: 'Fair Market Rents',
    series: 'FMR',
    agency: 'Department of Housing and Urban Development',
    url: 'https://www.huduser.gov/portal/datasets/fmr.html',
    vintage: 'live',
    population: 'All ZIP codes, by bedroom count',
    transformation: 'Annual fair market rent for 40th percentile of standard-quality rental units',
    limitations: 'Represents 40th percentile, not median; updated annually with lag',
    usedIn: ['fetchHUDRentData']
  },

  fred_labor_share: {
    id: 'fred_labor_share',
    name: 'Nonfarm Business Sector Labor Share',
    series: 'PRS85006173',
    agency: 'Federal Reserve Bank of St. Louis (FRED)',
    url: 'https://fred.stlouisfed.org/series/PRS85006173',
    vintage: '2024',
    population: 'Nonfarm business sector',
    transformation: 'Index, 2017=100',
    limitations: 'Aggregate measure; does not decompose by industry',
    usedIn: ['laborShareBaselines']
  },

  mincer_coefficients: {
    id: 'mincer_coefficients',
    name: 'Experience-Earnings Profile (Mincer Equation)',
    series: null,
    agency: 'Academic literature',
    url: 'https://doi.org/10.1086/260293',
    vintage: '1974 (original); 2006 (Heckman et al. critique)',
    population: 'U.S. male workers (original); extended to all workers in subsequent literature',
    transformation: 'Logarithmic growth factor 0.10 applied to ln(experience+1), normalized so industry median experience = 1.0',
    limitations: 'Original Mincer equation models EARNINGS, not PRODUCTIVITY; linearity in schooling and separability rejected by Heckman, Lochner, and Todd (2006) for post-1960 data; used as relative adjustment within industry, not absolute productivity measure',
    usedIn: ['calculateNormalizedExperienceMultiplier']
  },

  industry_gap_modifiers: {
    id: 'industry_gap_modifiers',
    name: 'Industry-Specific Productivity Gap Modifiers',
    series: null,
    agency: 'Derived from BLS Industry Productivity studies + EPI sector analyses',
    url: 'https://www.bls.gov/lpc/',
    vintage: '2024',
    population: '85+ NAICS industry codes',
    transformation: 'Modifiers 0.75-1.40 reflecting how much the national productivity-wage gap applies to each sector. Values > 1 = gap hits harder; < 1 = gap is narrower.',
    limitations: 'Weighted averages of sub-industry data; some modifiers are estimates where granular BLS data unavailable',
    usedIn: ['impact-calculator']
  }
};

/**
 * Get citation text for a source
 * @param {string} sourceId - Key from SOURCE_REGISTRY
 * @returns {Object} { name, agency, series, vintage, url }
 */
function getSourceCitation(sourceId) {
  const source = SOURCE_REGISTRY[sourceId];
  if (!source) return null;
  return {
    name: source.name,
    agency: source.agency,
    series: source.series,
    vintage: source.vintage,
    url: source.url
  };
}

/**
 * Get all sources used by a specific function
 * @param {string} functionName
 * @returns {Array} Citations for all sources that function depends on
 */
function getSourcesForFunction(functionName) {
  return Object.values(SOURCE_REGISTRY)
    .filter(s => s.usedIn && s.usedIn.includes(functionName))
    .map(s => getSourceCitation(s.id));
}

/**
 * Build data provenance array for API response
 * Accepts either plain source ID strings or { sourceId, appliedTo } objects
 * @param {Array<string|{sourceId: string, appliedTo: string}>} usages
 * @returns {Array} Provenance entries
 */
function buildDataProvenance(usages) {
  return usages
    .map(usage => {
      const sourceId = typeof usage === 'string' ? usage : usage.sourceId;
      const appliedTo = typeof usage === 'string' ? null : usage.appliedTo;
      const source = SOURCE_REGISTRY[sourceId];
      if (!source) return null;
      return {
        sourceId,
        name: source.name,
        agency: source.agency,
        series: source.series,
        vintage: source.vintage,
        url: source.url,
        limitations: source.limitations,
        ...(appliedTo && { appliedTo })
      };
    })
    .filter(Boolean);
}

module.exports = {
  SOURCE_REGISTRY,
  getSourceCitation,
  getSourcesForFunction,
  buildDataProvenance
};
