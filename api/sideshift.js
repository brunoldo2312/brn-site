// ============================================================
// api/sideshift.js — Função serverless Vercel (ES Module)
// Versão: v2 — Suporta múltiplos pares de troca
//
// Pares suportados:
//   • WBTC (Polygon) → BTC (Bitcoin)                    [legado]
//   • SHIB, USDT, USDC cross-chain:
//       Polygon ↔ Ethereum ↔ BSC (BNB Chain)
//
// Variáveis de ambiente necessárias (painel da Vercel):
//   SIDESHIFT_SECRET        → Private Key em sideshift.ai/account
//   SIDESHIFT_AFFILIATE_ID  → Account ID em sideshift.ai/account
//
// ⚠️ A SIDESHIFT_SECRET NUNCA deve ir para o front-end.
// ============================================================

// ------------------------------------------------------------
// 1) WHITELIST DE MOEDAS/REDES
// Evita que alguém use seu proxy para criar ordens arbitrárias
// com a sua conta SideShift.
// ------------------------------------------------------------
const SUPPORTED_COINS = {
  // coin : [redes permitidas]
  wbtc: ["polygon"],
  btc:  ["bitcoin"],
  shib: ["polygon", "ethereum", "bsc"],
  usdt: ["polygon", "ethereum", "bsc"],
  usdc: ["polygon", "ethereum"]
};

// ------------------------------------------------------------
// 2) PARES PERMITIDOS (origem → destino)
// Regras:
//   • mesmo `coin` (SHIB → SHIB, USDT → USDT, ...)
//   • redes diferentes
//   • exceção: WBTC/Polygon → BTC/Bitcoin (bridge clássico)
// ------------------------------------------------------------
const SUPPORTED_PAIRS = [
  // --- Bridge WBTC → BTC ---
  { deposit: { coin: "wbtc", network: "polygon" },  settle: { coin: "btc",  network: "bitcoin" } },

  // --- SHIB cross-chain ---
  { deposit: { coin: "shib", network: "polygon" },  settle: { coin: "shib", network: "ethereum" } },
  { deposit: { coin: "shib", network: "polygon" },  settle: { coin: "shib", network: "bsc" } },
  { deposit: { coin: "shib", network: "ethereum" }, settle: { coin: "shib", network: "polygon" } },
  { deposit: { coin: "shib", network: "ethereum" }, settle: { coin: "shib", network: "bsc" } },
  { deposit: { coin: "shib", network: "bsc" },      settle: { coin: "shib", network: "polygon" } },
  { deposit: { coin: "shib", network: "bsc" },      settle: { coin: "shib", network: "ethereum" } },

  // --- USDT cross-chain ---
  { deposit: { coin: "usdt", network: "polygon" },  settle: { coin: "usdt", network: "ethereum" } },
  { deposit: { coin: "usdt", network: "polygon" },  settle: { coin: "usdt", network: "bsc" } },
  { deposit: { coin: "usdt", network: "ethereum" }, settle: { coin: "usdt", network: "polygon" } },
  { deposit: { coin: "usdt", network: "ethereum" }, settle: { coin: "usdt", network: "bsc" } },
  { deposit: { coin: "usdt", network: "bsc" },      settle: { coin: "usdt", network: "polygon" } },
  { deposit: { coin: "usdt", network: "bsc" },      settle: { coin: "usdt", network: "ethereum" } },

  // --- USDC cross-chain ---
  { deposit: { coin: "usdc", network: "polygon" },  settle: { coin: "usdc", network: "ethereum" } },
  { deposit: { coin: "usdc", network: "ethereum" }, settle: { coin: "usdc", network: "polygon" } }
];

// ------------------------------------------------------------
// 3) HELPERS DE VALIDAÇÃO
// ------------------------------------------------------------
function isEvmAddress(addr) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

function isBitcoinAddress(addr) {
  if (typeof addr !== "string") return false;
  const a = addr.trim();
  return /^bc1[02-9ac-hj-np-z]{25,87}$/i.test(a)
      || /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a)
      || /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a);
}

function validarEnderecoPorRede(addr, network) {
  if (network === "bitcoin") return isBitcoinAddress(addr);
  // polygon, ethereum, bsc → todos EVM (mesmo 0x...)
  return isEvmAddress(addr);
}

function coinPermitida(coin, network) {
  const redes = SUPPORTED_COINS[coin];
  return Array.isArray(redes) && redes.includes(network);
}

function pairPermitido(dCoin, dNet, sCoin, sNet) {
  return SUPPORTED_PAIRS.some(p =>
    p.deposit.coin === dCoin &&
    p.deposit.network === dNet &&
    p.settle.coin === sCoin &&
    p.settle.network === sNet
  );
}

