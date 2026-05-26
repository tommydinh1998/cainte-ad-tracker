const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
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
  `);
  // Add spark_code column if it doesn't exist (migration)
  await pool.query(`
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS spark_code TEXT DEFAULT '';
  `);
  console.log('DB ready');
}

const mapAd = (a) => ({
  id:         a.id,
  adId:       a.ad_id,
  name:       a.name,
  status:     a.status,
  issueNote:  a.issue_note,
  assignedTo: a.assigned_to,
  sparkCode:  a.spark_code || '',
});

const mapBatch = (b, ads) => ({
  id:            b.id,
  name:          b.name,
  platform:      b.platform,
  link:          b.link,
  notes:         b.notes,
  submittedBy:   b.submitted_by,
  creatorHandle: b.creator_handle,
  submittedDate: b.submitted_date,
  ads:           ads.filter(a => a.batch_id === b.id).map(mapAd),
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/batches', async (req, res) => {
  try {
    const batchRes = await pool.query('SELECT * FROM batches ORDER BY created_at DESC');
    const adRes    = await pool.query('SELECT * FROM ads ORDER BY sort_order ASC, id ASC');
    res.json(batchRes.rows.map(b => mapBatch(b, adRes.rows)));
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
    const updatedAds = [];
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
      updatedAds.push(mapAd(aRes.rows[0]));
    }
    await client.query('COMMIT');
    res.json({ success:true, ads: updatedAds });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

app.delete('/api/batches/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM batches WHERE id=$1', [req.params.id]);
    res.json({ success:true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

app.use(express.static(path.join(__dirname, '../dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`Server on port ${PORT}`));
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
