// ============================================================
// api/sideshift.js — Função serverless Vercel
// Cria ordem de troca WBTC (Polygon) → BTC (Bitcoin) via SideShift
//
// Variáveis de ambiente necessárias (configurar no painel da Vercel):
//   SIDESHIFT_SECRET        → Private Key da sua conta em sideshift.ai/account
//   SIDESHIFT_AFFILIATE_ID  → Account ID em sideshift.ai/account
//
// ⚠️ A SIDESHIFT_SECRET NUNCA deve ir para o front-end.
// ============================================================

export default async function handler(req, res) {
  // ================= CORS =================
  // Permite chamadas do site estático (GitHub Pages, domínio próprio, etc.)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // ================= Método =================
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido. Use POST." });
  }

  // ================= Credenciais =================
  const SECRET = process.env.SIDESHIFT_SECRET;
  const AFFILIATE = process.env.SIDESHIFT_AFFILIATE_ID;

  if (!SECRET || !AFFILIATE) {
    console.error("Credenciais SideShift ausentes nas env vars");
    return res.status(500).json({
      error: "Servidor mal configurado. Contate o administrador."
    });
  }

  // ================= Validação de entrada =================
  const { depositAmount, settleAddress } = req.body || {};

  if (!depositAmount || !settleAddress) {
    return res.status(400).json({
      error: "Campos obrigatórios: depositAmount e settleAddress"
    });
  }

  const amount = Number(depositAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "depositAmount deve ser um número positivo" });
  }

  // Validação básica de endereço Bitcoin (bc1..., 1..., 3...)
  const addr = String(settleAddress).trim();
  const isBtcAddr =
    /^bc1[02-9ac-hj-np-z]{25,87}$/i.test(addr) ||
    /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr) ||
    /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr);

  if (!isBtcAddr) {
    return res.status(400).json({ error: "Endereço Bitcoin inválido" });
  }

  // ================= Fluxo SideShift =================
  try {
    // ---------- 1. Solicitar cotação ----------
    const quoteResp = await fetch("https://sideshift.ai/api/v2/quotes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sideshift-secret": SECRET
      },
      body: JSON.stringify({
        depositCoin: "wbtc",
        depositNetwork: "polygon",
        settleCoin: "btc",
        settleNetwork: "bitcoin",
        depositAmount: String(depositAmount),
        affiliateId: AFFILIATE
      })
    });

    if (!quoteResp.ok) {
      const errData = await quoteResp.json().catch(() => ({}));
      const msg = errData.error?.message || `HTTP ${quoteResp.status}`;
      console.error("Erro ao obter cotação:", msg);
      return res.status(502).json({ error: `Cotação falhou: ${msg}` });
    }

    const quote = await quoteResp.json();
    console.log("Cotação criada:", quote.id, "amount:", quote.depositAmount);

    if (!quote.id) {
      return res.status(502).json({ error: "Cotação sem ID retornado" });
    }

    // ---------- 2. Criar ordem fixa ----------
    const shiftResp = await fetch("https://sideshift.ai/api/v2/shifts/fixed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sideshift-secret": SECRET
      },
      body: JSON.stringify({
        quoteId: quote.id,
        settleAddress: addr,
        affiliateId: AFFILIATE
      })
    });

    if (!shiftResp.ok) {
      const errData = await shiftResp.json().catch(() => ({}));
      const msg = errData.error?.message || `HTTP ${shiftResp.status}`;
      console.error("Erro ao criar shift:", msg);
      return res.status(502).json({ error: `Criação da ordem falhou: ${msg}` });
    }

    const shift = await shiftResp.json();
    console.log("Shift criada:", shift.id, "→", shift.depositAddress);

    // ---------- 3. Responder ao front-end ----------
    return res.status(200).json({
      success: true,
      shiftId: shift.id,
      depositAddress: shift.depositAddress,
      depositAmount: shift.depositAmount,
      depositCoin: shift.depositCoin,
      depositNetwork: shift.depositNetwork,
      settleAmount: shift.settleAmount,
      settleCoin: shift.settleCoin,
      settleNetwork: shift.settleNetwork,
      settleAddress: shift.settleAddress,
      expiresAt: shift.expiresAt,
      status: shift.status,
      createdAt: shift.createdAt
    });
  } catch (e) {
    console.error("Erro inesperado no handler:", e);
    return res.status(500).json({
      error: "Erro interno ao processar a ordem: " + (e.message || "desconhecido")
    });
  }
}