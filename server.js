// JBV Investment Portal - Airtable Live Sync Server
// --------------------------------------------------
// Responsibilities:
// - Expose POST /airtable-webhook for Airtable webhook notifications
// - On webhook: fetch the updated record and its linked records, broadcast via WebSocket
// - Expose GET /api/data to return all Partner Investments records with linked data
// - Push realtime updates to clients over WebSockets and Server-Sent Events (SSE)
// - Use environment variables for sensitive configuration

require('dotenv').config();
const http = require('http');
const express = require('express');
const Airtable = require('airtable');
const { WebSocketServer } = require('ws');

// -------------------------
// Configuration
// -------------------------
// For local testing, the provided values are used as defaults.
// IMPORTANT: Remove defaults before deploying to production.
const PORT = process.env.PORT || 4000;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || 'patXzPUW8M8zz5CBL.43cb82fec8056115d16ed9fa34b1829cf8d2d329f63232a0cb783780f0fda67a';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appAswQzYFHzmwqGH';
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || 'Partner Investments';
const AIRTABLE_VIEW_ID = process.env.AIRTABLE_VIEW_ID || 'viwPcgizXhBX6Owg2';
// Optional shared secret to validate webhook requests
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || null; // e.g., set any string and send it in header X-Webhook-Secret

// Known linked relationships for Partner Investments
const LINKED_RELATIONSHIPS = {
  'Target Securities': 'Target Securities',
  'Partner': 'Partners',
  'Fund': 'JBV Entities',
  'PRIMARY CONTACT': 'Contacts'
};

// Init Airtable client
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// -------------------------
// Express app & HTTP server
// -------------------------
const app = express();
// Basic CORS for local development and the static HTML client
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Secret');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);

// -------------------------
// WebSocket server
// -------------------------
const wss = new WebSocketServer({ server });

function broadcastJSON(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === 1 /* WebSocket.OPEN */) {
      client.send(msg);
    }
  });
}

wss.on('connection', (socket) => {
  // Greet the client and hint at API usage
  socket.send(JSON.stringify({ type: 'welcome', message: 'Connected to JBV Investment Portal live updates' }));
});

// -------------------------
// Server-Sent Events (SSE)
// -------------------------
const sseClients = new Set(); // of { id, res }
let sseClientSeq = 1;

function sendSSE(res, { event, data }) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastSSE(event, data) {
  for (const client of sseClients) {
    try { sendSSE(client.res, { event, data }); } catch (e) { /* ignore */ }
  }
}

app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const client = { id: sseClientSeq++, res };
  sseClients.add(client);

  // Keep-alive ping
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(client);
  });

  // initial hello
  sendSSE(res, { event: 'ready', data: { ok: true } });
});

// -------------------------
// Airtable helpers
// -------------------------

// Utility: build filterByFormula for RECORD_ID() IN a list of IDs
function buildIdFilterFormula(ids) {
  const parts = ids.map((id) => `RECORD_ID() = '${id.replace(/'/g, "\\'")}'`);
  return parts.length === 1 ? parts[0] : `OR(${parts.join(', ')})`;
}

// Fetch multiple records by IDs from a table and return a map id -> { id, fields }
async function fetchRecordsByIds(tableName, ids) {
  if (!ids || ids.length === 0) return new Map();
  const unique = Array.from(new Set(ids));
  const results = new Map();

  // Airtable allows complex formulas; fetch in batches to avoid overly long URLs
  const BATCH = 15;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batchIds = unique.slice(i, i + BATCH);
    const formula = buildIdFilterFormula(batchIds);
    const records = await base(tableName)
      .select({ filterByFormula: formula })
      .all();
    records.forEach((r) => results.set(r.id, { id: r.id, fields: r.fields }));
  }

  return results;
}

// Track simple in-memory versions for optimistic concurrency.
const recordVersions = new Map(); // id -> number (ms)

function getVersion(id) {
  return recordVersions.get(id) || 0;
}
function setVersionNow(id) {
  const ts = Date.now();
  recordVersions.set(id, ts);
  return ts;
}

