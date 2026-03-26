/**
 * RUPTURA — Data API Routes
 * ===========================
 * Public data endpoints for economic indicators and housing data:
 *   /api/map-data
 *   /api/economic-data/cpi
 *   /api/economic-data/yearly
 *   /api/rent-data/hud/:zipCode
 *   /api/rent-data/hud/state/:stateCode
 */

const express = require('express');
const router = express.Router();

module.exports = function createDataRouter({ db, fetchCPIData, fetchHUDRentData, fetchHUDStateData, YEARLY_ECONOMIC_DATA, STATE_META }) {

  // GET /api/map-data — Corporate ownership data by state
  router.get('/api/map-data', (req, res) => {
    res.json(STATE_META);
  });

  // GET /api/economic-data/cpi — CPI inflation data (BLS API with local fallback)
  router.get('/api/economic-data/cpi', async (req, res) => {
    const { startYear, endYear } = req.query;
    const start = parseInt(startYear) || 1975;
    const end = parseInt(endYear) || new Date().getFullYear();

    try {
      const cpiData = await fetchCPIData(start, end);

      if (cpiData) {
        res.json({ source: 'BLS_API', data: cpiData });
      } else {
        const localData = {};
        for (let year = start; year <= end; year++) {
          if (YEARLY_ECONOMIC_DATA[year]) {
            localData[year] = YEARLY_ECONOMIC_DATA[year].cpi_inflation;
          }
        }
        res.json({ source: 'LOCAL_FALLBACK', data: localData });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/economic-data/yearly — Yearly economic indicators (local)
  router.get('/api/economic-data/yearly', (req, res) => {
    const { startYear, endYear } = req.query;
    const start = parseInt(startYear) || 1975;
    const end = parseInt(endYear) || new Date().getFullYear();

    const data = {};
    for (let year = start; year <= end; year++) {
      if (YEARLY_ECONOMIC_DATA[year]) {
        data[year] = YEARLY_ECONOMIC_DATA[year];
      }
    }

    res.json({ source: 'LOCAL', data });
  });

  // GET /api/rent-data/hud/:zipCode — HUD Fair Market Rent by ZIP
  router.get('/api/rent-data/hud/:zipCode', async (req, res) => {
    const { zipCode } = req.params;

    try {
      const hudData = await fetchHUDRentData(zipCode);

      if (hudData) {
        res.json({ source: 'HUD_API', data: hudData });
      } else {
        let localData = db.prepare('SELECT * FROM local_data WHERE zip_code = ?').get(zipCode);
        if (!localData) {
          localData = db.prepare('SELECT * FROM local_data WHERE zip_code = ?').get('default');
        }
        res.json({
          source: 'LOCAL_FALLBACK',
          data: {
            rent_2br: localData.rent,
            area_name: localData.area,
          }
        });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/rent-data/hud/state/:stateCode — HUD state-wide FMR data
  router.get('/api/rent-data/hud/state/:stateCode', async (req, res) => {
    const { stateCode } = req.params;

    try {
      const hudData = await fetchHUDStateData(stateCode);

      if (hudData) {
        res.json({ source: 'HUD_API', data: hudData });
      } else {
        res.json({ source: 'NO_DATA', data: null });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
