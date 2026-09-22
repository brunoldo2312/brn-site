// ============================================================
// APP.JS — Carteira BRN P2P (v5 — WRAP AUTOMÁTICO)
// Compatível com o EscrowFactory JÁ DEPLOYADO (sem alterar .sol)
//
// Novidades v5:
//  [WRAP] POL aparece como opção em Vender e Executar
//  [WRAP] App faz wrap/unwrap automático nos bastidores
//  [WRAP] Usuário confirma UMA vez; app encadeia as txs
//
// Correções v4 mantidas:
//  [FIX 1] decString aceita bytes32
//  [FIX 2] decAddressArray tolerante a offsets variados
//  [FIX 3] decBoolSeguro valida se é realmente bool
//  [FIX 4] verificarTokens marca definitivo após N tentativas
//  [FIX 5] renderMural usa fallback em o.indice
//  [FIX 6] enviarTx estima gasLimit com margem
//  [FIX 7] accountsChanged reconecta sem reload
//  [FIX 8] rawCall só interrompe fallback em revert REAL
//  [FIX 9] aviso visível quando há ordens com erro
//  [FIX 10] lerOrdem valida layout de obterDados()
// ============================================================

// --- CONFIGURACOES (POLYGON MAINNET) ---
const ESCROW_FACTORY_ADDRESS = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;

// WPOL (Wrapped POL) — usado para wrap/unwrap automático
const WPOL_ADDRESS = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
const SEL_WPOL = {
  deposit:  "d0e30db0", // deposit() payable
  withdraw: "2e1a7d4d", // withdraw(uint256)
};

// ------------------------------------------------------------
// LISTA DE TOKENS SUPORTADOS
// ------------------------------------------------------------
const NATIVO = { symbol: "POL", name: "POL (nativo)", decimals: 18, native: true };
const TOKENS = [
  { symbol: "BRN",    name: "BRN",                 address: "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210", decimals: 18, symbols: null },
  { symbol: "USDC.e", name: "USD Coin (PoS)",      address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6,  symbols: ["USDC"] },
  { symbol: "USDC",   name: "USD Coin (nativo)",   address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6,  symbols: ["USDC"] },
  { symbol: "USDT",   name: "Tether USD",          address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8a", decimals: 6,  symbols: ["USDT"] },
  { symbol: "WPOL",   name: "Wrapped POL",         address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18, symbols: ["WPOL", "WMATIC"] },
  { symbol: "WETH",   name: "Wrapped Ether",       address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18, symbols: ["WETH"] },
];

// RPCs públicos com fallback
const RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://polygon-rpc.com",
  "https://rpc.ankr.com/polygon",
];
const RPC_TIMEOUT_MS = 8000;
const MAX_ORDENS = 1000;
const CONCORRENCIA = 5;
const MAX_TENTATIVAS_TOKEN = 3;

// --- SELECTORS ---
const SEL_FACTORY = {
  criarOrdem:   "ceff4da6",
  ordensDe:     "0dc80995",
  ordem:        "72c453b8",
  totalOrdens:  "8275d6fa",
  todasOrdens:  "e9b1e327",
};
const SEL_ESCROW = {
  criador:        "041c797c",
  tokenDesejado:  "0cd59b77",
  executado:      "2a3a5716",
  obterDados:     "32c9e06c",
  valorDesejado:  "651cc708",
  cancelado:      "7766a742",
  tokenOferecido: "8a337bdc",
  cancelar:       "8ffb1ccf",
  executar:       "b2d44d08",
  factory:        "c45a0155",
  valorOferecido: "f6c467b7",
};
const SEL_ERC20 = {
  balanceOf: "70a08231",
  allowance: "dd62ed3e",
  approve:   "095ea7b3",
  transfer:  "a9059cbb",
  decimals:  "313ce567",
  symbol:    "95d89b41",
};

// --- ESTADO GLOBAL ---
let walletProvider = null;
let signer = null;
let userAddress = null;
let currentRpc = null;
let rpcIdx = 0;
const providersOk = {};
let ordersCache = [];
let carregando = false;
let emTransacao = false;
let listenersRegistrados = false;
const saldos = {};
const filtro = { status: "todas", oferece: "", pede: "", minhas: false };
const ABAS = ["mural", "vender", "enviar", "ajuda"];
const IDS_ACOES = ["btnCreate", "btnApprove", "btnSend", "btnMaxOf", "btnMaxSend"];