// Fetch a single Partner Investments record plus its linked records, expanding linked fields inside fields[]
async function fetchRecordWithLinks(recordId) {
  const record = await base(AIRTABLE_TABLE).find(recordId);
  const fields = record.fields || {};

  // Collect linked IDs by table
  const linkIdBuckets = {
    'Target Securities': [],
    'Partners': [],
    'JBV Entities': [],
    'Contacts': []
  };

  for (const [fieldName, targetTable] of Object.entries(LINKED_RELATIONSHIPS)) {
    const value = fields[fieldName];
    if (!value) continue;
    const ids = Array.isArray(value) ? value : [value];
    linkIdBuckets[targetTable].push(...ids);
  }

  // Fetch all linked tables
  const [targets, partners, funds, contacts] = await Promise.all([
    fetchRecordsByIds('Target Securities', linkIdBuckets['Target Securities']),
    fetchRecordsByIds('Partners', linkIdBuckets['Partners']),
    fetchRecordsByIds('JBV Entities', linkIdBuckets['JBV Entities']),
    fetchRecordsByIds('Contacts', linkIdBuckets['Contacts'])
  ]);

  // Assemble consolidated object
  const asArray = (v) => Array.isArray(v) ? v : (v != null ? [v] : []);
  const toDisplay = (rec) => rec ? ({ id: rec.id, displayName: rec.fields?.Name || rec.id, fields: rec.fields }) : null;

  // Expand linked fields inline for UI consumption
  const expandedFields = { ...fields };
  expandedFields['Target Securities'] = asArray(fields['Target Securities']).map((id) => toDisplay(targets.get(id))).filter(Boolean);
  expandedFields['Partner'] = asArray(fields['Partner']).map((id) => toDisplay(partners.get(id))).filter(Boolean);
  expandedFields['Fund'] = asArray(fields['Fund']).map((id) => toDisplay(funds.get(id))).filter(Boolean);
  expandedFields['PRIMARY CONTACT'] = asArray(fields['PRIMARY CONTACT']).map((id) => toDisplay(contacts.get(id))).filter(Boolean);

  const consolidated = {
    id: record.id,
    table: AIRTABLE_TABLE,
    fields: expandedFields,
    linked: {
      'Target Securities': asArray(fields['Target Securities']).map((id) => targets.get(id)).filter(Boolean),
      Partner: asArray(fields['Partner']).map((id) => partners.get(id)).filter(Boolean),
      Fund: asArray(fields['Fund']).map((id) => funds.get(id)).filter(Boolean),
      'PRIMARY CONTACT': asArray(fields['PRIMARY CONTACT']).map((id) => contacts.get(id)).filter(Boolean)
    },
    _updatedTime: setVersionNow(record.id)
  };

  return consolidated;
}

// Fetch all Partner Investments with linked data (one level deep)
async function fetchAllRecordsWithLinks() {
  const mainRecords = await base(AIRTABLE_TABLE)
    .select({ view: AIRTABLE_VIEW_ID })
    .all();

  // Collect all linked IDs upfront (per table) for efficient batch lookup
  const linkIds = {
    'Target Securities': new Set(),
    'Partners': new Set(),
    'JBV Entities': new Set(),
    'Contacts': new Set()
  };

  for (const rec of mainRecords) {
    const f = rec.fields || {};
    for (const [fieldName, targetTable] of Object.entries(LINKED_RELATIONSHIPS)) {
      const v = f[fieldName];
      if (!v) continue;
      const ids = Array.isArray(v) ? v : [v];
      ids.forEach((id) => linkIds[targetTable].add(id));
    }
  }

  const [targets, partners, funds, contacts] = await Promise.all([
    fetchRecordsByIds('Target Securities', Array.from(linkIds['Target Securities'])),
    fetchRecordsByIds('Partners', Array.from(linkIds['Partners'])),
    fetchRecordsByIds('JBV Entities', Array.from(linkIds['JBV Entities'])),
    fetchRecordsByIds('Contacts', Array.from(linkIds['Contacts']))
  ]);

  // Convert maps to simple getter function
  const getFrom = (map) => (ids) => (Array.isArray(ids) ? ids : (ids != null ? [ids] : [])).map((id) => map.get(id)).filter(Boolean);
  const getTargets = getFrom(targets);
  const getPartners = getFrom(partners);
  const getFunds = getFrom(funds);
  const getContacts = getFrom(contacts);

  const consolidated = mainRecords.map((r) => {
    const f = r.fields || {};
    const expandedFields = { ...f };
    expandedFields['Target Securities'] = getTargets(f['Target Securities']).map((x) => ({ id: x.id, displayName: x.fields?.Name || x.id, fields: x.fields }));
    expandedFields['Partner'] = getPartners(f['Partner']).map((x) => ({ id: x.id, displayName: x.fields?.Name || x.id, fields: x.fields }));
    expandedFields['Fund'] = getFunds(f['Fund']).map((x) => ({ id: x.id, displayName: x.fields?.Name || x.id, fields: x.fields }));
    expandedFields['PRIMARY CONTACT'] = getContacts(f['PRIMARY CONTACT']).map((x) => ({ id: x.id, displayName: x.fields?.Name || x.id, fields: x.fields }));

    const rec = {
      id: r.id,
      table: AIRTABLE_TABLE,
      fields: expandedFields,
      linked: {
        'Target Securities': getTargets(f['Target Securities']),
        Partner: getPartners(f['Partner']),
        Fund: getFunds(f['Fund']),
        'PRIMARY CONTACT': getContacts(f['PRIMARY CONTACT'])
      },
      _updatedTime: setVersionNow(r.id)
    };
    return rec;
  });

  return consolidated;
}

