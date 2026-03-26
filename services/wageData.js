/**
 * Shared wage data — used by server.js and calculationService.js
 * Source: Bureau of Labor Statistics (BLS) Occupational Employment and Wage Statistics
 */

const MSA_WAGE_DATA = {
  'New York-Newark-Jersey City, NY-NJ-PA': 26.48,
  'Los Angeles-Long Beach-Anaheim, CA': 24.12,
  'Chicago-Naperville-Elgin, IL-IN-WI': 23.67,
  'Dallas-Fort Worth-Arlington, TX': 22.34,
  'Houston-The Woodlands-Sugar Land, TX': 22.89,
  'Washington-Arlington-Alexandria, DC-VA-MD-WV': 28.45,
  'San Francisco-Oakland-Berkeley, CA': 31.45,
  'Boston-Cambridge-Newton, MA-NH': 27.89,
  'Seattle-Tacoma-Bellevue, WA': 28.67,
  'San Jose-Sunnyvale-Santa Clara, CA': 35.67,
  'default': 22.45
};

const STATE_WAGE_DATA = {
  'AL': 20.23, 'AK': 26.41, 'AZ': 23.08, 'AR': 19.66, 'CA': 27.88,
  'CO': 27.12, 'CT': 27.45, 'DE': 25.38, 'FL': 22.12, 'GA': 22.18,
  'HI': 24.89, 'ID': 21.58, 'IL': 25.12, 'IN': 22.06, 'IA': 21.97,
  'KS': 21.68, 'KY': 21.32, 'LA': 20.34, 'ME': 22.64, 'MD': 27.02,
  'MA': 29.32, 'MI': 23.54, 'MN': 25.98, 'MS': 19.32, 'MO': 22.21,
  'MT': 21.48, 'NE': 22.11, 'NV': 22.34, 'NH': 24.85, 'NJ': 27.36,
  'NM': 21.12, 'NY': 27.58, 'NC': 22.06, 'ND': 24.12, 'OH': 22.76,
  'OK': 21.04, 'OR': 25.34, 'PA': 24.02, 'RI': 25.01, 'SC': 21.24,
  'SD': 20.87, 'TN': 21.45, 'TX': 22.67, 'UT': 23.12, 'VT': 22.98,
  'VA': 25.67, 'WA': 27.89, 'WV': 19.87, 'WI': 22.89, 'WY': 22.34,
  'default': 22.45
};

module.exports = { MSA_WAGE_DATA, STATE_WAGE_DATA };
