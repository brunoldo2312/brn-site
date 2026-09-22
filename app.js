// ============================================================
// APP.JS - Carteira BRN P2P (v9 - LIMPO)
// Sem emojis em comentarios. Sem caracteres Unicode especiais.
// Salve como UTF-8 sem BOM.
// ============================================================

const ESCROW_FACTORY_ADDRESS = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;
const POLYGON_CHAIN_ID_HEX = "0x89";
const WPOL_ADDRESS = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
const SEL_WPOL = { deposit: "d0e30db0", withdraw: "2e1a7d4d" };

const POLYGON_NETWORK_PARAMS = {
  chainId: POLYGON_CHAIN_ID_HEX,
  chainName: "Polygon Mainnet",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: ["https://polygon-rpc.com"],
  blockExplorerUrls: ["https://polygonscan.com"],
};

const NATIVO = { symbol: "POL", name: "POL (nativo)", decimals: 18, native: true };

// Lista de tokens verificados na Polygon (enderecos conferidos)
const TOKENS = [
  { symbol: "BRN",    name: "BRN",                address: "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210", decimals: 18, symbols: null },
  { symbol: "USDC.e", name: "USD Coin (PoS)",     address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6,  symbols: ["USDC"] },
  { symbol: "USDC",   name: "USD Coin (nativo)",  address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6,  symbols: ["USDC"] },
  { symbol: "USDT",   name: "Tether USD",         address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8a", decimals: 6,  symbols: ["USDT"] },
  { symbol: "DAI",    name: "Dai Stablecoin",     address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18, symbols: ["DAI"] },
  { symbol: "WPOL",   name: "Wrapped POL",        address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18, symbols: ["WPOL", "WMATIC"] },
  { symbol: "WETH",   name: "Wrapped Ether",      address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18, symbols: ["WETH"] },
  { symbol: "WBTC",   name: "Wrapped BTC",        address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8,  symbols: ["WBTC"] },
  { symbol: "LINK",   name: "ChainLink Token",    address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", decimals: 18, symbols: ["LINK"] },
  { symbol: "AAVE",   name: "Aave",               address: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", decimals: 18, symbols: ["AAVE"] },
  { symbol: "UNI",    name: "Uniswap",            address: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f", decimals: 18, symbols: ["UNI"] },
  { symbol: "SUSHI",  name: "SushiToken",         address: "0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a", decimals: 18, symbols: ["SUSHI"] },
  { symbol: "CRV",    name: "Curve DAO Token",    address: "0x172370d5Cd63279eFa6d502DAB29171933a610AF", decimals: 18, symbols: ["CRV"] },
  { symbol: "MKR",    name: "Maker",              address: "0x6f7C932e7684666C9fd1d44527765433e01fF61d", decimals: 18, symbols: ["MKR"] },
  { symbol: "COMP",   name: "Compound",           address: "0x8505b9d2254A7Ae468c0E9dd10Ccea3A837aef5c", decimals: 18, symbols: ["COMP"] },
  { symbol: "SNX",    name: "Synthetix",          address: "0x50B728D8D964fd00C2d0AAD81718b71311feF68a", decimals: 18, symbols: ["SNX"] },
  { symbol: "GRT",    name: "The Graph",          address: "0x5fe2B58c013d7601147DcdD68C143A77499f5531", decimals: 18, symbols: ["GRT"] },
  { symbol: "1INCH",  name: "1inch",              address: "0x9c2C5fd7b07E95EE044DDeba0E97a665F142394f", decimals: 18, symbols: ["1INCH"] },
  { symbol: "SAND",   name: "The Sandbox",        address: "0xBbba073C31bF03b8ACf7c28EF0738DeCF3695683", decimals: 18, symbols: ["SAND"] },
  { symbol: "MANA",   name: "Decentraland",       address: "0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4", decimals: 18, symbols: ["MANA"] },
  { symbol: "SHIB",   name: "Shiba Inu (PoS)",    address: "0x6f8a06447Ff6FcF75d803135a7de15CE88C1d4ec", decimals: 18, symbols: ["SHIB"] },
];

const RPCS = [
  "https://polygon-rpc.com",
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://polygon.llamarpc.com",
  "https://rpc.ankr.com/polygon",
];
const RPC_TIMEOUT_MS = 2500;
const WATCHDOG_MS = 12000;
const MAX_ORDENS = 1000;
const CONCORRENCIA = 6;
const MAX_TENTATIVAS_TOKEN = 2;
const DEBUG = true;

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
const ABAS = ["mural", "vender", "enviar", "ajuda"];
const IDS_ACOES = ["btnCreate", "btnApprove", "btnSend", "btnMaxOf", "btnMaxSend"];

const filtro = {
  status: "todas",
  oferece: "",
  pede: "",
  minhas: false,
  busca: "",
  ordenar: "recentes",
  soExecutaveis: false,
  soComSaldo: false,
};

function log()    { if (DEBUG) console.log.apply(console, ["[BRN]"].concat([].slice.call(arguments))); }
function logOk()  { if (DEBUG) console.log.apply(console, ["[BRN OK]"].concat([].slice.call(arguments))); }
function logErr() { if (DEBUG) console.error.apply(console, ["[BRN ERR]"].concat([].slice.call(arguments))); }
function logWarn(){ if (DEBUG) console.warn.apply(console, ["[BRN WARN]"].concat([].slice.call(arguments))); }

// ============================================================
// UTILITARIOS
// ============================================================
function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function isAddr(a) { return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a); }
function short(a) { return isAddr(a) ? a.slice(0, 6) + "..." + a.slice(-4) : "-"; }
function shortHash(h) { return typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h) ? h.slice(0, 10) + "..." + h.slice(-6) : "-"; }
function mesmoEndereco(a, b) { return !!a && !!b && a.toLowerCase() === b.toLowerCase(); }
function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function fmt(value, decimals, maxFrac) {
  if (maxFrac === undefined) maxFrac = 6;
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

function toast(msg, type, ms, href) {
  if (type === undefined) type = "info";
  if (ms === undefined) ms = 5000;
  const box = $("toasts");
  if (!box) return;
  const t = el("div", "toast " + type, msg);
  if (href && /^https:\/\/polygonscan\.com\/tx\/0x[0-9a-fA-F]{64}$/.test(href)) {
    const a = el("a", "", " - ver no PolygonScan");
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    t.appendChild(a);
  }
  box.appendChild(t);
  setTimeout(function() {
    t.style.opacity = "0";
    setTimeout(function() { t.remove(); }, 300);
  }, ms);
}
function toastTx(msg, hash, type) {
  toast(msg + " " + shortHash(hash), type || "info", 12000, "https://polygonscan.com/tx/" + hash);
}

function setNet(state, text) {
  const dot = $("netDot"), txt = $("netText");
  if (dot) dot.className = "dot " + (state === "ok" ? "" : state);
  if (txt) txt.textContent = text;
}

function erroLegivel(e) {
  if (!e) return "Erro desconhecido.";
  if (e.code === 4001 || e.code === "ACTION_REJECTED") return "Transacao recusada na carteira.";
  const m = e.reason || (e.data && e.data.message) || (e.error && e.error.message) || e.message || String(e);
  return String(m).slice(0, 220);
}

// ============================================================
// HELPERS ABI
// ============================================================
const HEX_WORD = /^[0-9a-fA-F]{64}$/;
function pad32(hexNo0x) { return hexNo0x.padStart(64, "0"); }
function encAddress(addr) {
  if (!isAddr(addr)) throw new Error("Endereco invalido.");
  return pad32(addr.toLowerCase().slice(2));
}
function encUint(n) {
  const v = BigInt(n);
  if (v < 0n || v >= (1n << 256n)) throw new Error("Valor fora do intervalo uint256.");
  return pad32(v.toString(16));
}
function decUint(word) {
  if (!HEX_WORD.test(word || "")) throw new Error("Resposta ABI invalida.");
  return BigInt("0x" + word);
}
function decAddress(word) {
  if (!HEX_WORD.test(word || "") || !/^0{24}/.test(word)) throw new Error("Endereco invalido na resposta.");
  return ethers.utils.getAddress("0x" + word.slice(24).toLowerCase());
}
function decBool(word) {
  const v = decUint(word);
  if (v > 1n) throw new Error("Booleano invalido na resposta.");
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
  if (typeof hex !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(hex)) throw new Error("Resposta invalida do RPC.");
  const b = hex
