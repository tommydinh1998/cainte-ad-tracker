const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

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
      platform TEXT DEFAULT 'Instagram',
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
      platform TEXT DEFAULT 'Instagram',
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
  // Per-collaboration platform (Instagram / TikTok / YouTube / Both) + delivered content pieces.
  // "Meta" was the old label for Instagram — normalised here so the UI has one vocabulary.
  await pool.query(`
    ALTER TABLE collaborations ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT '';
    UPDATE creators SET platform='Instagram' WHERE platform='Meta';
    UPDATE sourcing SET platform='Instagram' WHERE platform='Meta';
    CREATE TABLE IF NOT EXISTS content_pieces (
      id SERIAL PRIMARY KEY,
      collab_id INTEGER NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
      type TEXT DEFAULT 'Reel',
      platform TEXT DEFAULT '',
      qty INTEGER DEFAULT 1,
      posted_on TEXT DEFAULT '',
      link TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS content_pieces_collab_idx ON content_pieces (collab_id);
  `);
  // Backfill: collaborations created before the per-collab platform field inherit the creator's.
  await pool.query(`
    UPDATE collaborations c SET platform = cr.platform
    FROM creators cr
    WHERE c.creator_id = cr.id AND (c.platform IS NULL OR c.platform = '')
      AND cr.platform IN ('Instagram','TikTok','YouTube','Both');
  `);
  // ── Multi-brand ─────────────────────────────────────────────────────
  // Each brand runs the same three products over its own data. Only the root
  // tables carry a brand; children hang off them, and everything addressed by
  // a globally-unique id needs no scoping. Existing rows are all Cainté.
  await pool.query(`
    ALTER TABLE batches        ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'cainte';
    ALTER TABLE creators       ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'cainte';
    ALTER TABLE sourcing       ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'cainte';
    ALTER TABLE ct_collections ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'cainte';
    ALTER TABLE ct_ideas       ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'cainte';
    CREATE INDEX IF NOT EXISTS batches_brand_idx        ON batches (brand);
    CREATE INDEX IF NOT EXISTS creators_brand_idx       ON creators (brand);
    CREATE INDEX IF NOT EXISTS sourcing_brand_idx       ON sourcing (brand);
    CREATE INDEX IF NOT EXISTS ct_collections_brand_idx ON ct_collections (brand);
    CREATE INDEX IF NOT EXISTS ct_ideas_brand_idx       ON ct_ideas (brand);
  `);
  // The budget setting becomes one row per brand (id 1 = cainte, id 2 = elle).
  await pool.query(`
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS brand TEXT;
    UPDATE app_settings SET brand='cainte' WHERE id=1 AND brand IS NULL;
    INSERT INTO app_settings (id, brand, monthly_budget) VALUES (2,'elle',0)
      ON CONFLICT (id) DO NOTHING;
    CREATE UNIQUE INDEX IF NOT EXISTS app_settings_brand_idx ON app_settings (brand);
  `);
  // ── Collection Tracker ──────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ct_collections (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      launch_date DATE,
      status TEXT NOT NULL DEFAULT 'Planning',
      owners TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ct_products (
      id SERIAL PRIMARY KEY,
      collection_id INTEGER NOT NULL REFERENCES ct_collections(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sku TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ct_samples (
      id SERIAL PRIMARY KEY,
      collection_id INTEGER NOT NULL REFERENCES ct_collections(id) ON DELETE CASCADE,
      product_name TEXT NOT NULL,
      expected_date DATE,
      received_date DATE,
      status TEXT NOT NULL DEFAULT 'Ordered',
      comments TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ct_content_items (
      id SERIAL PRIMARY KEY,
      collection_id INTEGER NOT NULL REFERENCES ct_collections(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'Product photos',
      title TEXT NOT NULL,
      deadline DATE,
      status TEXT NOT NULL DEFAULT 'Not started',
      owner TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ct_marketing (
      id SERIAL PRIMARY KEY,
      collection_id INTEGER NOT NULL REFERENCES ct_collections(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'Teaser',
      title TEXT NOT NULL,
      activity_date DATE,
      status TEXT NOT NULL DEFAULT 'Planned',
      owner TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ct_tasks (
      id SERIAL PRIMARY KEY,
      collection_id INTEGER NOT NULL REFERENCES ct_collections(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT '',
      deadline DATE,
      status TEXT NOT NULL DEFAULT 'To do',
      priority TEXT NOT NULL DEFAULT 'Medium'
    );
    CREATE TABLE IF NOT EXISTS ct_ideas (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      added_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ct_idea_files (
      id SERIAL PRIMARY KEY,
      idea_id INTEGER NOT NULL REFERENCES ct_ideas(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mimetype TEXT DEFAULT 'application/octet-stream',
      size INTEGER DEFAULT 0,
      data BYTEA,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ct_collection_files (
      id SERIAL PRIMARY KEY,
      collection_id INTEGER NOT NULL REFERENCES ct_collections(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mimetype TEXT DEFAULT 'application/octet-stream',
      size INTEGER DEFAULT 0,
      data BYTEA,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // ── Kampagne Budget ─────────────────────────────────────────────────
  // Campaigns are the brand-scoped root; expenses (posteringer) hang off a
  // campaign, and receipts hang off an expense — same layering as the other
  // products, so only kb_campaigns carries a brand column.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kb_campaigns (
      id SERIAL PRIMARY KEY,
      brand TEXT NOT NULL DEFAULT 'cainte',
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT '',
      budget NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active',
      start_date DATE,
      end_date DATE,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS kb_campaigns_brand_idx ON kb_campaigns (brand);
    CREATE TABLE IF NOT EXISTS kb_expenses (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES kb_campaigns(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      amount NUMERIC NOT NULL DEFAULT 0,
      expense_date DATE,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS kb_expenses_campaign_idx ON kb_expenses (campaign_id);
    CREATE TABLE IF NOT EXISTS kb_expense_files (
      id SERIAL PRIMARY KEY,
      expense_id INTEGER NOT NULL REFERENCES kb_expenses(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mimetype TEXT DEFAULT 'application/octet-stream',
      size INTEGER DEFAULT 0,
      data BYTEA,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await initKpi();
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

// Active brand for a request. Whitelisted — an unknown or missing header falls
// back to Cainté, so an un-branded client can never reach another brand's data.
const BRANDS = ['cainte', 'elle'];
const brandOf = (req) => {
  const b = String(req.get('x-brand') || '').toLowerCase();
  return BRANDS.includes(b) ? b : 'cainte';
};

app.get('/api/batches', async (req, res) => {
  try {
    const brand = brandOf(req);
    const batchRes = await pool.query('SELECT * FROM batches WHERE brand=$1 ORDER BY created_at DESC', [brand]);
    // Ads/comments are keyed off the batch, and ad_id comes from a global
    // sequence, so no brand filter is needed beyond the batch scope.
    const adRes    = await pool.query('SELECT * FROM ads WHERE batch_id IN (SELECT id FROM batches WHERE brand=$1) ORDER BY sort_order ASC, id ASC', [brand]);
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
      `INSERT INTO batches (name,platform,link,notes,submitted_by,creator_handle,brand) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, platform, link||'', notes||'', submittedBy||'', creatorHandle||'', brandOf(req)]
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

const mapContent = (p) => ({
  id:       p.id,
  collabId: p.collab_id,
  type:     p.type || 'Reel',
  platform: p.platform || '',
  qty:      p.qty || 1,
  postedOn: p.posted_on || '',
  link:     p.link || '',
  notes:    p.notes || '',
});

const mapCollab = (c, attachments = [], content = []) => ({
  id:           c.id,
  creatorId:    c.creator_id,
  type:         c.type,
  status:       c.status,
  platform:     c.platform || '',
  content:      content.filter(p => p.collab_id === c.id).map(mapContent),
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

const mapCreator = (cr, collabs, attachments = [], content = []) => ({
  id:            cr.id,
  name:          cr.name,
  profileLink:   cr.profile_link,
  platform:      cr.platform,
  gender:        cr.gender || '',
  rating:        cr.rating || 0,
  ratingTags:    cr.rating_tags || [],
  ratingNote:    cr.rating_note || '',
  createdAt:     cr.created_at,
  collaborations: collabs.filter(c => c.creator_id === cr.id).map(c => mapCollab(c, attachments, content)),
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

// Content pieces are edited as a whole list on the collaboration, so a save
// replaces the rows for that collaboration (ids are not referenced anywhere).
async function replaceContent(client, collabId, list) {
  await client.query('DELETE FROM content_pieces WHERE collab_id=$1', [collabId]);
  const rows = [];
  for (const p of list) {
    if (!p || !p.type) continue;
    const r = await client.query(
      `INSERT INTO content_pieces (collab_id,type,platform,qty,posted_on,link,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [collabId, p.type, p.platform || '', Math.max(1, Number(p.qty) || 1), (p.postedOn || '').slice(0, 10), p.link || '', p.notes || '']
    );
    rows.push(r.rows[0]);
  }
  return rows;
}

// Insert a collaboration row (used by create-creator + add-collaboration)
async function insertCollaboration(client, creatorId, c) {
  const r = await client.query(
    `INSERT INTO collaborations
       (creator_id,type,status,platform,deliverables,products,product_count,total_value,responsible,notes)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10) RETURNING *`,
    [
      creatorId,
      c.type || 'Gifting',
      c.status || 'upcoming',
      c.platform || '',
      JSON.stringify(c.deliverables || []),
      JSON.stringify(c.products || []),
      c.productCount || 0,
      c.totalValue || 0,
      c.responsible || '',
      c.notes || '',
    ]
  );
  const row = r.rows[0];
  const content = Array.isArray(c.content) ? await replaceContent(client, row.id, c.content) : [];
  return { row, content };
}

app.get('/api/creators', async (req, res) => {
  try {
    const brand = brandOf(req);
    const inBrand = 'creator_id IN (SELECT id FROM creators WHERE brand=$1)';
    const crRes = await pool.query('SELECT * FROM creators WHERE brand=$1 ORDER BY created_at DESC', [brand]);
    const coRes = await pool.query(`SELECT * FROM collaborations WHERE ${inBrand} ORDER BY created_at DESC`, [brand]);
    // Attachment metadata only (never the file bytes) — bytes are streamed via /api/files/:id
    const atRes = await pool.query(`SELECT id, collab_id, filename, mimetype, size FROM attachments WHERE collab_id IN (SELECT id FROM collaborations WHERE ${inBrand}) ORDER BY created_at ASC`, [brand]);
    const cpRes = await pool.query(`SELECT * FROM content_pieces WHERE collab_id IN (SELECT id FROM collaborations WHERE ${inBrand}) ORDER BY posted_on DESC, id DESC`, [brand]);
    res.json(crRes.rows.map(cr => mapCreator(cr, coRes.rows, atRes.rows, cpRes.rows)));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/creators', async (req, res) => {
  const { name, profileLink, platform, gender, collaboration } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const crRes = await client.query(
      `INSERT INTO creators (name,profile_link,platform,gender,brand) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, profileLink || '', platform || 'Instagram', gender || '', brandOf(req)]
    );
    const creator = crRes.rows[0];
    const collabs = [];
    let content = [];
    if (collaboration) {
      const ins = await insertCollaboration(client, creator.id, collaboration);
      collabs.push(ins.row);
      content = ins.content;
    }
    await client.query('COMMIT');
    res.json(mapCreator(creator, collabs, [], content));
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
      [name, profileLink || '', platform || 'Instagram', gender || '', rating || 0, JSON.stringify(ratingTags || []), ratingNote || '', req.params.id]
    );
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── App settings (budget) ─────────────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
  try {
    const r = await pool.query('SELECT monthly_budget FROM app_settings WHERE brand=$1', [brandOf(req)]);
    res.json({ monthlyBudget: r.rows[0] ? Number(r.rows[0].monthly_budget) : 0 });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/settings', async (req, res) => {
  const { monthlyBudget } = req.body;
  try {
    await pool.query(
      `UPDATE app_settings SET monthly_budget=$1 WHERE brand=$2`,
      [Number(monthlyBudget) || 0, brandOf(req)]
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
    const { row, content } = await insertCollaboration(client, req.params.id, req.body);
    res.json(mapCollab(row, [], content));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.put('/api/collaborations/:id', async (req, res) => {
  const { type, status, platform, deliverables, products, productCount, totalValue, responsible, notes, content } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE collaborations SET
         type=$1, status=$2, platform=$3, deliverables=$4::jsonb, products=$5::jsonb,
         product_count=$6, total_value=$7, responsible=$8, notes=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [
        type || 'Gifting', status || 'upcoming', platform || '',
        JSON.stringify(deliverables || []), JSON.stringify(products || []),
        productCount || 0, totalValue || 0, responsible || '', notes || '', req.params.id,
      ]
    );
    // Only touch content when the caller actually sent a list — never wipe it implicitly.
    let rows = [];
    if (Array.isArray(content)) {
      rows = await replaceContent(client, req.params.id, content);
    } else {
      rows = (await client.query('SELECT * FROM content_pieces WHERE collab_id=$1', [req.params.id])).rows;
    }
    await client.query('COMMIT');
    res.json(r.rows[0] ? mapCollab(r.rows[0], [], rows) : { success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e); res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── Content pieces (delivered content per collaboration) ──────────────────────
// Quick-add from the collaboration card / content tab, without opening the editor.
app.post('/api/collaborations/:id/content', async (req, res) => {
  const { type, platform, qty, postedOn, link, notes } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO content_pieces (collab_id,type,platform,qty,posted_on,link,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, type || 'Reel', platform || '', Math.max(1, Number(qty) || 1), (postedOn || '').slice(0, 10), link || '', notes || '']
    );
    res.json(mapContent(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/content/:id', async (req, res) => {
  const { type, platform, qty, postedOn, link, notes } = req.body;
  try {
    const r = await pool.query(
      `UPDATE content_pieces SET type=$1, platform=$2, qty=$3, posted_on=$4, link=$5, notes=$6
       WHERE id=$7 RETURNING *`,
      [type || 'Reel', platform || '', Math.max(1, Number(qty) || 1), (postedOn || '').slice(0, 10), link || '', notes || '', req.params.id]
    );
    res.json(r.rows[0] ? mapContent(r.rows[0]) : { success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/content/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM content_pieces WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    const r = await pool.query('SELECT * FROM sourcing WHERE brand=$1 ORDER BY created_at DESC', [brandOf(req)]);
    res.json(r.rows.map(mapSourcing));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/sourcing', async (req, res) => {
  const { name, profileLink, platform, comment, addedBy } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO sourcing (name,profile_link,platform,comment,added_by,brand) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, profileLink || '', platform || 'Instagram', comment || '', addedBy || '', brandOf(req)]
    );
    res.json(mapSourcing(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/sourcing/:id', async (req, res) => {
  const { name, profileLink, platform, comment, addedBy } = req.body;
  try {
    await pool.query(
      `UPDATE sourcing SET name=$1, profile_link=$2, platform=$3, comment=$4, added_by=$5 WHERE id=$6`,
      [name, profileLink || '', platform || 'Instagram', comment || '', addedBy || '', req.params.id]
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

// ── Collection Tracker ────────────────────────────────────────────────
// Generic CRUD over ct_* tables; URL names map to prefixed table names and
// each table has a field whitelist ('' dates are coerced to NULL).
const CT = {
  collections:          { table: 'ct_collections',   fields: ['name', 'launch_date', 'status', 'owners', 'description'], dates: ['launch_date'] },
  products:             { table: 'ct_products',      fields: ['name', 'sku', 'category', 'notes'], dates: [] },
  samples:              { table: 'ct_samples',       fields: ['product_name', 'expected_date', 'received_date', 'status', 'comments'], dates: ['expected_date', 'received_date'] },
  content_items:        { table: 'ct_content_items', fields: ['type', 'title', 'deadline', 'status', 'owner', 'notes'], dates: ['deadline'] },
  marketing_activities: { table: 'ct_marketing',     fields: ['type', 'title', 'activity_date', 'status', 'owner', 'notes'], dates: ['activity_date'] },
  tasks:                { table: 'ct_tasks',         fields: ['title', 'owner', 'deadline', 'status', 'priority'], dates: ['deadline'] },
  ideas:                { table: 'ct_ideas',         fields: ['title', 'link', 'category', 'notes', 'added_by'], dates: [] },
};

const ctPick = (key, body) => {
  const { fields, dates } = CT[key];
  const cols = [], vals = [];
  for (const f of fields) {
    if (!(f in body)) continue;
    let v = body[f];
    if (dates.includes(f) && (v === '' || v === undefined)) v = null;
    cols.push(f); vals.push(v);
  }
  return { cols, vals };
};

// One payload with everything — the frontend derives dashboard/calendar/filters.
app.get('/api/ct/data', async (req, res) => {
  try {
    const brand = brandOf(req);
    const inBrand = 'collection_id IN (SELECT id FROM ct_collections WHERE brand=$1)';
    const out = {};
    for (const [key, cfg] of Object.entries(CT)) {
      const orderBy = key === 'collections' ? 'launch_date NULLS LAST, id' : 'id';
      // collections and ideas are roots and carry the brand themselves; every
      // other ct_* table hangs off a collection.
      const where = (key === 'collections') ? 'brand=$1' : (key === 'ideas') ? 'brand=$1' : inBrand;
      const r = await pool.query(`SELECT * FROM ${cfg.table} WHERE ${where} ORDER BY ${orderBy}`, [brand]);
      out[key] = r.rows;
    }
    // File metadata only (never the bytes) — bytes stream via the file endpoints
    const f = await pool.query('SELECT id, idea_id, filename, mimetype, size FROM ct_idea_files WHERE idea_id IN (SELECT id FROM ct_ideas WHERE brand=$1) ORDER BY id', [brand]);
    out.idea_files = f.rows;
    const cf = await pool.query(`SELECT id, collection_id, filename, mimetype, size FROM ct_collection_files WHERE ${inBrand} ORDER BY id`, [brand]);
    out.collection_files = cf.rows;
    res.json(out);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/ct/collections', async (req, res) => {
  try {
    const { cols, vals } = ctPick('collections', req.body);
    cols.push('brand'); vals.push(brandOf(req));
    const ph = cols.map((_, i) => `$${i + 1}`).join(',');
    const r = await pool.query(`INSERT INTO ct_collections (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals);
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Inspiration bank — ideas live outside collections
app.post('/api/ct/ideas', async (req, res) => {
  try {
    const { cols, vals } = ctPick('ideas', req.body);
    cols.push('brand'); vals.push(brandOf(req));
    const ph = cols.map((_, i) => `$${i + 1}`).join(',');
    const r = await pool.query(`INSERT INTO ct_ideas (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals);
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/ct/ideas/:id/files', async (req, res) => {
  const { filename, mimetype, dataBase64 } = req.body;
  if (!filename || !dataBase64) return res.status(400).json({ error: 'filename and dataBase64 are required' });
  try {
    const buf = Buffer.from(dataBase64, 'base64');
    const r = await pool.query(
      `INSERT INTO ct_idea_files (idea_id, filename, mimetype, size, data)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, idea_id, filename, mimetype, size`,
      [req.params.id, filename, mimetype || 'application/octet-stream', buf.length, buf]
    );
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/ct/idea-files/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT filename, mimetype, data FROM ct_idea_files WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    const f = r.rows[0];
    res.setHeader('Content-Type', f.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.filename)}"`);
    res.send(f.data);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/ct/idea-files/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ct_idea_files WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Collection attachments — PDFs and pasted images on a collection
app.post('/api/ct/collections/:id/files', async (req, res) => {
  const { filename, mimetype, dataBase64 } = req.body;
  if (!filename || !dataBase64) return res.status(400).json({ error: 'filename and dataBase64 are required' });
  try {
    const buf = Buffer.from(dataBase64, 'base64');
    const r = await pool.query(
      `INSERT INTO ct_collection_files (collection_id, filename, mimetype, size, data)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, collection_id, filename, mimetype, size`,
      [req.params.id, filename, mimetype || 'application/octet-stream', buf.length, buf]
    );
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/ct/collection-files/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT filename, mimetype, data FROM ct_collection_files WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    const f = r.rows[0];
    res.setHeader('Content-Type', f.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.filename)}"`);
    res.send(f.data);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/ct/collection-files/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ct_collection_files WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ct/collections/:id/:key', async (req, res) => {
  const { key } = req.params;
  if (!CT[key] || key === 'collections' || key === 'ideas') return res.status(404).json({ error: 'unknown entity' });
  try {
    const { cols, vals } = ctPick(key, req.body);
    cols.push('collection_id'); vals.push(Number(req.params.id));
    const ph = cols.map((_, i) => `$${i + 1}`).join(',');
    const r = await pool.query(`INSERT INTO ${CT[key].table} (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals);
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/ct/:key/:id', async (req, res) => {
  const { key, id } = req.params;
  if (!CT[key]) return res.status(404).json({ error: 'unknown entity' });
  try {
    const { cols, vals } = ctPick(key, req.body);
    if (!cols.length) return res.status(400).json({ error: 'no fields' });
    const sets = cols.map((c, i) => `${c}=$${i + 1}`).join(', ');
    vals.push(Number(id));
    const r = await pool.query(`UPDATE ${CT[key].table} SET ${sets} WHERE id=$${vals.length} RETURNING *`, vals);
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/ct/:key/:id', async (req, res) => {
  const { key, id } = req.params;
  if (!CT[key]) return res.status(404).json({ error: 'unknown entity' });
  try {
    await pool.query(`DELETE FROM ${CT[key].table} WHERE id=$1`, [Number(id)]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Kampagne Budget ───────────────────────────────────────────────────────────
const kbDate = (v) => (v ? String(v).slice(0, 10) : null);
// pg parses DATE columns to a JS Date at local midnight; serializing that to
// UTC shifts it a day back for the client. Format from local components instead.
const kbDateOut = (d) => {
  if (!d) return null;
  if (!(d instanceof Date)) return String(d).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const mapKbCampaign = (r) => ({ ...r, start_date: kbDateOut(r.start_date), end_date: kbDateOut(r.end_date) });
const mapKbExpense  = (r) => ({ ...r, expense_date: kbDateOut(r.expense_date) });

// One payload with everything — the frontend derives totals and per-campaign spend.
app.get('/api/kb/data', async (req, res) => {
  try {
    const brand = brandOf(req);
    const inBrand = 'campaign_id IN (SELECT id FROM kb_campaigns WHERE brand=$1)';
    const cRes = await pool.query('SELECT * FROM kb_campaigns WHERE brand=$1 ORDER BY created_at DESC', [brand]);
    const eRes = await pool.query(`SELECT * FROM kb_expenses WHERE ${inBrand} ORDER BY expense_date DESC NULLS LAST, id DESC`, [brand]);
    // Receipt metadata only (never the bytes) — bytes stream via /api/kb/files/:id
    const fRes = await pool.query(`SELECT id, expense_id, filename, mimetype, size FROM kb_expense_files WHERE expense_id IN (SELECT id FROM kb_expenses WHERE ${inBrand}) ORDER BY id`, [brand]);
    res.json({ campaigns: cRes.rows.map(mapKbCampaign), expenses: eRes.rows.map(mapKbExpense), files: fRes.rows });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/kb/campaigns', async (req, res) => {
  const { name, platform, budget, status, start_date, end_date, notes } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const r = await pool.query(
      `INSERT INTO kb_campaigns (brand, name, platform, budget, status, start_date, end_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [brandOf(req), String(name).trim(), platform || '', Number(budget) || 0, status || 'Active', kbDate(start_date), kbDate(end_date), notes || '']
    );
    res.json(mapKbCampaign(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/kb/campaigns/:id', async (req, res) => {
  const { name, platform, budget, status, start_date, end_date, notes } = req.body;
  try {
    const r = await pool.query(
      `UPDATE kb_campaigns SET name=$1, platform=$2, budget=$3, status=$4, start_date=$5, end_date=$6, notes=$7
       WHERE id=$8 RETURNING *`,
      [name, platform || '', Number(budget) || 0, status || 'Active', kbDate(start_date), kbDate(end_date), notes || '', req.params.id]
    );
    res.json(r.rows[0] ? mapKbCampaign(r.rows[0]) : { success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/kb/campaigns/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM kb_campaigns WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/kb/campaigns/:id/expenses', async (req, res) => {
  const { title, amount, expense_date, note } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });
  try {
    const r = await pool.query(
      `INSERT INTO kb_expenses (campaign_id, title, amount, expense_date, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, String(title).trim(), Number(amount) || 0, kbDate(expense_date), note || '']
    );
    res.json(mapKbExpense(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/kb/expenses/:id', async (req, res) => {
  const { title, amount, expense_date, note } = req.body;
  try {
    const r = await pool.query(
      `UPDATE kb_expenses SET title=$1, amount=$2, expense_date=$3, note=$4 WHERE id=$5 RETURNING *`,
      [title, Number(amount) || 0, kbDate(expense_date), note || '', req.params.id]
    );
    res.json(r.rows[0] ? mapKbExpense(r.rows[0]) : { success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/kb/expenses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM kb_expenses WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Receipts — images and PDFs on an expense
app.post('/api/kb/expenses/:id/files', async (req, res) => {
  const { filename, mimetype, dataBase64 } = req.body;
  if (!filename || !dataBase64) return res.status(400).json({ error: 'filename and dataBase64 are required' });
  try {
    const buf = Buffer.from(dataBase64, 'base64');
    const r = await pool.query(
      `INSERT INTO kb_expense_files (expense_id, filename, mimetype, size, data)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, expense_id, filename, mimetype, size`,
      [req.params.id, filename, mimetype || 'application/octet-stream', buf.length, buf]
    );
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/kb/files/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT filename, mimetype, data FROM kb_expense_files WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    const f = r.rows[0];
    res.setHeader('Content-Type', f.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.filename)}"`);
    res.send(f.data);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/kb/files/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM kb_expense_files WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── KPI-rapportering ──────────────────────────────────────────────────────────
// Lag A = maskintal (leveres af rapport-pipelinen eller tastes af Tommy).
// Lag B = ét tal pr. ansvarlig, indsendt på et personligt link inden fredag 12.
// Piloten tester rytmen, ikke resultaterne — derfor logger vi også hvilke tal
// der blev åbnet på mandagsmødet og hvilke beslutninger de førte til.

const KPI_TZ = 'Europe/Copenhagen';

// Wall-clock i København, uafhængigt af serverens egen tidszone.
const cphParts = (d = new Date()) => {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: KPI_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, weekday: p.weekday };
};

// Zonens offset (ms) på et givet tidspunkt — bruges til at gå fra vægur til instant.
const cphOffsetMs = (date) => {
  const p = cphParts(date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(date.getTime() / 60000) * 60000;
};

// Det UTC-instant hvor klokken i København er (y-m-d hh:mm). To runder fanger
// sommertidsskiftene, hvor det første gæt kan lande i den forkerte offset.
const cphInstant = (y, m, d, hh, mm) => {
  let ts = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) ts = Date.UTC(y, m - 1, d, hh, mm) - cphOffsetMs(new Date(ts));
  return new Date(ts);
};

const isoWeekKeyOf = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((dt.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

// Mandagen i en ISO-uge. Jan 4 ligger altid i uge 1.
const isoWeekMonday = (key) => {
  const [ys, ws] = String(key).split('-W');
  const jan4 = new Date(Date.UTC(+ys, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const week1 = Date.UTC(+ys, 0, 4 - day + 1);
  return new Date(week1 + (+ws - 1) * 7 * 86400000);
};

const kpiPeriodType = (p) =>
  /^\d{4}-W\d{2}$/.test(p) ? 'weekly' : /^\d{4}-Q\d$/.test(p) ? 'quarterly' : /^\d{4}-\d{2}$/.test(p) ? 'monthly' : null;

const kpiCurrentPeriod = (cadence = 'weekly') => {
  const p = cphParts();
  if (cadence === 'monthly') return `${p.year}-${String(p.month).padStart(2, '0')}`;
  if (cadence === 'quarterly') return `${p.year}-Q${Math.ceil(p.month / 3)}`;
  return isoWeekKeyOf(p.year, p.month, p.day);
};

const kpiShiftPeriod = (period, delta) => {
  const type = kpiPeriodType(period);
  if (type === 'weekly') {
    const d = new Date(isoWeekMonday(period).getTime() + delta * 7 * 86400000);
    return isoWeekKeyOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (type === 'monthly') {
    const [y, m] = period.split('-').map(Number);
    const t = (y * 12 + (m - 1)) + delta;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  }
  if (type === 'quarterly') {
    const [y, q] = period.split('-Q').map(Number);
    const t = (y * 4 + (q - 1)) + delta;
    return `${Math.floor(t / 4)}-Q${(t % 4) + 1}`;
  }
  return period;
};

// Ugens deadline: fredag kl. 12 i København. Måneden lukkes den 7. i den næste.
const kpiDeadline = (period) => {
  const type = kpiPeriodType(period);
  if (type === 'weekly') {
    const fri = new Date(isoWeekMonday(period).getTime() + 4 * 86400000);
    return cphInstant(fri.getUTCFullYear(), fri.getUTCMonth() + 1, fri.getUTCDate(), 12, 0);
  }
  if (type === 'monthly') {
    const next = kpiShiftPeriod(period, 1).split('-').map(Number);
    return cphInstant(next[0], next[1], 7, 12, 0);
  }
  return null;
};

const kpiPeriodLabel = (period) => {
  const type = kpiPeriodType(period);
  if (type !== 'weekly') return period;
  const mon = isoWeekMonday(period);
  const sun = new Date(mon.getTime() + 6 * 86400000);
  const f = (d) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  return `Uge ${period.split('-W')[1]} · ${f(mon)}–${f(sun)}`;
};

// ── Registret: de tal onepagerne definerer ────────────────────────────────────
// Tal der består af to størrelser (creative hit rate + spend, EBITDA + margin,
// stock-out + tabt omsætning) står som to rækker. Ét felt = ét tal.
const KPI_SEED_OWNERS = [
  { name: "Content / social", func: "Content / social", sort: 1, active: true },
  { name: "Creative",         func: "Creative",         sort: 2, active: true },
  { name: "Influencer",       func: "Influencer",       sort: 3, active: true },
  { name: "Kundeservice",     func: "Kundeservice",     sort: 4, active: true },
  { name: "Lager / indkøb",   func: "Lager / indkøb",   sort: 5, active: true },
  { name: "B2B",              func: "B2B",              sort: 6, active: false },
];

const KPI_SEED_METRICS = [
  // Lag A — ugentligt, trækkes af systemerne
  { key: "net_sales_growth",       label: "Net sales — vækst vs. sidste år", unit: "%",     func: "Salg",           source: "Shopify",                    layer: "A", cadence: "weekly", sort: 1,  definition: "Vækst i % mod samme uge sidste år, pr. marked." },
  { key: "mer_all_channel",        label: "MER, all-channel",                unit: "x",     func: "Marketing",      source: "Windsor + Shopify",          layer: "A", cadence: "weekly", sort: 2,  definition: "Shopify-omsætning ÷ alt annonceforbrug. ≥2,0 skalér · 1,7–2,0 hold · <1,7 skær." },
  { key: "new_customer_share",     label: "Nye kunders andel af omsætning",  unit: "%",     func: "Marketing",      source: "Shopify",                    layer: "A", cadence: "weekly", sort: 3,  definition: "Står altid ved siden af MER — MER kan rammes ved at skære volumen." },
  { key: "full_price_share",       label: "Full-price-andel",                unit: "%",     func: "Marketing",      source: "Shopify",                    layer: "A", cadence: "weekly", sort: 4,  definition: "Andel af omsætning solgt uden rabatkode." },
  { key: "cvr_mobile",             label: "Konverteringsrate — mobil",       unit: "%",     func: "Marketing",      source: "Shopify",                    layer: "A", cadence: "weekly", sort: 5,  definition: "Mobil opgøres separat fra desktop." },
  { key: "aov",                    label: "AOV",                             unit: "EUR",   func: "Marketing",      source: "Shopify",                    layer: "A", cadence: "weekly", sort: 6,  definition: "Gennemsnitlig ordreværdi." },
  { key: "creative_hit_rate",      label: "Creative hit rate",               unit: "%",     func: "Creative",       source: "Ad tracker",                 layer: "A", cadence: "weekly", sort: 7,  definition: "Andel af nye ads der slår kontrollen." },
  { key: "spend_share_new_ads",    label: "Spend på ads under 30 dage",      unit: "%",     func: "Creative",       source: "Ad tracker",                 dir: "neutral", layer: "A", cadence: "weekly", sort: 8,  definition: "Andel af forbrug på ads yngre end 30 dage — måler annoncetræthed." },
  { key: "flow_revenue",           label: "Flowomsætning",                   unit: "EUR",   func: "Marketing",      source: "Klaviyo",                    layer: "A", cadence: "weekly", sort: 9,  definition: "Omsætning fra automatiserede flows." },
  { key: "contacts_per_100",       label: "Kontakter pr. 100 ordrer",        unit: "antal", func: "Kundeservice",   source: "Gorgias + Shopify",          dir: "down", layer: "A", cadence: "weekly", sort: 10, definition: "Henvendelser divideret med ordrer × 100." },
  { key: "stockout_rate",          label: "Stock-out-rate, top-20 SKU'er",   unit: "%",     func: "Lager / indkøb", source: "Shopify + Inventory Planner", dir: "down", layer: "A", cadence: "weekly", sort: 11, definition: "Andel af top-20 SKU'er der var udsolgt i ugen." },
  { key: "stockout_lost_revenue",  label: "Tabt omsætning ved stock-out",    unit: "EUR",   func: "Lager / indkøb", source: "Shopify + Inventory Planner", dir: "down", layer: "A", cadence: "weekly", sort: 12, definition: "Estimat. Det eneste sted tabt salg bliver synligt." },

  // Lag B — ugentligt, ét tal pr. ansvarlig, fredag inden 12
  { key: "posts_published", label: "Posts publiceret",         unit: "antal", func: "Content / social", owner: "Content / social", layer: "B", cadence: "weekly", sort: 21, definition: "Feed + reels. Stories tæller ikke med." },
  { key: "new_ads_live",    label: "Nye ads sat live",         unit: "antal", func: "Creative",         owner: "Creative",         layer: "B", cadence: "weekly", sort: 22, definition: "Ads der er gået live i ugen — ikke ads der er briefet." },
  { key: "giftings_sent",   label: "Giftings sendt",           unit: "antal", func: "Influencer",       owner: "Influencer",       layer: "B", cadence: "weekly", sort: 23, definition: "Antal pakker afsendt til influencere i ugen." },
  { key: "ugc_received",    label: "Tags / UGC modtaget",      unit: "antal", func: "Influencer",       owner: "Influencer",       layer: "B", cadence: "weekly", sort: 24, definition: "Stykker indhold vi har modtaget eller er tagget i." },
  { key: "defect_tickets",  label: "Defekt-tickets",           unit: "antal", func: "Kundeservice",     owner: "Kundeservice",     dir: "down", layer: "B", cadence: "weekly", sort: 25, definition: "Tickets om defekt vare. Vores tidligste varsel om et leverandørproblem." },
  { key: "pos_delayed",     label: "PO'er forsinket vs. plan", unit: "antal", func: "Lager / indkøb",   owner: "Lager / indkøb",   dir: "down", layer: "B", cadence: "weekly", sort: 26, definition: "Antal indkøbsordrer der er bagud i forhold til plan." },
  { key: "b2b_dialogs",     label: "Aktive forhandlerdialoger", unit: "antal", func: "B2B",             owner: "B2B",              layer: "B", cadence: "weekly", sort: 27, active: false, definition: "Åbne dialoger med forhandlere. Kun når B2B er aktivt." },

  // Månedligt — for langsomme til en uge
  { key: "ebitda_eur",        label: "Profit — EBITDA",          unit: "EUR", func: "Finance",      source: "P&L",       layer: "A", cadence: "monthly", sort: 41, definition: "Begge dele opgøres: beløb og margin. Kun margin kan rammes ved at krympe." },
  { key: "ebitda_margin",     label: "EBITDA-margin",            unit: "%",   func: "Finance",      source: "P&L",       layer: "A", cadence: "monthly", sort: 42, definition: "EBITDA i % af omsætning." },
  { key: "revenue_vs_budget", label: "Omsætning mod budget",     unit: "%",   func: "Finance",      source: "P&L",       layer: "A", cadence: "monthly", sort: 43, definition: "Afvigelse i % mod budget." },
  { key: "return_rate",       label: "Returrate",                unit: "%",   func: "Kundeservice", source: "Shopify",   dir: "down", layer: "A", cadence: "monthly", sort: 44, definition: "Lander 2–4 uger forsinket. Derfor ikke på ugerapporten — en stærk salgsuge ser automatisk pæn ud." },
  { key: "csat",              label: "Kundetilfredshed (CSAT)",  unit: "",    func: "Kundeservice", source: "Gorgias",   layer: "B", cadence: "monthly", owner: "Kundeservice", sort: 45, definition: "Pr. henvendelsesårsag." },
  { key: "trustpilot_score",  label: "Trustpilot-score",         unit: "",    func: "Kundeservice", source: "Trustpilot", layer: "B", cadence: "monthly", owner: "Kundeservice", sort: 46, definition: "Samlet score." },
  { key: "trustpilot_count",  label: "Trustpilot-anmeldelser",   unit: "antal", func: "Kundeservice", source: "Trustpilot", layer: "B", cadence: "monthly", owner: "Kundeservice", sort: 47, definition: "Antal anmeldelser i måneden." },
  { key: "culture_score",     label: "CAINTÉ Culture Score",     unit: "",    func: "HR",           source: "Survey",    layer: "B", cadence: "monthly", sort: 48, definition: "Fem spørgsmål · skala 1–5 · anonym · kun samlet gennemsnit." },

  // Kvartalsvis — brandtal. Ligger i registret, aktiveres når piloten er bestået.
  { key: "unpaid_traffic_share", label: "Ubetalt trafik i % af omsætning", unit: "%",   func: "Brand", source: "Shopify + GA", layer: "A", cadence: "quarterly", active: false, sort: 61, definition: "Direkte + organisk + brandsøgning. Kommer kunderne af sig selv?" },
  { key: "branded_search_index", label: "Branded søgevolumen (indeks)",    unit: "",    func: "Brand", source: "GSC",          layer: "A", cadence: "quarterly", active: false, sort: 62, definition: "Indekseret mod baseline." },
  { key: "campaign_days",        label: "Kampagnedage pr. år",             unit: "antal", func: "Brand", source: "Manuel",     dir: "neutral", layer: "B", cadence: "quarterly", active: false, sort: 63, definition: "Brand ejer loftet; performance styrer forbruget inden for det." },
  { key: "discount_depth",       label: "Rabatdybde",                      unit: "%",   func: "Brand", source: "Shopify",      dir: "down", layer: "A", cadence: "quarterly", active: false, sort: 64, definition: "Gennemsnitlig rabat på kampagnedage." },
  { key: "repeat_purchase",      label: "Gentagelseskøb",                  unit: "%",   func: "Brand", source: "Shopify",      layer: "A", cadence: "quarterly", active: false, sort: 65, definition: "Andel kunder der køber igen." },
  { key: "aov_returning",        label: "AOV — returnerende kunder",       unit: "EUR", func: "Brand", source: "Shopify",      layer: "A", cadence: "quarterly", active: false, sort: 66, definition: "Ordreværdi for kunder der har købt før." },
];

const kpiToken = () => crypto.randomBytes(9).toString('base64url');

async function initKpi() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_owners (
      id SERIAL PRIMARY KEY,
      brand TEXT NOT NULL DEFAULT 'cainte',
      name TEXT NOT NULL,
      func TEXT DEFAULT '',
      slack_handle TEXT DEFAULT '',
      token TEXT UNIQUE NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS kpi_metrics (
      id SERIAL PRIMARY KEY,
      brand TEXT NOT NULL DEFAULT 'cainte',
      metric_key TEXT NOT NULL,
      label TEXT NOT NULL,
      unit TEXT DEFAULT '',
      definition TEXT DEFAULT '',
      layer TEXT NOT NULL DEFAULT 'A',
      cadence TEXT NOT NULL DEFAULT 'weekly',
      direction TEXT,
      func TEXT DEFAULT '',
      source TEXT DEFAULT '',
      owner_id INTEGER REFERENCES kpi_owners(id) ON DELETE SET NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS kpi_metrics_brand_key ON kpi_metrics (brand, metric_key);
    ALTER TABLE kpi_metrics ADD COLUMN IF NOT EXISTS direction TEXT;
    CREATE TABLE IF NOT EXISTS kpi_entries (
      id SERIAL PRIMARY KEY,
      metric_id INTEGER NOT NULL REFERENCES kpi_metrics(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      value NUMERIC,
      note TEXT DEFAULT '',
      submitted_by TEXT DEFAULT '',
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      on_time BOOLEAN NOT NULL DEFAULT TRUE,
      source TEXT DEFAULT 'manual'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS kpi_entries_metric_period ON kpi_entries (metric_id, period);
    CREATE TABLE IF NOT EXISTS kpi_decisions (
      id SERIAL PRIMARY KEY,
      brand TEXT NOT NULL DEFAULT 'cainte',
      metric_id INTEGER REFERENCES kpi_metrics(id) ON DELETE SET NULL,
      period TEXT NOT NULL,
      body TEXT NOT NULL,
      author TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS kpi_views (
      id SERIAL PRIMARY KEY,
      metric_id INTEGER NOT NULL REFERENCES kpi_metrics(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS kpi_reminders (
      id SERIAL PRIMARY KEY,
      period TEXT NOT NULL,
      kind TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS kpi_reminders_period_kind ON kpi_reminders (period, kind);
  `);

  // Seed én gang pr. brand. ON CONFLICT DO NOTHING gør boot idempotent, så
  // rettelser i registret laves i appen — ikke ved at ændre listen ovenfor.
  for (const brand of BRANDS) {
    for (const o of KPI_SEED_OWNERS) {
      await pool.query(
        `INSERT INTO kpi_owners (brand, name, func, token, active, sort_order)
         SELECT $1,$2,$3,$4,$5,$6
         WHERE NOT EXISTS (SELECT 1 FROM kpi_owners WHERE brand=$1 AND name=$2)`,
        [brand, o.name, o.func, kpiToken(), o.active !== false, o.sort]
      );
    }
    const owners = await pool.query('SELECT id, name FROM kpi_owners WHERE brand=$1', [brand]);
    const ownerId = (name) => (owners.rows.find(r => r.name === name) || {}).id || null;
    for (const m of KPI_SEED_METRICS) {
      await pool.query(
        `INSERT INTO kpi_metrics (brand, metric_key, label, unit, definition, layer, cadence, direction, func, source, owner_id, active, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (brand, metric_key) DO NOTHING`,
        [brand, m.key, m.label, m.unit || '', m.definition || '', m.layer, m.cadence, m.dir || 'up',
         m.func || '', m.source || '', m.owner ? ownerId(m.owner) : null, m.active !== false, m.sort || 0]
      );
      // Kolonnen kom til efter første deploy — fyld den uden at overskrive
      // en retning nogen har rettet i appen.
      await pool.query(
        'UPDATE kpi_metrics SET direction=$3 WHERE brand=$1 AND metric_key=$2 AND direction IS NULL',
        [brand, m.key, m.dir || 'up']
      );
    }
  }
}

const mapKpiMetric = (r) => ({ ...r, value: undefined, sort_order: r.sort_order });
const kpiNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// Hele billedet for én periode. Frontenden udleder resten.
app.get('/api/kpi/data', async (req, res) => {
  try {
    const brand = brandOf(req);
    const period = req.query.period || kpiCurrentPeriod('weekly');
    const type = kpiPeriodType(period);
    if (!type) return res.status(400).json({ error: 'ugyldig periode' });

    const history = [];
    for (let i = 7; i >= 0; i--) history.push(kpiShiftPeriod(period, -i));

    const [metrics, owners, entries, decisions, views] = await Promise.all([
      pool.query('SELECT * FROM kpi_metrics WHERE brand=$1 ORDER BY sort_order, id', [brand]),
      pool.query('SELECT * FROM kpi_owners WHERE brand=$1 ORDER BY sort_order, id', [brand]),
      pool.query(
        `SELECT e.* FROM kpi_entries e JOIN kpi_metrics m ON m.id=e.metric_id
         WHERE m.brand=$1 AND e.period = ANY($2)`, [brand, history]),
      pool.query('SELECT * FROM kpi_decisions WHERE brand=$1 ORDER BY created_at DESC LIMIT 200', [brand]),
      pool.query(
        `SELECT v.metric_id, COUNT(*)::int AS views FROM kpi_views v JOIN kpi_metrics m ON m.id=v.metric_id
         WHERE m.brand=$1 GROUP BY v.metric_id`, [brand]),
    ]);

    const deadline = kpiDeadline(period);
    res.json({
      period,
      periodType: type,
      periodLabel: kpiPeriodLabel(period),
      history,
      deadline: deadline ? deadline.toISOString() : null,
      past: deadline ? Date.now() > deadline.getTime() : false,
      metrics: metrics.rows,
      owners: owners.rows,
      entries: entries.rows,
      decisions: decisions.rows,
      views: views.rows,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Upsert af ét tal. on_time falder aldrig tilbage til true: er ugen først
// leveret for sent, tæller en senere rettelse stadig som for sent.
async function kpiSaveEntry({ metricId, period, value, note, by, source }) {
  const deadline = kpiDeadline(period);
  const onTime = !deadline || Date.now() <= deadline.getTime();
  const r = await pool.query(
    `INSERT INTO kpi_entries (metric_id, period, value, note, submitted_by, submitted_at, on_time, source)
     VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7)
     ON CONFLICT (metric_id, period) DO UPDATE SET
       value=EXCLUDED.value, note=EXCLUDED.note, submitted_by=EXCLUDED.submitted_by,
       submitted_at=NOW(), on_time = kpi_entries.on_time AND EXCLUDED.on_time,
       source=EXCLUDED.source
     RETURNING *`,
    [metricId, period, kpiNum(value), note || '', by || '', onTime, source || 'manual']
  );
  return r.rows[0];
}

app.put('/api/kpi/entries', async (req, res) => {
  const { metric_id, period, value, note, submitted_by } = req.body;
  if (!metric_id || !period) return res.status(400).json({ error: 'metric_id og period er påkrævet' });
  try {
    if (value === null || value === '') {
      await pool.query('DELETE FROM kpi_entries WHERE metric_id=$1 AND period=$2', [metric_id, period]);
      return res.json({ success: true, cleared: true });
    }
    res.json(await kpiSaveEntry({ metricId: metric_id, period, value, note, by: submitted_by, source: 'manual' }));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Lag A ind fra rapport-pipelinen ───────────────────────────────────────────
// POST { period, values: { metric_key: tal } }. Kræver x-api-key når
// KPI_INGEST_KEY er sat i miljøet.
app.post('/api/kpi/ingest', async (req, res) => {
  const key = process.env.KPI_INGEST_KEY;
  if (key && req.get('x-api-key') !== key) return res.status(401).json({ error: 'ugyldig nøgle' });
  const { period, values } = req.body || {};
  if (!period || !values || typeof values !== 'object') return res.status(400).json({ error: 'period og values er påkrævet' });
  try {
    const brand = brandOf(req);
    const rows = await pool.query('SELECT id, metric_key FROM kpi_metrics WHERE brand=$1', [brand]);
    const byKey = Object.fromEntries(rows.rows.map(r => [r.metric_key, r.id]));
    const written = [], unknown = [];
    for (const [k, v] of Object.entries(values)) {
      if (!byKey[k]) { unknown.push(k); continue; }
      await kpiSaveEntry({ metricId: byKey[k], period, value: v, by: 'pipeline', source: 'ingest' });
      written.push(k);
    }
    res.json({ period, written, unknown });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Rent udtræk til rapportgeneratoren — manglende tal står som null, aldrig 0.
app.get('/api/kpi/report/:period', async (req, res) => {
  try {
    const brand = brandOf(req);
    const period = req.params.period;
    if (!kpiPeriodType(period)) return res.status(400).json({ error: 'ugyldig periode' });
    const cadence = kpiPeriodType(period);
    const r = await pool.query(
      `SELECT m.metric_key, m.label, m.unit, m.layer, m.func, m.source, m.definition,
              e.value, e.submitted_at, e.on_time
         FROM kpi_metrics m
         LEFT JOIN kpi_entries e ON e.metric_id=m.id AND e.period=$2
        WHERE m.brand=$1 AND m.active AND m.cadence=$3
        ORDER BY m.sort_order, m.id`, [brand, period, cadence]);
    res.json({
      period, label: kpiPeriodLabel(period),
      metrics: r.rows.map(x => ({
        key: x.metric_key, label: x.label, unit: x.unit, layer: x.layer,
        func: x.func, source: x.source, definition: x.definition,
        value: x.value === null ? null : Number(x.value),
        status: x.value === null ? 'missing' : (x.on_time ? 'ok' : 'late'),
        submittedAt: x.submitted_at,
      })),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Det personlige link ───────────────────────────────────────────────────────
// /r/<token> — ingen adgangskode, ingen navigation. Kun denne persons felter for
// denne periode. Token er adgangen; roteres fra Ansvarlige-fanen.
app.get('/api/kpi/me/:token', async (req, res) => {
  try {
    const oRes = await pool.query('SELECT * FROM kpi_owners WHERE token=$1', [req.params.token]);
    const owner = oRes.rows[0];
    if (!owner) return res.status(404).json({ error: 'ukendt link' });

    const cadence = req.query.cadence === 'monthly' ? 'monthly' : 'weekly';
    const period = req.query.period || kpiCurrentPeriod(cadence);
    const prev = kpiShiftPeriod(period, -1);
    const mRes = await pool.query(
      `SELECT * FROM kpi_metrics WHERE brand=$1 AND owner_id=$2 AND active AND cadence=$3 ORDER BY sort_order, id`,
      [owner.brand, owner.id, cadence]);
    const ids = mRes.rows.map(m => m.id);
    const eRes = ids.length
      ? await pool.query('SELECT * FROM kpi_entries WHERE metric_id = ANY($1) AND period = ANY($2)', [ids, [period, prev]])
      : { rows: [] };
    const at = (mid, p) => eRes.rows.find(e => e.metric_id === mid && e.period === p);
    const deadline = kpiDeadline(period);

    res.json({
      owner: { id: owner.id, name: owner.name, func: owner.func },
      period, periodLabel: kpiPeriodLabel(period),
      deadline: deadline ? deadline.toISOString() : null,
      past: deadline ? Date.now() > deadline.getTime() : false,
      fields: mRes.rows.map(m => ({
        id: m.id, label: m.label, unit: m.unit, definition: m.definition,
        value: at(m.id, period) ? Number(at(m.id, period).value) : null,
        last: at(m.id, prev) ? Number(at(m.id, prev).value) : null,
      })),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/kpi/me/:token', async (req, res) => {
  const { period, values, note } = req.body || {};
  if (!period || !values) return res.status(400).json({ error: 'period og values er påkrævet' });
  try {
    const oRes = await pool.query('SELECT * FROM kpi_owners WHERE token=$1', [req.params.token]);
    const owner = oRes.rows[0];
    if (!owner) return res.status(404).json({ error: 'ukendt link' });
    const mine = await pool.query('SELECT id FROM kpi_metrics WHERE owner_id=$1', [owner.id]);
    const allowed = new Set(mine.rows.map(r => r.id));
    for (const [id, v] of Object.entries(values)) {
      if (!allowed.has(Number(id))) continue;
      if (v === '' || v === null) continue;
      await kpiSaveEntry({ metricId: Number(id), period, value: v, note: note || '', by: owner.name, source: 'manual' });
    }
    const deadline = kpiDeadline(period);
    res.json({ success: true, onTime: !deadline || Date.now() <= deadline.getTime() });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Ansvarlige ────────────────────────────────────────────────────────────────
app.post('/api/kpi/owners', async (req, res) => {
  const { name, func, slack_handle, active, sort_order } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'navn er påkrævet' });
  try {
    const r = await pool.query(
      `INSERT INTO kpi_owners (brand, name, func, slack_handle, token, active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [brandOf(req), String(name).trim(), func || '', slack_handle || '', kpiToken(), active !== false, sort_order || 99]);
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/kpi/owners/:id', async (req, res) => {
  const { name, func, slack_handle, active, sort_order } = req.body;
  try {
    const r = await pool.query(
      `UPDATE kpi_owners SET name=$1, func=$2, slack_handle=$3, active=$4, sort_order=$5 WHERE id=$6 RETURNING *`,
      [name, func || '', slack_handle || '', active !== false, sort_order || 0, req.params.id]);
    res.json(r.rows[0] || { success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/kpi/owners/:id/rotate', async (req, res) => {
  try {
    const r = await pool.query('UPDATE kpi_owners SET token=$1 WHERE id=$2 RETURNING *', [kpiToken(), req.params.id]);
    res.json(r.rows[0] || { success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/kpi/owners/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM kpi_owners WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Registret ─────────────────────────────────────────────────────────────────
app.post('/api/kpi/metrics', async (req, res) => {
  const { metric_key, label, unit, definition, layer, cadence, direction, func, source, owner_id, active, sort_order } = req.body;
  if (!label || !String(label).trim()) return res.status(400).json({ error: 'label er påkrævet' });
  try {
    const key = (metric_key || String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_')).slice(0, 60);
    const r = await pool.query(
      `INSERT INTO kpi_metrics (brand, metric_key, label, unit, definition, layer, cadence, direction, func, source, owner_id, active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [brandOf(req), key, String(label).trim(), unit || '', definition || '', layer || 'B', cadence || 'weekly',
       direction || 'up', func || '', source || '', owner_id || null, active !== false, sort_order || 99]);
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/kpi/metrics/:id', async (req, res) => {
  const { label, unit, definition, layer, cadence, direction, func, source, owner_id, active, sort_order } = req.body;
  try {
    const r = await pool.query(
      `UPDATE kpi_metrics SET label=$1, unit=$2, definition=$3, layer=$4, cadence=$5, direction=$6, func=$7, source=$8,
              owner_id=$9, active=$10, sort_order=$11 WHERE id=$12 RETURNING *`,
      [label, unit || '', definition || '', layer || 'B', cadence || 'weekly', direction || 'up', func || '', source || '',
       owner_id || null, active !== false, sort_order || 0, req.params.id]);
    res.json(r.rows[0] || { success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/kpi/metrics/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM kpi_metrics WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Pilot-instrumentering ─────────────────────────────────────────────────────
// Beslutningsporten spørger om tre ting efter måned 1. Uden de her tre logs er
// evalueringen en hukommelsesøvelse, og så består systemet altid sin egen eksamen.
app.post('/api/kpi/decisions', async (req, res) => {
  const { metric_id, period, body, author } = req.body;
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'beslutningen skal beskrives' });
  try {
    const r = await pool.query(
      `INSERT INTO kpi_decisions (brand, metric_id, period, body, author) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [brandOf(req), metric_id || null, period || kpiCurrentPeriod('weekly'), String(body).trim(), author || '']);
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/kpi/decisions/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM kpi_decisions WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/kpi/views', async (req, res) => {
  const { metric_id, period } = req.body;
  if (!metric_id) return res.status(400).json({ error: 'metric_id er påkrævet' });
  try {
    await pool.query('INSERT INTO kpi_views (metric_id, period) VALUES ($1,$2)', [metric_id, period || '']);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Evalueringsmødets side: de tre porte som tal, ikke som holdninger.
app.get('/api/kpi/pilot', async (req, res) => {
  try {
    const brand = brandOf(req);
    const weeks = Math.min(Math.max(parseInt(req.query.weeks, 10) || 4, 1), 26);
    const end = req.query.period || kpiCurrentPeriod('weekly');
    const periods = [];
    for (let i = weeks - 1; i >= 0; i--) periods.push(kpiShiftPeriod(end, -i));

    const [mRes, eRes, dRes, vRes] = await Promise.all([
      pool.query('SELECT * FROM kpi_metrics WHERE brand=$1 AND active AND cadence=$2 ORDER BY sort_order', [brand, 'weekly']),
      pool.query(
        `SELECT e.* FROM kpi_entries e JOIN kpi_metrics m ON m.id=e.metric_id
          WHERE m.brand=$1 AND e.period = ANY($2)`, [brand, periods]),
      pool.query('SELECT * FROM kpi_decisions WHERE brand=$1 AND period = ANY($2) ORDER BY created_at DESC', [brand, periods]),
      pool.query(
        `SELECT v.metric_id, COUNT(*)::int AS views FROM kpi_views v JOIN kpi_metrics m ON m.id=v.metric_id
          WHERE m.brand=$1 AND v.period = ANY($2) GROUP BY v.metric_id`, [brand, periods]),
    ]);

    const layerB = mRes.rows.filter(m => m.layer === 'B');
    const viewsBy = Object.fromEntries(vRes.rows.map(r => [r.metric_id, r.views]));

    // Port 2: en uge tæller kun som "holdt" hvis alle lag B-tal kom ind til tiden.
    const discipline = periods.map(p => {
      const rows = layerB.map(m => eRes.rows.find(e => e.metric_id === m.id && e.period === p));
      const submitted = rows.filter(Boolean).length;
      return {
        period: p, label: kpiPeriodLabel(p),
        expected: layerB.length, submitted,
        onTime: rows.filter(r => r && r.on_time).length,
        clean: layerB.length > 0 && rows.every(r => r && r.on_time),
      };
    });

    res.json({
      periods,
      decisions: dRes.rows,
      decisionCount: dRes.rows.length,
      discipline,
      cleanWeeks: discipline.filter(d => d.clean).length,
      unopened: mRes.rows.filter(m => !viewsBy[m.id]).map(m => ({ id: m.id, label: m.label, layer: m.layer, func: m.func })),
      gates: {
        used:       { pass: dRes.rows.length >= 3, value: dRes.rows.length, need: 3 },
        discipline: { pass: discipline.filter(d => d.clean).length >= 3, value: discipline.filter(d => d.clean).length, need: 3 },
      },
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── Påmindelser ───────────────────────────────────────────────────────────────
// Fredag 09:00: link ud til hver ansvarlig. Mandag 07:00: rapporten er klar.
// Der sendes bevidst ingen rykkere — beslutningsport 2 spørger om tallene kom
// ind *uden* rykkere, og en automatisk rykker ville gøre det umuligt at måle.
// Kører in-process hvert 5. minut; kpi_reminders dedupliker på tværs af deploys.
async function kpiSlack(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url || typeof fetch !== 'function') return false;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    return r.ok;
  } catch (e) { console.error('Slack:', e.message); return false; }
}

async function kpiTick() {
  try {
    const p = cphParts();
    const base = process.env.PUBLIC_URL || 'https://ops.cainte.com';
    const week = isoWeekKeyOf(p.year, p.month, p.day);

    if (p.weekday === 'Fri' && p.hour === 9 && p.minute < 10) {
      const claim = await pool.query(
        `INSERT INTO kpi_reminders (period, kind) VALUES ($1,'friday')
         ON CONFLICT (period, kind) DO NOTHING RETURNING id`, [week]);
      if (claim.rows[0]) {
        const owners = await pool.query(
          `SELECT DISTINCT o.* FROM kpi_owners o JOIN kpi_metrics m ON m.owner_id=o.id
            WHERE o.active AND m.active AND m.cadence='weekly' ORDER BY o.sort_order`);
        const lines = owners.rows.map(o => `• ${o.slack_handle || o.name} — ${base}/r/${o.token}`);
        await kpiSlack([`*${kpiPeriodLabel(week)} — dit tal inden kl. 12*`, '', ...lines, '',
          'Ét felt, under et minut. Tal der ikke kommer ind står som _manglende_ på mandag — ikke som nul.'].join('\n'));
      }
    }

    if (p.weekday === 'Mon' && p.hour === 7 && p.minute < 10) {
      const last = kpiShiftPeriod(week, -1);
      const claim = await pool.query(
        `INSERT INTO kpi_reminders (period, kind) VALUES ($1,'monday')
         ON CONFLICT (period, kind) DO NOTHING RETURNING id`, [last]);
      if (claim.rows[0]) {
        await kpiSlack(`*${kpiPeriodLabel(last)} er klar* — ${base}\n30 minutter, kun afvigelser.`);
      }
    }
  } catch (e) { console.error('kpiTick:', e.message); }
}

app.use(express.static(path.join(__dirname, '../dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`Server on port ${PORT}`));
  // Fredags- og mandagspåmindelser. Checkes hvert 5. minut.
  kpiTick();
  setInterval(kpiTick, 5 * 60 * 1000);
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
