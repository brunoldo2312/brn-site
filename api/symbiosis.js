// ============================================================
// api/symbiosis.js — Proxy Vercel para Symbiosis Finance
// Cross-chain SHIB BSC ↔ SHIB Polygon
// Versão: v4 — API v1 oficial (/v1/swap)
//
// Variável de ambiente:
//   SYMBIOSIS_PARTNER_ADDRESS → Endereço EVM que recebe as taxas
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

  const partnerAddress = process.env.SYMBIOSIS_PARTNER_ADDRESS || "";
  console.log("[symbiosis] Env:", { partnerAddressExiste: !!partnerAddress });

  if (!partnerAddress) {
    return res.status(500).json({
      success: false,
      error: "SYMBIOSIS_PARTNER_ADDRESS não configurada no Vercel."
    });
  }

  const {
    fromChainId, fromToken, fromDecimals,
    toChainId, toToken, toDecimals,
    amount, recipient, slippage
  } = req.body || {};

  if (!fromChainId || !fromToken || !toChainId || !toToken || !amount || !recipient) {
    return res.status(400).json({
      success: false,
      error: "Campos obrigatórios: fromChainId, fromToken, toChainId, toToken, amount, recipient"
    });
  }

  try {
    const swapBody = {
      tokenAmountIn: {
        chainId:  Number(fromChainId),
        address:  fromToken,
        amount:   String(amount),
        decimals: Number(fromDecimals) || 18
      },
      tokenOut: {
        chainId:  Number(toChainId),
        address:  toToken,
        decimals: Number(toDecimals) || 18
      },
      from:     recipient,
      to:       recipient,
      slippage: Number(slippage) || 300,
      partnerAddress: partnerAddress
    };

    console.log("[symbiosis] POST /v1/swap:", JSON.stringify(swapBody));

    const swapResp = await fetch(`${SYMBIOSIS_API}/v1/swap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Partner-Id": partnerAddress
      },
      body: JSON.stringify(swapBody)
    });

    const rawText = await swapResp.text();
    console.log("[symbiosis] HTTP", swapResp.status, "|", rawText.slice(0, 400));

    if (!swapResp.ok) {
      let errMsg = `HTTP ${swapResp.status}`;
      try {
        const errJson = JSON.parse(rawText);
        errMsg = errJson.error?.message || errJson.message || errJson.error || errMsg;
      } catch {}
      return res.status(502).json({ success: false, error: "Swap falhou: " + errMsg });
    }

    let swapData;
    try { swapData = JSON.parse(rawText); }
    catch {
      return res.status(502).json({ success: false, error: "Symbiosis não retornou JSON válido.", raw: rawText.slice(0, 300) });
    }

    if (!swapData.tx || !swapData.tx.to) {
      return res.status(502).json({ success: false, error: "Resposta sem calldata de transação.", raw: swapData });
    }

    return res.status(200).json({
      success: true,
      tx: {
        to:       swapData.tx.to,
        data:     swapData.tx.data,
        value:    swapData.tx.value || "0",
        gasLimit: swapData.tx.gas || swapData.tx.gasLimit || "900000"
      },
      approveTo: swapData.approveTo || swapData.tx.to,
      amountOut: swapData.tokenAmountOut?.amount || "0",
      amountIn:  swapData.tokenAmountIn?.amount || amount,
      fees:      swapData.fees || null,
      route:     swapData.route || null
    });

  } catch (e) {
    console.error("[symbiosis] Erro inesperado:", e);
    return res.status(500).json({
      success: false,
      error: "Erro interno: " + (e.message || "desconhecido")
    });
  }
}
