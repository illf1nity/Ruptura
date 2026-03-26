/**
 * RUPTURA — Legacy Solidarity Net Routes
 * ========================================
 * Endpoints from the original Solidarity Net platform:
 *   /api/price-resistance
 *   /api/sentiment
 *   /api/buildings
 *   /api/worker-collectives
 *   /api/consumer-groups
 *   /api/petitions
 *   /api/reports
 *
 * These are preserved for backward compatibility but are not
 * used by the current Ruptura Economic Experience (econ.html).
 */

const express = require('express');
const router = express.Router();

module.exports = function createLegacyRouter({ db, timeAgo, fetchChangeOrgData, isValidChangeOrgUrl, isValidTelegramUrl }) {

  // ============================================
  // PRICE RESISTANCE
  // ============================================

  router.get('/api/price-resistance', (req, res) => {
    const items = db.prepare('SELECT * FROM price_resistance').all();
    res.json(items.map(item => ({
      id: item.id,
      item: item.item,
      current: item.current_price,
      resistance: item.resistance_price,
      votes: item.votes,
      atResistance: item.at_resistance,
    })));
  });

  router.post('/api/price-resistance/:id/vote', (req, res) => {
    const { id } = req.params;
    const { threshold } = req.body;
    if (threshold == null) {
      return res.status(400).json({ error: 'threshold is required' });
    }
    const item = db.prepare('SELECT * FROM price_resistance WHERE id = ?').get(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    db.prepare('UPDATE price_resistance SET votes = votes + 1 WHERE id = ?').run(id);
    res.json({ success: true });
  });

  // ============================================
  // SENTIMENT
  // ============================================

  router.get('/api/sentiment', (req, res) => {
    const history = db.prepare('SELECT * FROM sentiment_history ORDER BY id').all();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const willing = db.prepare(
      "SELECT COUNT(*) as count FROM sentiment_votes WHERE vote = 'yes' AND created_at >= ?"
    ).get(todayStart.toISOString()).count;
    const unwilling = db.prepare(
      "SELECT COUNT(*) as count FROM sentiment_votes WHERE vote = 'no' AND created_at >= ?"
    ).get(todayStart.toISOString()).count;
    const total = willing + unwilling;

    res.json({
      today: { willing, unwilling, total },
      history: history.map(h => ({
        week: h.week,
        willing: h.willing,
        unwilling: h.unwilling,
        total: h.total,
      })),
    });
  });

  router.post('/api/sentiment/vote', (req, res) => {
    const { vote, fingerprint } = req.body;
    if (!vote || !['yes', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'vote must be "yes" or "no"' });
    }

    if (fingerprint) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const existing = db.prepare(
        'SELECT id FROM sentiment_votes WHERE fingerprint = ? AND created_at >= ?'
      ).get(fingerprint, todayStart.toISOString());
      if (existing) {
        return res.status(409).json({ error: 'Already voted today' });
      }
    }

    db.prepare('INSERT INTO sentiment_votes (vote, fingerprint) VALUES (?, ?)').run(vote, fingerprint || null);
    res.json({ success: true });
  });

  // ============================================
  // BUILDINGS / TENANTS
  // ============================================

  router.get('/api/buildings/:zipCode', (req, res) => {
    const { zipCode } = req.params;
    let buildings = db.prepare('SELECT * FROM buildings WHERE zip_code = ?').all(zipCode);
    if (buildings.length === 0) {
      buildings = db.prepare('SELECT * FROM buildings WHERE zip_code = ?').all('default');
    }
    res.json(buildings.map(b => ({
      id: b.id,
      address: b.address,
      units: b.units,
      members: b.members,
      landlord: b.landlord,
      issues: JSON.parse(b.issues),
    })));
  });

  router.post('/api/buildings/:id/join', (req, res) => {
    const { id } = req.params;
    const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(id);
    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }
    db.prepare('UPDATE buildings SET members = members + 1 WHERE id = ?').run(id);
    res.json({ success: true });
  });

  router.get('/api/buildings/:id/messages', (req, res) => {
    const { id } = req.params;
    const messages = db.prepare(
      'SELECT * FROM tenant_messages WHERE building_id = ? ORDER BY pinned DESC, created_at DESC'
    ).all(id);
    res.json(messages.map(m => ({
      id: m.id,
      building: m.building_id,
      text: m.text,
      author: m.author,
      pinned: m.pinned === 1,
      replies: m.replies,
      time: timeAgo(m.created_at),
    })));
  });

  router.post('/api/buildings/:id/messages', (req, res) => {
    const { id } = req.params;
    const { text, author } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }
    const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(id);
    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }
    const result = db.prepare(
      'INSERT INTO tenant_messages (building_id, text, author) VALUES (?, ?, ?)'
    ).run(id, text, author || 'Anonymous');
    res.json({
      id: result.lastInsertRowid,
      building: id,
      text,
      author: author || 'Anonymous',
      pinned: false,
      replies: 0,
      time: 'Just now',
    });
  });

  // ============================================
  // WORKER COLLECTIVES
  // ============================================

  router.get('/api/worker-collectives', (req, res) => {
    const collectives = db.prepare('SELECT * FROM worker_collectives ORDER BY members DESC').all();
    res.json(collectives.map(c => ({
      id: c.id,
      industry: c.industry,
      company: c.company,
      members: c.members,
      issues: JSON.parse(c.issues),
      active: c.active === 1,
      telegram_url: c.telegram_url || '',
    })));
  });

  router.post('/api/worker-collectives', (req, res) => {
    const { company, industry, issues, telegram_url } = req.body;
    if (!company || !industry) {
      return res.status(400).json({ error: 'company and industry are required' });
    }
    if (telegram_url && !isValidTelegramUrl(telegram_url)) {
      return res.status(400).json({ error: 'Invalid Telegram URL. Must be a t.me or telegram.me link' });
    }
    const id = `w${Date.now()}`;
    db.prepare(
      'INSERT INTO worker_collectives (id, industry, company, members, issues, active, telegram_url) VALUES (?, ?, ?, 1, ?, 0, ?)'
    ).run(id, industry, company, JSON.stringify(issues || []), telegram_url || '');
    res.json({
      id,
      industry,
      company,
      members: 1,
      issues: issues || [],
      active: false,
      telegram_url: telegram_url || '',
    });
  });

  router.post('/api/worker-collectives/:id/join', (req, res) => {
    const { id } = req.params;
    const collective = db.prepare('SELECT * FROM worker_collectives WHERE id = ?').get(id);
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }
    db.prepare('UPDATE worker_collectives SET members = members + 1 WHERE id = ?').run(id);
    res.json({ success: true });
  });

  router.get('/api/worker-collectives/:id/messages', (req, res) => {
    const { id } = req.params;
    const messages = db.prepare(
      'SELECT * FROM collective_messages WHERE collective_id = ? ORDER BY pinned DESC, created_at DESC'
    ).all(id);
    res.json(messages.map(m => ({
      id: m.id,
      collective: m.collective_id,
      text: m.text,
      author: m.author,
      pinned: m.pinned === 1,
      replies: m.replies,
      time: timeAgo(m.created_at),
    })));
  });

  router.post('/api/worker-collectives/:id/messages', (req, res) => {
    const { id } = req.params;
    const { text, author } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }
    const collective = db.prepare('SELECT * FROM worker_collectives WHERE id = ?').get(id);
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }
    const result = db.prepare(
      'INSERT INTO collective_messages (collective_id, text, author) VALUES (?, ?, ?)'
    ).run(id, text, author || 'Anonymous');
    res.json({
      id: result.lastInsertRowid,
      collective: id,
      text,
      author: author || 'Anonymous',
      pinned: false,
      replies: 0,
      time: 'Just now',
    });
  });

  // ============================================
  // CONSUMER GROUPS
  // ============================================

  router.get('/api/consumer-groups', (req, res) => {
    const groups = db.prepare('SELECT * FROM consumer_groups ORDER BY members DESC').all();
    res.json(groups.map(g => ({
      id: g.id,
      name: g.name,
      members: g.members,
      target: g.target,
      savings: g.savings,
      description: g.description,
    })));
  });

  router.post('/api/consumer-groups/:id/join', (req, res) => {
    const { id } = req.params;
    const group = db.prepare('SELECT * FROM consumer_groups WHERE id = ?').get(id);
    if (!group) {
      return res.status(404).json({ error: 'Consumer group not found' });
    }
    db.prepare('UPDATE consumer_groups SET members = members + 1 WHERE id = ?').run(id);
    res.json({ success: true });
  });

  // ============================================
  // PETITIONS
  // ============================================

  router.get('/api/petitions', (req, res) => {
    const petitions = db.prepare('SELECT * FROM petitions ORDER BY created_at DESC').all();
    res.json(petitions.map(p => ({
      id: p.id,
      title: p.title,
      area: p.area,
      description: p.description,
      changeorg_url: p.changeorg_url,
      signatures: p.signatures,
      goal: p.goal,
      status: p.status,
      created: timeAgo(p.created_at),
    })));
  });

  router.post('/api/petitions', async (req, res) => {
    const { title, area, description, changeorg_url } = req.body;
    if (!title || !area || !changeorg_url) {
      return res.status(400).json({ error: 'title, area, and changeorg_url are required' });
    }
    if (!isValidChangeOrgUrl(changeorg_url)) {
      return res.status(400).json({ error: 'A valid Change.org URL is required' });
    }

    let signatures = 0;
    let goal = 100;
    try {
      const data = await fetchChangeOrgData(changeorg_url);
      if (data.signatures !== null) signatures = data.signatures;
      if (data.goal !== null) goal = data.goal;
    } catch {
      // Could not reach Change.org — use defaults
    }

    const id = `p${Date.now()}`;
    db.prepare(
      'INSERT INTO petitions (id, title, area, description, changeorg_url, signatures, goal, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, title, area, description || '', changeorg_url, signatures, goal, 'active');
    res.json({
      id,
      title,
      area,
      description: description || '',
      changeorg_url,
      signatures,
      goal,
      status: 'active',
      created: 'Just now',
    });
  });

  router.post('/api/petitions/:id/refresh', async (req, res) => {
    const { id } = req.params;
    const petition = db.prepare('SELECT * FROM petitions WHERE id = ?').get(id);
    if (!petition) {
      return res.status(404).json({ error: 'Petition not found' });
    }
    if (!petition.changeorg_url) {
      return res.status(400).json({ error: 'No Change.org URL linked' });
    }

    try {
      const data = await fetchChangeOrgData(petition.changeorg_url);
      const newSigs = data.signatures !== null ? data.signatures : petition.signatures;
      const newGoal = data.goal !== null ? data.goal : petition.goal;
      const newStatus = newSigs >= newGoal ? 'won' : petition.status;
      db.prepare('UPDATE petitions SET signatures = ?, goal = ?, status = ? WHERE id = ?')
        .run(newSigs, newGoal, newStatus, id);
      res.json({ success: true, signatures: newSigs, goal: newGoal, status: newStatus });
    } catch {
      res.json({ success: false, signatures: petition.signatures, goal: petition.goal, status: petition.status });
    }
  });

  // ============================================
  // REPORTS
  // ============================================

  router.get('/api/reports', (req, res) => {
    const { type } = req.query;
    let reports;
    if (type && type !== 'all') {
      reports = db.prepare('SELECT * FROM reports WHERE type = ? ORDER BY last_report DESC').all(type);
    } else {
      reports = db.prepare('SELECT * FROM reports ORDER BY last_report DESC').all();
    }
    res.json(reports.map(r => ({
      id: r.id,
      type: r.type,
      name: r.name,
      address: r.address,
      issues: JSON.parse(r.issues),
      reports: r.report_count,
      lastReport: timeAgo(r.last_report),
    })));
  });

  router.post('/api/reports', (req, res) => {
    const { type, name, address, issues, description } = req.body;
    if (!type || !name || !issues || issues.length === 0) {
      return res.status(400).json({ error: 'type, name, and at least one issue are required' });
    }

    const existing = db.prepare(
      'SELECT * FROM reports WHERE LOWER(name) = LOWER(?) AND type = ?'
    ).get(name, type);

    if (existing) {
      db.prepare(
        'UPDATE reports SET report_count = report_count + 1, last_report = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(existing.id);
      return res.json({
        id: existing.id,
        type: existing.type,
        name: existing.name,
        address: existing.address,
        issues: JSON.parse(existing.issues),
        reports: existing.report_count + 1,
        lastReport: 'Just now',
        merged: true,
      });
    }

    const id = `r${Date.now()}`;
    db.prepare(
      'INSERT INTO reports (id, type, name, address, issues, report_count) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(id, type, name, address || null, JSON.stringify(issues));
    res.json({
      id,
      type,
      name,
      address: address || null,
      issues,
      reports: 1,
      lastReport: 'Just now',
      merged: false,
    });
  });

  return router;
};