// ------------------------------------------------------------
// 4) HANDLER
// ------------------------------------------------------------
export default async function handler(req, res) {
  // -------- CORS --------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Método não permitido. Use POST." });
  }

  // -------- Credenciais --------
  const SECRET = process.env.SIDESHIFT_SECRET;
  const AFFILIATE = process.env.SIDESHIFT_AFFILIATE_ID;

  if (!SECRET || !AFFILIATE) {
    console.error("[sideshift] Credenciais ausentes nas env vars");
    return res.status(500).json({
      success: false,
      error: "Servidor mal configurado. Contate o administrador."
    });
  }

  // -------- Payload --------
  const body = req.body || {};
  const {
    depositCoin,
    depositNetwork,
    settleCoin,
    settleNetwork,
    depositAmount,
    settleAddress
  } = body;

  // Retrocompatibilidade: se o cliente só mandou depositAmount + settleAddress,
  // assume o par legado WBTC (Polygon) → BTC (Bitcoin).
  const dCoin = String(depositCoin    || "wbtc"    ).toLowerCase().trim();
  const dNet  = String(depositNetwork || "polygon" ).toLowerCase().trim();
  const sCoin = String(settleCoin     || "btc"     ).toLowerCase().trim();
  const sNet  = String(settleNetwork  || "bitcoin" ).toLowerCase().trim();

  // -------- Validação básica --------
  if (!depositAmount || !settleAddress) {
    return res.status(400).json({
      success: false,
      error: "Campos obrigatórios: depositAmount e settleAddress"
    });
  }

  const amount = Number(depositAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      error: "depositAmount deve ser um número positivo"
    });
  }

  // -------- Validação de moeda/rede --------
  if (!coinPermitida(dCoin, dNet)) {
    return res.status(400).json({
      success: false,
      error: `Moeda/rede de origem não suportada: ${dCoin}/${dNet}`
    });
  }
  if (!coinPermitida(sCoin, sNet)) {
    return res.status(400).json({
      success: false,
      error: `Moeda/rede de destino não suportada: ${sCoin}/${sNet}`
    });
  }

  // -------- Validação de par --------
  if (!pairPermitido(dCoin, dNet, sCoin, sNet)) {
    return res.status(400).json({
      success: false,
      error: `Par não permitido: ${dCoin}/${dNet} → ${sCoin}/${sNet}`
    });
  }

  // Mesma rede origem/destino → bloqueia (regra de negócio)
  if (dNet === sNet) {
    return res.status(400).json({
      success: false,
      error: "Origem e destino não podem ser a mesma rede"
    });
  }

  // -------- Validação do endereço (por REDE DE DESTINO) --------
  const addr = String(settleAddress).trim();
  if (!validarEnderecoPorRede(addr, sNet)) {
    const label = sNet === "bitcoin" ? "Bitcoin" : "EVM";
    return res.status(400).json({
      success: false,
      error: `Endereço ${label} inválido para a rede de destino (${sNet})`
    });
  }

  // ============================================================
  // FLUXO SIDESHIFT
  // ============================================================
  try {
    // -------- 1. Cotação --------
    const quoteBody = {
      depositCoin:    dCoin,
      depositNetwork: dNet,
      settleCoin:     sCoin,
      settleNetwork:  sNet,
      depositAmount:  String(depositAmount),
      affiliateId:    AFFILIATE
    };

    console.log("[sideshift] Criando cotação:", JSON.stringify(quoteBody));

    const quoteResp = await fetch("https://sideshift.ai/api/v2/quotes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sideshift-secret": SECRET
      },
      body: JSON.stringify(quoteBody)
    });

    if (!quoteResp.ok) {
      const errData = await quoteResp.json().catch(() => ({}));
      const msg = (errData.error && errData.error.message) || ("HTTP " + quoteResp.status);
      console.error("[sideshift] Erro na cotação:", msg);
      return res.status(502).json({ success: false, error: "Cotação falhou: " + msg });
    }

    const quote = await quoteResp.json();
    console.log("[sideshift] Cotação OK:", quote.id);

    if (!quote.id) {
      return res.status(502).json({ success: false, error: "Cotação sem ID retornado" });
    }

    // -------- 2. Criar shift fixo --------
    const shiftResp = await fetch("https://sideshift.ai/api/v2/shifts/fixed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sideshift-secret": SECRET
      },
      body: JSON.stringify({
        quoteId:       quote.id,
        settleAddress: addr,
        affiliateId:   AFFILIATE
      })
    });

    if (!shiftResp.ok) {
      const errData = await shiftResp.json().catch(() => ({}));
      const msg = (errData.error && errData.error.message) || ("HTTP " + shiftResp.status);
      console.error("[sideshift] Erro ao criar shift:", msg);
      return res.status(502).json({ success: false, error: "Criação da ordem falhou: " + msg });
    }

    const shift = await shiftResp.json();
    console.log("[sideshift] Shift OK:", shift.id, "→", shift.depositAddress);

    // -------- 3. Resposta ao front-end --------
    return res.status(200).json({
      success:        true,
      shiftId:        shift.id,
      depositAddress: shift.depositAddress,
      depositAmount:  shift.depositAmount,
      depositCoin:    shift.depositCoin,
      depositNetwork: shift.depositNetwork,
      settleAmount:   shift.settleAmount,
      settleCoin:     shift.settleCoin,
      settleNetwork:  shift.settleNetwork,
      settleAddress:  shift.settleAddress,
      expiresAt:      shift.expiresAt,
      status:         shift.status,
      createdAt:      shift.createdAt
    });

  } catch (e) {
    console.error("[sideshift] Erro inesperado:", e);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao processar a ordem: " + (e.message || "desconhecido")
    });
  }
}
