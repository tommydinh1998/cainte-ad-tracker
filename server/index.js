const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

const isLocalDB = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !isLocalDB ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS batches (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      link TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      submitted_by TEXT DEFAULT '',
      creator_handle TEXT DEFAULT '',
      submitted_date TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ads (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
      ad_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      issue_note TEXT DEFAULT '',
      assigned_to TEXT DEFAULT '',
      spark_code TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );
    -- ── Influencer Tracker ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS creators (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      profile_link TEXT DEFAULT '',
      platform TEXT DEFAULT 'Meta',
      rating INTEGER DEFAULT 0,
      rating_tags JSONB DEFAULT '[]',
      rating_note TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS collaborations (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER REFERENCES creators(id) ON DELETE CASCADE,
      type TEXT DEFAULT 'Gifting',
      status TEXT DEFAULT 'upcoming',
      deliverables JSONB DEFAULT '[]',
      products JSONB DEFAULT '[]',
      product_count INTEGER DEFAULT 0,
      total_value NUMERIC DEFAULT 0,
      responsible TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sourcing (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      profile_link TEXT DEFAULT '',
      platform TEXT DEFAULT 'Meta',
      comment TEXT DEFAULT '',
      added_by TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      collab_id INTEGER REFERENCES collaborations(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mimetype TEXT DEFAULT 'application/octet-stream',
      size INTEGER DEFAULT 0,
      data BYTEA,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Add spark_code column if it doesn't exist (migration)
  await pool.query(`
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS spark_code TEXT DEFAULT '';
  `);
  // Reply threads on flagged ad issues.
  // Keyed by ads.ad_id (e.g. '#0368') — NOT ads.id — because PUT /api/batches/:id
  // deletes and re-inserts ad rows with new primary keys on every batch edit,
  // while the display ad_id is preserved. This keeps comments attached.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ad_comments (
      id SERIAL PRIMARY KEY,
      ad_ref TEXT NOT NULL,
      author TEXT DEFAULT 'CAINTE',
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ad_comments_ad_ref_idx ON ad_comments (ad_ref);
  `);
  // Influencer gender (for the men/women product split) + app settings (budget)
  await pool.query(`
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT '';
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY,
      monthly_budget NUMERIC DEFAULT 0
    );
    INSERT INTO app_settings (id, monthly_budget) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
  `);
  console.log('DB ready');
}

const mapComment = (c) => ({
  id:        c.id,
  adRef:     c.ad_ref,
  author:    c.author,
  body:      c.body,
  createdAt: c.created_at,
});

const mapAd = (a, comments = []) => ({
  id:         a.id,
  adId:       a.ad_id,
  name:       a.name,
  status:     a.status,
  issueNote:  a.issue_note,
  assignedTo: a.assigned_to,
  sparkCode:  a.spark_code || '',
  comments:   comments.filter(c => c.ad_ref === a.ad_id).map(mapComment),
});

const mapBatch = (b, ads, comments = []) => ({
  id:            b.id,
  name:          b.name,
  platform:      b.platform,
  link:          b.link,
  notes:         b.notes,
  submittedBy:   b.submitted_by,
  creatorHandle: b.creator_handle,
  submittedDate: b.submitted_date,
  ads:           ads.filter(a => a.batch_id === b.id).map(a => mapAd(a, comments)),
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/batches', async (req, res) => {
  try {
    const batchRes = await pool.query('SELECT * FROM batches ORDER BY created_at DESC');
    const adRes    = await pool.query('SELECT * FROM ads ORDER BY sort_order ASC, id ASC');
    const comRes   = await pool.query('SELECT * FROM ad_comments ORDER BY created_at ASC');
    res.json(batchRes.rows.map(b => mapBatch(b, adRes.rows, comRes.rows)));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/batches', async (req, res) => {
  const { name, platform, link, notes, submittedBy, creatorHandle, ads } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bRes = await client.query(
      `INSERT INTO batches (name,platform,link,notes,submitted_by,creator_handle) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, platform, link||'', notes||'', submittedBy||'', creatorHandle||'']
    );
    const batch = bRes.rows[0];
    const insertedAds = [];
    for (let i = 0; i < ads.length; i++) {
      const a = ads[i];
      // Generate adId from DB sequence to guarantee uniqueness
      const seqRes = await client.query(`SELECT nextval('ads_id_seq') AS next_id`);
      const uniqueAdId = '#' + String(seqRes.rows[0].next_id).padStart(4, '0');
      const aRes = await client.query(
        `INSERT INTO ads (id,batch_id,ad_id,name,status,issue_note,assigned_to,spark_code,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [seqRes.rows[0].next_id, batch.id, uniqueAdId, a.name, a.status||'pending', a.issueNote||'', a.assignedTo||'', a.sparkCode||'', i]
      );
      insertedAds.push(mapAd(aRes.rows[0]));
    }
    await client.query('COMMIT');
    res.json({
      id: batch.id, name: batch.name, platform: batch.platform,
      link: batch.link, notes: batch.notes, submittedBy: batch.submitted_by,
      creatorHandle: batch.creator_handle, submittedDate: batch.submitted_date,
      ads: insertedAds
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e); res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

app.put('/api/batches/:id', async (req, res) => {
  const { name, platform, link, notes, submittedBy, creatorHandle, ads } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE batches SET name=$1,platform=$2,link=$3,notes=$4,submitted_by=$5,creator_handle=$6 WHERE id=$7`,
      [name, platform, link||'', notes||'', submittedBy||'', creatorHandle||'', req.params.id]
    );
    await client.query('DELETE FROM ads WHERE batch_id=$1', [req.params.id]);
    const updatedRows = [];
    for (let i = 0; i < ads.length; i++) {
      const a = ads[i];
      // Preserve existing adId if ad existed, generate new unique one if new
      const adId = a.adId && a.adId.startsWith('#') && a.id ? a.adId : (() => {
        // Will be set after sequence call below
      })();
      const seqRes2 = await client.query(`SELECT nextval('ads_id_seq') AS next_id`);
      const finalAdId = (a.adId && a.adId.startsWith('#') && a.id) ? a.adId : '#' + String(seqRes2.rows[0].next_id).padStart(4, '0');
      const aRes = await client.query(
        `INSERT INTO ads (id,batch_id,ad_id,name,status,issue_note,assigned_to,spark_code,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [seqRes2.rows[0].next_id, req.params.id, finalAdId, a.name, a.status||'pending', a.issueNote||'', a.assignedTo||'', a.sparkCode||'', i]
      );
      updatedRows.push(aRes.rows[0]);
    }
    // Re-attach existing comments (keyed by the preserved ad_id) so the edit
    // response doesn't blank out threads in the UI
    const refs = updatedRows.map(r => r.ad_id);
    const comRes = refs.length
      ? await client.query('SELECT * FROM ad_comments WHERE ad_ref = ANY($1::text[])', [refs])
      : { rows: [] };
    const updatedAds = updatedRows.map(r => mapAd(r, comRes.rows));
    await client.query('COMMIT');
    res.json({ success:true, ads: updatedAds });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

app.delete('/api/batches/:id', async (req, res) => {
  try {
    // Comments are keyed by ad_ref (no FK), so clean them up before the ads cascade away
    const adRes = await pool.query('SELECT ad_id FROM ads WHERE batch_id=$1', [req.params.id]);
    const refs = adRes.rows.map(r => r.ad_id);
    if (refs.length) await pool.query('DELETE FROM ad_comments WHERE ad_ref = ANY($1::text[])', [refs]);
    await pool.query('DELETE FROM batches WHERE id=$1', [req.params.id]);
    res.json({ success:true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Issue reply threads ───────────────────────────────────────────────────────
app.post('/api/comments', async (req, res) => {
  const { adRef, author, body } = req.body;
  if (!adRef || !body || !body.trim()) return res.status(400).json({ error: 'adRef and body are required' });
  try {
    const r = await pool.query(
      `INSERT INTO ad_comments (ad_ref, author, body) VALUES ($1,$2,$3) RETURNING *`,
      [adRef, author === 'PDM' ? 'PDM' : 'CAINTE', body.trim()]
    );
    res.json(mapComment(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/comments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ad_comments WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.patch('/api/ads/:id', async (req, res) => {
  const { status, issueNote, assignedTo } = req.body;
  try {
    await pool.query(
      `UPDATE ads SET status=$1, issue_note=$2, assigned_to=$3 WHERE id=$4`,
      [status, issueNote||'', assignedTo||'', req.params.id]
    );
    res.json({ success:true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Influencer Tracker ────────────────────────────────────────────────────────
const mapAttachment = (a) => ({
  id:       a.id,
  collabId: a.collab_id,
  filename: a.filename,
  mimetype: a.mimetype,
  size:     a.size || 0,
});

const mapCollab = (c, attachments = []) => ({
  id:           c.id,
  creatorId:    c.creator_id,
  type:         c.type,
  status:       c.status,
  deliverables: c.deliverables || [],
  products:     c.products || [],
  productCount: c.product_count || 0,
  totalValue:   c.total_value != null ? Number(c.total_value) : 0,
  responsible:  c.responsible || '',
  notes:        c.notes || '',
  attachments:  attachments.filter(a => a.collab_id === c.id).map(mapAttachment),
  createdAt:    c.created_at,
  updatedAt:    c.updated_at,
});

const mapCreator = (cr, collabs, attachments = []) => ({
  id:            cr.id,
  name:          cr.name,
  profileLink:   cr.profile_link,
  platform:      cr.platform,
  gender:        cr.gender || '',
  rating:        cr.rating || 0,
  ratingTags:    cr.rating_tags || [],
  ratingNote:    cr.rating_note || '',
  createdAt:     cr.created_at,
  collaborations: collabs.filter(c => c.creator_id === cr.id).map(c => mapCollab(c, attachments)),
});

const mapSourcing = (s) => ({
  id:          s.id,
  name:        s.name,
  profileLink: s.profile_link,
  platform:    s.platform,
  comment:     s.comment || '',
  addedBy:     s.added_by || '',
  createdAt:   s.created_at,
});

// Insert a collaboration row (used by create-creator + add-collaboration)
async function insertCollaboration(client, creatorId, c) {
  const r = await client.query(
    `INSERT INTO collaborations
       (creator_id,type,status,deliverables,products,product_count,total_value,responsible,notes)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9) RETURNING *`,
    [
      creatorId,
      c.type || 'Gifting',
      c.status || 'upcoming',
      JSON.stringify(c.deliverables || []),
      JSON.stringify(c.products || []),
      c.productCount || 0,
      c.totalValue || 0,
      c.responsible || '',
      c.notes || '',
    ]
  );
  return r.rows[0];
}

app.get('/api/creators', async (req, res) => {
  try {
    const crRes = await pool.query('SELECT * FROM creators ORDER BY created_at DESC');
    const coRes = await pool.query('SELECT * FROM collaborations ORDER BY created_at DESC');
    // Attachment metadata only (never the file bytes) — bytes are streamed via /api/files/:id
    const atRes = await pool.query('SELECT id, collab_id, filename, mimetype, size FROM attachments ORDER BY created_at ASC');
    res.json(crRes.rows.map(cr => mapCreator(cr, coRes.rows, atRes.rows)));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/creators', async (req, res) => {
  const { name, profileLink, platform, gender, collaboration } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const crRes = await client.query(
      `INSERT INTO creators (name,profile_link,platform,gender) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, profileLink || '', platform || 'Meta', gender || '']
    );
    const creator = crRes.rows[0];
    const collabs = [];
    if (collaboration) {
      collabs.push(await insertCollaboration(client, creator.id, collaboration));
    }
    await client.query('COMMIT');
    res.json(mapCreator(creator, collabs));
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e); res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

app.put('/api/creators/:id', async (req, res) => {
  const { name, profileLink, platform, gender, rating, ratingTags, ratingNote } = req.body;
  try {
    await pool.query(
      `UPDATE creators SET name=$1, profile_link=$2, platform=$3, gender=$4, rating=$5, rating_tags=$6::jsonb, rating_note=$7 WHERE id=$8`,
      [name, profileLink || '', platform || 'Meta', gender || '', rating || 0, JSON.stringify(ratingTags || []), ratingNote || '', req.params.id]
    );
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── App settings (budget) ─────────────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
  try {
    const r = await pool.query('SELECT monthly_budget FROM app_settings WHERE id=1');
    res.json({ monthlyBudget: r.rows[0] ? Number(r.rows[0].monthly_budget) : 0 });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/settings', async (req, res) => {
  const { monthlyBudget } = req.body;
  try {
    await pool.query(
      `INSERT INTO app_settings (id, monthly_budget) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET monthly_budget = $1`,
      [Number(monthlyBudget) || 0]
    );
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/creators/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM creators WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/creators/:id/collaborations', async (req, res) => {
  const client = await pool.connect();
  try {
    const row = await insertCollaboration(client, req.params.id, req.body);
    res.json(mapCollab(row));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.put('/api/collaborations/:id', async (req, res) => {
  const { type, status, deliverables, products, productCount, totalValue, responsible, notes } = req.body;
  try {
    const r = await pool.query(
      `UPDATE collaborations SET
         type=$1, status=$2, deliverables=$3::jsonb, products=$4::jsonb,
         product_count=$5, total_value=$6, responsible=$7, notes=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [
        type || 'Gifting', status || 'upcoming',
        JSON.stringify(deliverables || []), JSON.stringify(products || []),
        productCount || 0, totalValue || 0, responsible || '', notes || '', req.params.id,
      ]
    );
    res.json(r.rows[0] ? mapCollab(r.rows[0]) : { success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.patch('/api/collaborations/:id', async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query(`UPDATE collaborations SET status=$1, updated_at=NOW() WHERE id=$2`, [status, req.params.id]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/collaborations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM collaborations WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Attachments (agreements / contracts) ──────────────────────────────────────
app.post('/api/collaborations/:id/files', async (req, res) => {
  const { filename, mimetype, dataBase64 } = req.body;
  if (!filename || !dataBase64) return res.status(400).json({ error: 'filename and dataBase64 are required' });
  try {
    const buf = Buffer.from(dataBase64, 'base64');
    const r = await pool.query(
      `INSERT INTO attachments (collab_id, filename, mimetype, size, data)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, collab_id, filename, mimetype, size`,
      [req.params.id, filename, mimetype || 'application/octet-stream', buf.length, buf]
    );
    res.json(mapAttachment(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/files/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT filename, mimetype, data FROM attachments WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    const f = r.rows[0];
    res.setHeader('Content-Type', f.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.filename)}"`);
    res.send(f.data);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/files/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM attachments WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sourcing', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM sourcing ORDER BY created_at DESC');
    res.json(r.rows.map(mapSourcing));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/sourcing', async (req, res) => {
  const { name, profileLink, platform, comment, addedBy } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO sourcing (name,profile_link,platform,comment,added_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, profileLink || '', platform || 'Meta', comment || '', addedBy || '']
    );
    res.json(mapSourcing(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/sourcing/:id', async (req, res) => {
  const { name, profileLink, platform, comment, addedBy } = req.body;
  try {
    await pool.query(
      `UPDATE sourcing SET name=$1, profile_link=$2, platform=$3, comment=$4, added_by=$5 WHERE id=$6`,
      [name, profileLink || '', platform || 'Meta', comment || '', addedBy || '', req.params.id]
    );
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/sourcing/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM sourcing WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use(express.static(path.join(__dirname, '../dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`Server on port ${PORT}`));
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
