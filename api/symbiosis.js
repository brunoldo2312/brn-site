// ============================================================
// api/symbiosis.js — Proxy Vercel para Symbiosis Finance
// Cross-chain SHIB BSC ↔ SHIB Polygon
//
// Variáveis de ambiente (OPCIONAL):
//   SYMBIOSIS_PARTNER_ID → Identificador do seu site (ex: "brn-exchange")
// ============================================================

const SYMBIOSIS_API = "https://api.symbiosis.finance/crosschain";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Método não permitido. Use POST." });
  }

  const { fromChainId, fromToken, toChainId, toToken, amount, recipient, slippage } = req.body || {};

  if (!fromChainId || !fromToken || !toChainId || !toToken || !amount || !recipient) {
    return res.status(400).json({ success: false, error: "Campos obrigatórios ausentes." });
  }

  const partnerId = process.env.SYMBIOSIS_PARTNER_ID || "brn-exchange";

  try {
    // 1. Obter cotação (quote) — retorna o calldata para executar o swap
    const quoteResp = await fetch(`${SYMBIOSIS_API}/v2/quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Partner-Id": partnerId
      },
      body: JSON.stringify({
        from: { chainId: fromChainId, tokenAddress: fromToken },
        to:   { chainId: toChainId,   tokenAddress: toToken, receiver: recipient },
        amount: String(amount),
        slippage: slippage || 100 // 1%
      })
    });

    if (!quoteResp.ok) {
      const errData = await quoteResp.json().catch(() => ({}));
      const msg = (errData.error && errData.error.message) || ("HTTP " + quoteResp.status);
      console.error("[symbiosis] Erro na cotação:", msg);
      return res.status(502).json({ success: false, error: "Cotação falhou: " + msg });
    }

    const quote = await quoteResp.json();

    if (!quote.tx || !quote.tx.to) {
      return res.status(502).json({ success: false, error: "Resposta sem calldata de transação." });
    }

    // 2. Retornar os dados para o front-end assinar
    return res.status(200).json({
      success: true,
      tx: {
        to: quote.tx.to,
        data: quote.tx.data,
        value: quote.tx.value || "0",
        gasLimit: quote.tx.gas || "900000"
      },
      approveTo: quote.approveTo || quote.tx.to,
      amountOut: quote.to?.amount || "0",
      amountIn: quote.from?.amount || amount
    });

  } catch (e) {
    console.error("[symbiosis] Erro inesperado:", e);
    return res.status(500).json({
      success: false,
      error: "Erro interno: " + (e.message || "desconhecido")
    });
  }
}