// -------------------------
// Routes
// -------------------------

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// GET all data for initial page load
app.get('/api/data', async (req, res) => {
  try {
    const data = await fetchAllRecordsWithLinks();
    res.json({ ok: true, count: data.length, data, records: data });
  } catch (err) {
    console.error('GET /api/data error:', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch Airtable data' });
  }
});

// POST webhook from Airtable
// Expected payload examples:
// - { "recordId": "recXXXX" }
// - { "recordIds": ["recA", "recB"] }
// - { "changed_record_ids": ["recA", "recB"] } // generic support
app.post('/airtable-webhook', async (req, res) => {
  try {
    // Optional webhook shared-secret check
    if (WEBHOOK_SECRET) {
      const provided = req.header('X-Webhook-Secret');
      if (!provided || provided !== WEBHOOK_SECRET) {
        return res.status(401).json({ ok: false, error: 'Invalid webhook secret' });
      }
    }

    const payload = req.body || {};
    let recordIds = [];
    if (payload.recordId) recordIds = [payload.recordId];
    else if (Array.isArray(payload.recordIds)) recordIds = payload.recordIds;
    else if (Array.isArray(payload.changed_record_ids)) recordIds = payload.changed_record_ids;

    if (!recordIds.length) {
      // Nothing actionable; acknowledge
      return res.json({ ok: true, message: 'No record IDs in payload' });
    }

    // Fetch consolidated objects for each record
    const updates = [];
    for (const id of recordIds) {
      try {
        const consolidated = await fetchRecordWithLinks(id);
        updates.push(consolidated);
      } catch (innerErr) {
        console.error(`Failed to fetch record ${id}:`, innerErr.message);
      }
    }

    if (updates.length) {
      broadcastJSON({ type: 'record_update', records: updates });
      for (const rec of updates) {
        broadcastSSE('airtable.update', { tableId: AIRTABLE_TABLE, record: rec });
      }
    }

    return res.json({ ok: true, processed: updates.length });
  } catch (err) {
    console.error('POST /airtable-webhook error:', err);
    res.status(500).json({ ok: false, error: 'Webhook processing failed' });
  }
});

// -------------------------
// Editing endpoint with optimistic concurrency
// -------------------------
app.put('/api/record', async (req, res) => {
  try {
    const { tableIdOrName, recordId, fields, lastSeenModifiedTime } = req.body || {};
    if (!tableIdOrName || !recordId || !fields || typeof fields !== 'object') {
      return res.status(400).json({ ok: false, error: 'Missing tableIdOrName, recordId, or fields' });
    }
    if (tableIdOrName !== AIRTABLE_TABLE) {
      return res.status(400).json({ ok: false, error: 'Unsupported table' });
    }

    // Conflict detection (best-effort, in-memory)
    const serverVersion = getVersion(recordId);
    if (lastSeenModifiedTime && Number(lastSeenModifiedTime) !== Number(serverVersion)) {
      // Return latest version to client
      const latest = await fetchRecordWithLinks(recordId);
      return res.status(409).json(latest);
    }

    // Push update to Airtable
    const updated = await base(AIRTABLE_TABLE).update(recordId, fields, { typecast: true });
    // Read back with links and assign version
    const result = await fetchRecordWithLinks(updated.id);

    // Broadcast update to listeners
    broadcastJSON({ type: 'record_update', records: [result] });
    broadcastSSE('airtable.update', { tableId: AIRTABLE_TABLE, record: result });

    return res.json(result);
  } catch (err) {
    console.error('PUT /api/record error:', err);
    res.status(500).json({ ok: false, error: 'Failed to save record' });
  }
});

// -------------------------
// Column visibility rules (persisted to JSON file)
// -------------------------
const fs = require('fs');
const path = require('path');
const RULES_PATH = path.join(process.cwd(), 'data', 'visibility-rules.json');

function ensureDataDir() {
  const dir = path.dirname(RULES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadRules() {
  try {
    const raw = fs.readFileSync(RULES_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveRules(rules) {
  ensureDataDir();
  fs.writeFileSync(RULES_PATH, JSON.stringify(rules, null, 2));
}

app.get('/api/visibility/rules', (req, res) => {
  try {
    const rules = loadRules();
    res.json(rules);
  } catch (err) {
    console.error('GET /api/visibility/rules error:', err);
    res.status(500).json({ ok: false, error: 'Failed to load rules' });
  }
});

app.post('/api/visibility/rules', (req, res) => {
  try {
    const { tableId, fieldId, visibleToLP, visibleToPartners, notes } = req.body || {};
    if (!tableId || !fieldId) return res.status(400).json({ ok: false, error: 'Missing tableId or fieldId' });
    const rules = loadRules();
    const idx = rules.findIndex((r) => r.tableId === tableId && r.fieldId === fieldId);
    const rule = { tableId, fieldId, visibleToLP: !!visibleToLP, visibleToPartners: !!visibleToPartners, notes: notes || '' };
    if (idx === -1) rules.push(rule); else rules[idx] = rule;
    saveRules(rules);
    res.json(rule);
  } catch (err) {
    console.error('POST /api/visibility/rules error:', err);
    res.status(500).json({ ok: false, error: 'Failed to save rule' });
  }
});

// -------------------------
// Startup
// -------------------------
server.listen(PORT, () => {
  console.log(`JBV Investment Portal backend running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log(' - GET /api/data');
  console.log(' - POST /airtable-webhook');
  console.log(' - PUT /api/record');
  console.log(' - GET/POST /api/visibility/rules');
  console.log('SSE: http://localhost:' + PORT + '/sse');
  console.log('WebSocket: ws://localhost:' + PORT);
});
