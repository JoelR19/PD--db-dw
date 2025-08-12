// My server.js esta pobrecito pero funciona :) By: Joel Restrepo
// Endpoints:
// GET  /api/health
// GET  /api/clients
// GET  /api/invoices
// GET  /api/transactions
// GET  /api/invoice-balances
// POST /api/clients
// POST /api/invoices
// POST /api/transactions
// DELETE /api/clients/:id
// DELETE /api/invoices/:id
// DELETE /api/transactions/:id

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASS = '',
  DB_NAME = 'pd_joel_restrepo_tayrona',
  PORT = '3000'
} = process.env;

const app = express();
app.use(cors());
app.use(express.json());

// 1) Single connection
let conn;
async function connectOnce() {
  conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    multipleStatements: false
  });
  await conn.query("SET time_zone = '+00:00'");
  console.log(`✔ Connected to MySQL and DB ${DB_NAME}`);
}

async function q(sql, params = []) {
  if (!conn) throw new Error('No DB connection');
  const [rows] = await conn.execute(sql, params);
  return rows;
}

// 2) Read routes
app.get('/api/health', async (_req, res) => {
  try {
    await q('SELECT 1');
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

app.get('/api/clients', async (req, res) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10), 1), 500);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10), 0);

    let sql = `SELECT id, document_number, full_name, address_line, phone_number, email, created_at
               FROM clients`;
    const params = [];
    if (search) {
      sql += ` WHERE full_name LIKE ? OR document_number LIKE ?`;
      const like = `%${search}%`;
      params.push(like, like);
    }
    sql += ` ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`;
    res.json(await q(sql, params));
  } catch (e) {
    console.error('GET /api/clients', e);
    res.status(500).json({ message: e.message });
  }
});

app.get('/api/invoices', async (req, res) => {
  try {
    const clientId = req.query.client_id ? Number(req.query.client_id) : null;
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10), 1), 500);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10), 0);

    let sql = `
      SELECT i.id, i.invoice_number, i.client_id, i.billing_period, i.amount_billed, i.created_at,
             c.full_name
      FROM invoices i
      JOIN clients c ON c.id = i.client_id
      WHERE 1=1`;
    const params = [];
    if (clientId) {
      sql += ` AND i.client_id = ?`;
      params.push(clientId);
    }
    if (from) {
      sql += ` AND i.billing_period >= ?`;
      params.push(from);
    }
    if (to) {
      sql += ` AND i.billing_period <= ?`;
      params.push(to);
    }
    sql += ` ORDER BY i.billing_period DESC, i.invoice_number
             LIMIT ${limit} OFFSET ${offset}`;
    res.json(await q(sql, params));
  } catch (e) {
    console.error('GET /api/invoices', e);
    res.status(500).json({ message: e.message });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const status = String(req.query.status ?? '').trim();
    const invoice = String(req.query.invoice_number ?? '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10), 1), 500);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10), 0);

    let sql = `
      SELECT t.id, t.gateway_txn_id, t.txn_datetime, t.amount, t.status, t.txn_type,
             t.client_id, t.invoice_id, t.platform_id,
             i.invoice_number, p.name AS platform_name
      FROM transactions t
      LEFT JOIN invoices  i ON i.id = t.invoice_id
      LEFT JOIN platforms p ON p.id = t.platform_id
      WHERE 1=1`;
    const params = [];
    if (status) {
      sql += ` AND t.status = ?`;
      params.push(status);
    }
    if (invoice) {
      sql += ` AND i.invoice_number = ?`;
      params.push(invoice);
    }
    sql += ` ORDER BY t.txn_datetime DESC, t.id DESC
             LIMIT ${limit} OFFSET ${offset}`;
    res.json(await q(sql, params));
  } catch (e) {
    console.error('GET /api/transactions', e);
    res.status(500).json({ message: e.message });
  }
});

app.get('/api/invoice-balances', async (req, res) => {
  try {
    const clientId = req.query.client_id ? Number(req.query.client_id) : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '100', 10), 1), 500);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10), 0);

    let sql = `
      SELECT b.id, b.invoice_number, b.client_id, b.billing_period,
             b.amount_billed, b.amount_paid, b.balance_due, c.full_name
      FROM invoice_balances b
      JOIN clients c ON c.id = b.client_id
      WHERE 1=1`;
    const params = [];
    if (clientId) {
      sql += ` AND b.client_id = ?`;
      params.push(clientId);
    }
    sql += ` ORDER BY b.billing_period DESC, b.invoice_number
             LIMIT ${limit} OFFSET ${offset}`;
    res.json(await q(sql, params));
  } catch (e) {
    console.error('GET /api/invoice-balances', e);
    res.status(500).json({ message: e.message });
  }
});