// ============================================================
// UTILITÁRIOS
// ============================================================
function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function isAddr(a) { return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a); }
function short(a) { return isAddr(a) ? a.slice(0, 6) + "…" + a.slice(-4) : "—"; }
function shortHash(h) { return typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h) ? h.slice(0, 10) + "…" + h.slice(-6) : "—"; }
function mesmoEndereco(a, b) { return !!a && !!b && a.toLowerCase() === b.toLowerCase(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmt(value, decimals, maxFrac = 6) {
  try {
    const s = ethers.utils.formatUnits(value.toString(), decimals);
    const partes = s.split(".");
    const inteiro = BigInt(partes[0]).toLocaleString("pt-BR");
    const frac = (partes[1] || "").slice(0, maxFrac).replace(/0+$/, "");
    if (BigInt(value) > 0n && inteiro === "0" && !frac) {
      return "< 0," + "0".repeat(maxFrac - 1) + "1";
    }
    return frac ? inteiro + "," + frac : inteiro;
  } catch (e) { return String(value); }
}

function paraInput(valor, decimals) {
  const s = ethers.utils.formatUnits(valor.toString(), decimals);
  return s.replace(/\.0+$/, "");
}

function toast(msg, type = "info", ms = 5000, href = null) {
  const box = $("toasts");
  const t = el("div", "toast " + type, msg);
  if (href && /^https:\/\/polygonscan\.com\/tx\/0x[0-9a-fA-F]{64}$/.test(href)) {
    const a = el("a", "", " · ver no PolygonScan ↗");
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    t.appendChild(a);
  }
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, ms);
}
function toastTx(msg, hash, type = "info") {
  toast(msg + " " + shortHash(hash), type, 12000, "https://polygonscan.com/tx/" + hash);
}

function setNet(state, text) {
  $("netDot").className = "dot " + (state === "ok" ? "" : state);
  $("netText").textContent = text;
}

function erroLegivel(e) {
  if (!e) return "Erro desconhecido.";
  if (e.code === 4001 || e.code === "ACTION_REJECTED") return "Transação recusada na carteira.";
  const m = e.reason || (e.data && e.data.message) || (e.error && e.error.message) || e.message || String(e);
  return String(m).slice(0, 220);
}

// --- helpers ABI ---
const HEX_WORD = /^[0-9a-fA-F]{64}$/;

function pad32(hexNo0x) { return hexNo0x.padStart(64, "0"); }
function encAddress(addr) {
  if (!isAddr(addr)) throw new Error("Endereço inválido.");
  return pad32(addr.toLowerCase().slice(2));
}
function encUint(n) {
  const v = BigInt(n);
  if (v < 0n || v >= (1n << 256n)) throw new Error("Valor fora do intervalo uint256.");
  return pad32(v.toString(16));
}

function decUint(word) {
  if (!HEX_WORD.test(word || "")) throw new Error("Resposta ABI inválida.");
  return BigInt("0x" + word);
}
function decAddress(word) {
  if (!HEX_WORD.test(word || "") || !/^0{24}/.test(word)) throw new Error("Endereço inválido na resposta.");
  return ethers.utils.getAddress("0x" + word.slice(24).toLowerCase());
}
function decBool(word) {
  const v = decUint(word);
  if (v > 1n) throw new Error("Booleano inválido na resposta.");
  return v === 1n;
}
function decBoolSeguro(word) {
  try {
    const v = decUint(word);
    if (v > 1n) return null;
    return v === 1n;
  } catch (e) { return null; }
}

function splitWords(hex) {
  if (typeof hex !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(hex)) throw new Error("Resposta inválida do RPC.");
  const b = hex.slice(2);
  if (b.length % 64 !== 0) throw new Error("Resposta com tamanho inesperado.");
  const out = [];
  for (let i = 0; i < b.length; i += 64) out.push(b.slice(i, i + 64));
  return out;
}

function decAddressArray(hex) {
  const w = splitWords(hex);
  if (w.length < 1) throw new Error("Lista de ordens inválida.");

  if (w.length >= 2) {
    try {
      const off = Number(decUint(w[0]));
      if (off % 32 === 0) {
        const start = off / 32;
        if (start < w.length) {
          const len = Number(decUint(w[start]));
          if (Number.isSafeInteger(len) && len <= MAX_ORDENS && start + 1 + len <= w.length) {
            const arr = [];
            for (let i = 0; i < len; i++) arr.push(decAddress(w[start + 1 + i]));
            return arr;
          }
        }
      }
    } catch (e) { /* tenta caso 2 */ }
  }

  const arr = [];
  for (const word of w) {
    try { arr.push(decAddress(word)); } catch (e) { break; }
  }
  if (arr.length === 0) throw new Error("Lista de ordens inválida.");
  if (arr.length > MAX_ORDENS) throw new Error("Lista de ordens grande demais.");
  return arr;
}

function decString(hex) {
  const w = splitWords(hex);

  if (w.length >= 2 && Number(decUint(w[0])) === 32) {
    const len = Number(decUint(w[1]));
    if (Number.isSafeInteger(len) && len <= 64 && 2 + Math.ceil(len / 32) <= w.length) {
      const dados = w.slice(2).join("").slice(0, len * 2);
      try { return ethers.utils.toUtf8String("0x" + dados); } catch (e) { /* cai no caso 2 */ }
    }
  }

  if (w.length === 1) {
    const raw = w[0].replace(/(00)+$/, "");
    if (!raw) return "";
    try { return ethers.utils.toUtf8String("0x" + raw); } catch (e) { /* falha */ }
  }

  if (w.length >= 1) {
    const raw = w[0].replace(/(00)+$/, "");
    if (raw) {
      try { return ethers.utils.toUtf8String("0x" + raw); } catch (e) { /* falha */ }
    }
  }

  throw new Error("String inválida.");
}

function lerValor(txt, dec, nome) {
  const s = String(txt || "").trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Informe um valor válido de " + nome + ".");
  let v;
  try { v = BigInt(ethers.utils.parseUnits(s, dec).toString()); }
  catch (e) { throw new Error(nome + ": no máximo " + dec + " casas decimais."); }
  if (v <= 0n) throw new Error("O valor de " + nome + " deve ser maior que zero.");
  return v;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ============================================================
// TOKENS SUPORTADOS
// ============================================================
function normalizarTokens() {
  for (const t of TOKENS) {
    try { t.address = ethers.utils.getAddress(t.address.toLowerCase()); }
    catch (e) { t.ok = false; t.definitivo = true; t.aviso = "endereço inválido na lista"; }
    if (t.ok === undefined) t.ok = false;
    if (t.tentativas === undefined) t.tentativas = 0;
  }
}
function tokenPorEndereco(addr) { return TOKENS.find(t => mesmo
