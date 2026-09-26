// api/cexswap.js — Backend Serverless (Vercel)
const crypto = require('crypto');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ⚠️ As chaves vêm das Environment Variables da Vercel (NUNCA do código!)
  const API_KEY = process.env.CEXSWAP_API_KEY;
  const SECRET  = process.env.CEXSWAP_SECRET;

  if (!API_KEY || !SECRET) {
    return res.status(500).json({ success: false, error: 'Chaves CEXSwap não configuradas.' });
  }

  try {
    const path = req.body?.path || req.query?.path || '/api/public/pairs/active';
    const method = req.body?.method || 'GET';

    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('base64');
    const payload = `${API_KEY}:${ts}:${nonce}:${path}:${SECRET}`;
    const assinatura = crypto.createHash('sha256').update(payload).digest('hex');

    const resp = await fetch(`https://cexswap.cc${path}`, {
      method,
      headers: {
        'X-API-KEY': API_KEY,
        'X-TIMESTAMP': ts,
        'X-NONCE': nonce,
        'X-SIGNATURE': assinatura,
        'Content-Type': 'application/json'
      },
      body: method !== 'GET' ? JSON.stringify(req.body?.data || {}) : undefined
    });

    const data = await resp.json();
    res.status(resp.status).json({ success: resp.ok, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};