// 3) Create (POST) and delete (DELETE) routes

// Clients: create and delete
app.post('/api/clients', async (req, res) => {
  try {
    const { document_number, full_name, address_line = null, phone_number = null, email = null } = req.body || {};
    if (!document_number || !full_name)
      return res.status(400).json({ message: 'document_number and full_name are required' });

    await q(
      `INSERT INTO clients (document_number, full_name, address_line, phone_number, email)
       VALUES (?,?,?,?,?)`,
      [document_number.trim(), full_name.trim(), address_line, phone_number, email]
    );
    const rows = await q(`SELECT * FROM clients WHERE document_number = ?`, [document_number.trim()]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'document_number or email already exists' });
    res.status(500).json({ message: e.message });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await q(`DELETE FROM clients WHERE id=?`, [id]);
    if (r.affectedRows === 0) return res.status(404).json({ message: 'client not found' });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2')
      return res.status(409).json({ message: 'Cannot delete: has invoices/transactions' });
    res.status(500).json({ message: e.message });
  }
});

// Invoices: create and delete
app.post('/api/invoices', async (req, res) => {
  try {
    const { invoice_number, client_id, billing_period, amount_billed } = req.body || {};
    if (!invoice_number || !client_id || !billing_period || amount_billed == null)
      return res.status(400).json({ message: 'invoice_number, client_id, billing_period, amount_billed are required' });

    await q(
      `INSERT INTO invoices (invoice_number, client_id, billing_period, amount_billed)
       VALUES (?,?,?,?)`,
      [invoice_number.trim(), Number(client_id), billing_period, Number(amount_billed)]
    );
    const rows = await q(`SELECT * FROM invoices WHERE invoice_number=?`, [invoice_number.trim()]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'invoice_number already exists' });
    res.status(500).json({ message: e.message });
  }
});

app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await q(`DELETE FROM invoices WHERE id=?`, [id]);
    if (r.affectedRows === 0) return res.status(404).json({ message: 'invoice not found' });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2')
      return res.status(409).json({ message: 'Cannot delete: has transactions' });
    res.status(500).json({ message: e.message });
  }
});

// Transactions: create and delete
app.post('/api/transactions', async (req, res) => {
  try {
    const {
      gateway_txn_id,
      txn_datetime,
      amount,
      status = 'Pending',
      txn_type = 'InvoicePayment',
      client_id,
      invoice_id = null,
      platform_id = null
    } = req.body || {};

    if (!gateway_txn_id || !txn_datetime || amount == null || !client_id)
      return res.status(400).json({ message: 'gateway_txn_id, txn_datetime, amount, client_id are required' });

    await q(
      `INSERT INTO transactions
        (gateway_txn_id, txn_datetime, amount, status, txn_type, client_id, invoice_id, platform_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        gateway_txn_id.trim(),
        txn_datetime,
        Number(amount),
        status,
        txn_type,
        Number(client_id),
        invoice_id ? Number(invoice_id) : null,
        platform_id ? Number(platform_id) : null
      ]
    );
    const rows = await q(`SELECT * FROM transactions WHERE gateway_txn_id=?`, [gateway_txn_id.trim()]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'gateway_txn_id already exists' });
    if (e.code === 'ER_NO_REFERENCED_ROW_2')
      return res.status(400).json({ message: 'Invalid FK (client/invoice/platform)' });
    res.status(500).json({ message: e.message });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await q(`DELETE FROM transactions WHERE id=?`, [id]);
    if (r.affectedRows === 0) return res.status(404).json({ message: 'transaction not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 4) Start and graceful shutdown
connectOnce()
  .then(() => app.listen(Number(PORT), () => console.log(`✔ API ready at http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('❌ Error connecting to MySQL:', err.message);
    process.exit(1);
  });

process.on('SIGINT', async () => {
  try {
    if (conn) await conn.end();
  } finally {
    process.exit(0);
  }
});
