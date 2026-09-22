// ============================================================
// APP.JS — Carteira BRN P2P (v3.3 — corrigido)
// Compatível com o EscrowFactory JÁ DEPLOYADO (sem alterar .sol)
//
// Correções aplicadas:
//  - init() roda via readyState (funciona com script async/defer)
//  - withTimeout sem unhandled rejection
//  - guards de null em todos os getElementById críticos
//  - verificarTokens protegido contra execução duplicada
//  - LISTA COMPLETA de 21 tokens suportados
//  - v3.3: verificação de token mais tolerante — só os DECIMALS
//    bloqueiam; símbolo vira aviso. Falha de RPC não é definitiva.
// ============================================================

// --- CONFIGURACOES (POLYGON MAINNET) ---
const ESCROW_FACTORY_ADDRESS = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;

// ------------------------------------------------------------
// LISTA DE TOKENS SUPORTADOS (única fonte de verdade)
// ------------------------------------------------------------
const NATIVO = { symbol: "POL", name: "POL (nativo)", decimals: 18, native: true };
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
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://polygon-rpc.com",
  "https://rpc.ankr.com/polygon",
];
const RPC_TIMEOUT_MS = 8000;
const MAX_ORDENS = 1000;
const CONCORRENCIA = 5;

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
  if (!box) return;
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
  const dot = $("netDot"), txt = $("netText");
  if (dot) dot.className = "dot " + (state === "ok" ? "" : state);
  if (txt) txt.textContent = text;
}

function erroLegivel(e) {
  if (!e) return "Erro desconhecido.";
  if (e.code === 4001 || e.code === "ACTION_REJECTED") return "Transação recusada na carteira.";
  const m = e.reason || (e.data && e.data.message) || (e.error && e.error.message) || e.message || String(e);
  return String(m).slice(0, 220);
}

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
  if (w.length < 2) throw new Error("Lista de ordens inválida.");
  const off = Number(decUint(w[0]));
  if (off % 32 !== 0) throw new Error("Lista de ordens inválida.");
  const start = off / 32;
  if (start >= w.length) throw new Error("Lista de ordens inválida.");
  const len = Number(decUint(w[start]));
  if (!Number.isSafeInteger(len) || len > MAX_ORDENS || start + 1 + len > w.length) {
    throw new Error("Lista de ordens inválida ou grande demais.");
  }
  const arr = [];
  for (let i = 0; i < len; i++) arr.push(decAddress(w[start + 1 + i]));
  return arr;
}
function decString(hex) {
  const w = splitWords(hex);
  if (w.length < 2 || Number(decUint(w[0])) !== 32) throw new Error("String inválida.");
  const len = Number(decUint(w[1]));
  if (!Number.isSafeInteger(len) || len > 64 || 2 + Math.ceil(len / 32) > w.length) throw new Error("String inválida.");
  const dados = w.slice(2).join("").slice(0, len * 2);
  return ethers.utils.toUtf8String("0x" + dados);
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
  }
}
function tokenPorEndereco(addr) { return TOKENS.find(t => mesmoEndereco(t.address, addr)) || null; }
function tokenOk(addr) { const t = tokenPorEndereco(addr); return t && t.ok ? t : null; }
function tokensOk() { return TOKENS.filter(t => t.ok); }
function ativoPorId(id) { return id === "POL" ? NATIVO : tokenOk(id); }

// v3.3: verificacao tolerante — DECIMALS e a checagem obrigatoria.
// Se o RPC falhar para decimals, NAO marca como definitivo (retenta depois).
// Se o simbolo nao bater, apenas avisa (nao bloqueia o token).
let verificandoTokens = false;
async function verificarTokens() {
  if (verificandoTokens) return;
  verificandoTokens = true;
  try {
    await mapLimit(TOKENS, CONCORRENCIA, async (t) => {
      if (t.ok || t.definitivo) return;

      let dec = null;
      try {
        const rd = await rawCall(t.address, "0x" + SEL_ERC20.decimals);
        dec = Number(decUint(splitWords(rd)[0]));
      } catch (e) {
        // RPC falhou ao ler decimals: deixa para tentar de novo
        t.ok = false;
        t.aviso = "RPC não respondeu — tentaremos de novo";
        return;
      }

      if (dec !== t.decimals) {
        // Decimais diferentes do esperado: rejeita em definitivo
        t.ok = false;
        t.definitivo = true;
        t.aviso = "on-chain: " + dec + " decimais (esperado " + t.decimals + ")";
        return;
      }

      // Decimais OK -> token aceito
      t.ok = true;
      t.aviso = null;

      // Simbolo e apenas informativo. Nao bloqueia.
      let simbolo = null;
      try { simbolo = decString(await rawCall(t.address, "0x" + SEL_ERC20.symbol)); } catch (e) { /* opcional */ }
      if (simbolo && t.symbols && !t.symbols.includes(simbolo.toUpperCase())) {
        t.aviso = "símbolo on-chain é " + simbolo + " (esperado " + t.symbols.join("/") + ")";
      }
    });

    for (const t of TOKENS) {
      if (!t.ok && t.definitivo && !t.avisado) {
        t.avisado = true;
        toast("Token " + t.symbol + " desativado: " + t.aviso, "warn", 9000);
      }
    }
  } finally {
    verificandoTokens = false;
  }
}

async function garantirTokens() {
  if (TOKENS.some(t => !t.ok && !t.definitivo)) {
    await verificarTokens();
    montarSelects();
  }
}

function fmtToken(valor, tokenAddr) {
  const t = tokenOk(tokenAddr);
  if (t) return fmt(valor, t.decimals) + " " + t.symbol;
  return valor.toString() + " unid. de " + short(tokenAddr);
}

function chipClasse(symbol) {
  if (symbol === "BRN") return "brn";
  if (symbol === "POL" || symbol === "WPOL") return "pol";
  if (symbol.indexOf("USD") === 0) return "usdc";
  return "other";
}

// ============================================================
// RPCs PÚBLICOS
// ============================================================
async function withTimeout(promise, ms) {
  Promise.resolve(promise).catch(() => {});
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(t); }
}

async function getProviderFor(url) {
  if (providersOk[url]) return providersOk[url];
  const p = new ethers.providers.StaticJsonRpcProvider(url, POLYGON_CHAIN_ID);
  const hex = await withTimeout(p.send("eth_chainId", []), RPC_TIMEOUT_MS);
  if (parseInt(hex, 16) !== POLYGON_CHAIN_ID) throw new Error("RPC em rede errada: " + url);
  providersOk[url] = p;
  return p;
}

async function rawCall(to, data) {
  let ultimoErro;
  for (let k = 0; k < RPCS.length; k++) {
    const idx = (rpcIdx + k) % RPCS.length;
    try {
      const p = await getProviderFor(RPCS[idx]);
      const r = await withTimeout(p.call({ to, data }), RPC_TIMEOUT_MS);
      rpcIdx = idx; currentRpc = RPCS[idx];
      return r;
    } catch (e) {
      if (e && e.code === "CALL_EXCEPTION") throw e;
      ultimoErro = e;
    }
  }
  throw ultimoErro || new Error("Nenhum RPC respondeu");
}

async function callWallet(to, data) {
  if (!walletProvider) throw new Error("Carteira não conectada.");
  return await withTimeout(walletProvider.call({ to, data }), RPC_TIMEOUT_MS * 2);
}

async function lerSaldo(token, addr, caller = rawCall) {
  const r = await caller(token, "0x" + SEL_ERC20.balanceOf + encAddress(addr));
  return decUint(splitWords(r)[0]);
}
async function lerAllowance(token, owner, spender, caller = rawCall) {
  const r = await caller(token, "0x" + SEL_ERC20.allowance + encAddress(owner) + encAddress(spender));
  return decUint(splitWords(r)[0]);
}
async function saldoDe(ativo, addr, caller = callWallet) {
  if (ativo.native) {
    if (!walletProvider) throw new Error("Carteira não conectada.");
    const b = await withTimeout(walletProvider.getBalance(addr), RPC_TIMEOUT_MS * 2);
    return BigInt(b.toString());
  }
  return lerSaldo(ativo.address, addr, caller);
}

async function lerOrdem(addr, caller = rawCall) {
  const r = await caller(addr, "0x" + SEL_ESCROW.obterDados);
  const w = splitWords(r);
  if (w.length < 7) throw new Error("Resposta inválida do escrow.");
  return {
    endereco: addr,
    criador: decAddress(w[0]),
    tokenOferecido: decAddress(w[1]),
    tokenDesejado: decAddress(w[2]),
    valorOferecido: decUint(w[3]),
    valorDesejado: decUint(w[4]),
    executado: decBool(w[5]),
    cancelado: decBool(w[6]),
    saldoEscrow: null,
  };
}

function avaliar(o) {
  const tOf = tokenOk(o.tokenOferecido);
  const tDe = tokenOk(o.tokenDesejado);
  const suportada = !!tOf && !!tDe && tOf.address !== tDe.address;
  const ativa = !o.executado && !o.cancelado;
  const financiada = o.saldoEscrow === null || o.saldoEscrow === undefined
    ? null : o.saldoEscrow >= o.valorOferecido;
  const executavel = ativa && suportada && financiada !== false;
  return { suportada, ativa, financiada, executavel, tOf, tDe };
}

// ============================================================
// MENU
// ============================================================
function mostrarAba(nome, atualizarHash = true) {
  if (!ABAS.includes(nome)) nome = "mural";
  document.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === nome));
  document.querySelectorAll("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== nome; });
  if (atualizarHash) { try { history.replaceState(null, "", "#" + nome); } catch (e) { /* file:// */ } }
  if (nome === "enviar" || nome === "vender") atualizarHints();
}

// ============================================================
// FILTROS
// ============================================================
function aplicarFiltro(orders) {
  return orders.filter(o => {
    if (o.erro) return filtro.status === "todas" && !filtro.oferece && !filtro.pede && !filtro.minhas;
    const av = avaliar(o);
    if (filtro.status === "ativas" && !av.ativa) return false;
    if (filtro.status === "executaveis" && !av.executavel) return false;
    if (filtro.status === "executadas" && !o.executado) return false;
    if (filtro.status === "canceladas" && !o.cancelado) return false;
    if (filtro.oferece && !mesmoEndereco(o.tokenOferecido, filtro.oferece)) return false;
    if (filtro.pede && !mesmoEndereco(o.tokenDesejado, filtro.pede)) return false;
    if (filtro.minhas && !mesmoEndereco(o.criador, userAddress)) return false;
    return true;
  });
}

function lerFiltrosDaTela() {
  filtro.status = $("fStatus").value || "todas";
  filtro.oferece = $("fOferece").value || "";
  filtro.pede = $("fPede").value || "";
  filtro.minhas = $("fMinhas").checked;
  renderMural(ordersCache);
}

function limparFiltros() {
  $("fStatus").value = "todas"; $("fOferece").value = ""; $("fPede").value = ""; $("fMinhas").checked = false;
  lerFiltrosDaTela();
}

// ============================================================
// SELECTS
// ============================================================
function preencherSelect(sel, opcoes, valorAtual) {
  if (!sel) return;
  sel.replaceChildren(...opcoes.map(([v, txt]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = txt;
    return o;
  }));
  if (valorAtual && opcoes.some(([v]) => v === valorAtual)) sel.value = valorAtual;
}

function montarSelects() {
  const toks = tokensOk();
  const opts = toks.map(t => [t.address, t.symbol]);
  preencherSelect($("fOferece"), [["", "Todos os tokens"], ...opts], filtro.oferece);
  preencherSelect($("fPede"),    [["", "Todos os tokens"], ...opts], filtro.pede);

  const vOf = $("vTokOf"), vDe = $("vTokDe"), sAt = $("sAtivo");
  if (vOf) preencherSelect(vOf, opts, vOf.value);
  if (vDe) preencherSelect(vDe, opts, vDe.value);
  if (vOf && vDe && opts.length > 1 && vOf.value === vDe.value) {
    vDe.value = opts.find(([v]) => v !== vOf.value)[0];
  }
  if (sAt) preencherSelect(sAt, [["POL", "POL (nativo)"], ...toks.map(t => [t.address, t.symbol + " — " + t.name])], sAt.value);

  renderListaTokens();
  atualizarHints();
}

function renderListaTokens() {
  const ul = $("listaTokens");
  if (!ul) return;
  const itens = [{ symbol: "POL", name: "POL (nativo)", decimals: 18, native: true, ok: true }, ...TOKENS].map(t => {
    const li = el("li");
    li.appendChild(el("b", "", t.symbol));
    li.appendChild(document.createTextNode(" — " + t.name + " · " + t.decimals + " decimais · "));
    if (t.native) { li.appendChild(document.createTextNode("uso: envio")); return li; }
    li.appendChild(document.createTextNode(t.ok ? "✅ verificado " : "⚠️ desativado (" + (t.aviso || "aguardando verificação") + ") "));
    if (isAddr(t.address)) {
      const a = el("a", "", short(t.address) + " ↗");
      a.href = "https://polygonscan.com/token/" + t.address; a.target = "_blank"; a.rel = "noopener noreferrer";
      li.appendChild(a);
    }
    return li;
  });
  ul.replaceChildren(...itens);
}

// ============================================================
// MURAL
// ============================================================
function mostrarErroMural(msg) {
  const box = $("orders");
  if (!box) return;
  box.innerHTML = `<div class="empty"><div class="big">⚠️</div>Não foi possível consultar a blockchain.<br><small></small></div>`;
  const small = box.querySelector("small");
  if (small) small.textContent = msg;
}

async function carregarMural(silencioso = false) {
  if (carregando) return;
  carregando = true;
  const box = $("orders");

  if (!silencioso || !ordersCache.length) {
    if (box) box.innerHTML = `<div class="state"><div class="spinner"></div>Consultando a blockchain…</div>`;
    const c = $("counter"); if (c) c.textContent = "⏳ Consultando…";
    setNet("load", "Consultando…");
  }

  try {
    await garantirTokens();

    let addrs = [];
    try {
      const r = await rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.todasOrdens);
      addrs = decAddressArray(r);
    } catch (e) {
      const rTotal = await rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.totalOrdens);
      const n = Number(decUint(splitWords(rTotal)[0]));
      if (!Number.isSafeInteger(n) || n > MAX_ORDENS) throw new Error("Quantidade de ordens inválida ou grande demais.");
      const rs = await mapLimit(Array.from({ length: n }, (_, i) => i), CONCORRENCIA, (i) =>
        rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.ordem + encUint(i)));
      addrs = rs.map(r => decAddress(splitWords(r)[0]));
    }

    const detalhes = await mapLimit(addrs, CONCORRENCIA, async (addr, indice) => {
      try {
        const o = await lerOrdem(addr);
        o.indice = indice;
        if (!o.executado && !o.cancelado) {
          try { o.saldoEscrow = await lerSaldo(o.tokenOferecido, addr); }
          catch (e) { o.saldoEscrow = null; }
        }
        return o;
      } catch (e) { return { endereco: addr, indice, erro: true }; }
    });

    ordersCache = detalhes;
    renderMural(detalhes);

    const ok = detalhes.filter(o => !o.erro);
    const ativas = ok.filter(o => !o.executado && !o.cancelado).length;
    const executaveis = ok.filter(o => avaliar(o).executavel).length;
    const c = $("counter");
    if (c) c.textContent = `📋 ${ativas} ativa(s) · ${executaveis} executável(is) · ${detalhes.length} no total`;
    setNet("ok", "Polygon · online");
  } catch (e) {
    console.error(e);
    if (!silencioso || !ordersCache.length) {
      mostrarErroMural(e.message);
      const c = $("counter"); if (c) c.textContent = "❌ Falha na consulta";
      setNet("off", "Offline");
    } else {
      const c = $("counter"); if (c) c.textContent += " · ⚠️ falha ao atualizar";
    }
  } finally {
    carregando = false;
  }
}

function renderMural(orders) {
  const box = $("orders");
  if (!box) return;
  const info = $("muralInfo");
  if (!orders.length) {
    if (info) info.textContent = "";
    box.innerHTML = `<div class="empty"><div class="big">📭</div>Nenhuma ordem no mural ainda.<br>Crie a primeira na aba Vender.</div>`;
    return;
  }
  const visiveis = aplicarFiltro(orders);
  if (info) info.textContent = `Mostrando ${visiveis.length} de ${orders.length} ordem(ns)` +
    (filtro.minhas && !userAddress ? " · conecte a carteira para ver as suas" : "");
  if (!visiveis.length) {
    box.innerHTML = `<div class="empty"><div class="big">🔎</div>Nenhuma ordem com esses filtros.</div>`;
    return;
  }

  const rank = o => o.erro ? 3 : o.cancelado ? 2 : o.executado ? 1 : 0;
  const sorted = [...visiveis].sort((a, b) => rank(a) - rank(b) || a.indice - b.indice);

  box.innerHTML = sorted.map(o => {
    if (o.erro) {
      return `<div class="order"><div class="order-id">${esc(o.endereco)}</div>
        <div class="state" style="padding:10px">⚠️ Não foi possível ler esta ordem.</div></div>`;
    }
    const av = avaliar(o);
    const eDono = mesmoEndereco(userAddress, o.criador);

    let classe, tagTxt;
    if (o.cancelado)      { classe = "cancelled"; tagTxt = "Cancelada"; }
    else if (o.executado) { classe = "done";      tagTxt = "Executada"; }
    else if (!av.suportada)           { classe = "blocked"; tagTxt = "Token não suportado"; }
    else if (av.financiada === false) { classe = "blocked"; tagTxt = "Sem fundos"; }
    else                  { classe = "active";    tagTxt = "Ativa"; }

    const podeExecutar = av.executavel && !!userAddress && !eDono;
    const podeCancelar = av.ativa && !!userAddress && eDono;

    let aviso = "";
    if (av.ativa && !av.suportada) {
      aviso = `<div class="note">⚠️ Esta ordem usa token fora da lista de suportados (possível token falso). O app não permite executá-la.</div>`;
    } else if (av.ativa && av.financiada === false) {
      aviso = `<div class="note">⚠️ O escrow não possui os tokens da ordem — ela não pode ser executada.</div>`;
    }

    const addr = esc(o.endereco);
    const clsOf = av.tOf ? chipClasse(av.tOf.symbol) : "";
    const clsDe = av.tDe ? chipClasse(av.tDe.symbol) : "";
    return `
      <div class="order ${classe}">
        <div class="order-top">
          <span class="order-id">#${o.indice + 1} · ${esc(short(o.endereco))}</span>
          <span class="tag ${classe}">${esc(tagTxt)}</span>
        </div>
        <div class="swap">
          <div class="side">
            <div class="lbl">Oferece</div>
            <div class="amt ${clsOf}">${esc(fmtToken(o.valorOferecido, o.tokenOferecido))}</div>
          </div>
          <div class="arrow">⇄</div>
          <div class="side">
            <div class="lbl">Pede</div>
            <div class="amt ${clsDe}">${esc(fmtToken(o.valorDesejado, o.tokenDesejado))}</div>
          </div>
        </div>
        <div class="order-meta">
          <span>Criador: <b>${esc(short(o.criador))}</b></span>
          <span>Escrow: <b>${esc(short(o.endereco))}</b></span>
        </div>
        ${aviso}
        <div class="order-actions">
          ${podeExecutar ? `<button class="btn-ok btn-sm" data-action="executar" data-addr="${addr}">⚡ Executar (pagar ${esc(fmtToken(o.valorDesejado, o.tokenDesejado))})</button>` : ""}
          ${podeCancelar ? `<button class="btn-err btn-sm" data-action="cancelar" data-addr="${addr}">✖ Cancelar</button>` : ""}
          ${(!userAddress && av.executavel) ? `<span class="order-id">Conecte a carteira para interagir</span>` : ""}
        </div>
      </div>`;
  }).join("");
}

// ============================================================
// CARTEIRA
// ============================================================
async function garantirPolygon() {
  if (!window.ethereum) throw new Error("MetaMask não encontrada.");
  const msg = "Troque a MetaMask para a rede Polygon (chainId 137) e tente de novo.";
  const atual = await window.ethereum.request({ method: "eth_chainId" });
  if (parseInt(atual, 16) === POLYGON_CHAIN_ID) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + POLYGON_CHAIN_ID.toString(16) }],
    });
  } catch (e) { throw new Error(msg); }
  const depois = await window.ethereum.request({ method: "eth_chainId" });
  if (parseInt(depois, 16) !== POLYGON_CHAIN_ID) throw new Error(msg);
}

function setBotoes(habilitar) {
  const ok = habilitar && !!signer;
  IDS_ACOES.forEach(id => { const b = $(id); if (b) b.disabled = !ok; });
}

async function conectarCarteira() {
  if (!window.ethereum) { toast("MetaMask não encontrada. Instale a extensão.", "err"); return; }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts.length) throw new Error("Nenhuma conta disponível.");

    await garantirPolygon();

    userAddress = ethers.utils.getAddress(accounts[0]);
    walletProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
    signer = walletProvider.getSigner();

    const wi = $("walletInfo"); if (wi) wi.style.display = "block";
    const ad = $("addr"); if (ad) ad.textContent = userAddress;
    const bc = $("btnConnect"); if (bc) { bc.textContent = "🔌 Conectado"; bc.disabled = true; }
    setBotoes(true);

    await carregarSaldos();
    renderMural(ordersCache);
    toast("Carteira conectada: " + short(userAddress), "ok");

    if (!listenersRegistrados) {
      listenersRegistrados = true;
      window.ethereum.on("accountsChanged", () => location.reload());
      window.ethereum.on("chainChanged", (hex) => {
        if (parseInt(hex, 16) === POLYGON_CHAIN_ID) { toast("Rede Polygon ativa.", "ok"); carregarSaldos(); }
        else toast("Você saiu da Polygon. Transações ficam bloqueadas até voltar.", "warn", 8000);
      });
    }
  } catch (e) {
    console.error(e);
    userAddress = null; signer = null; walletProvider = null;
    setBotoes(false);
    toast("Falha ao conectar: " + erroLegivel(e), "err", 8000);
  }
}

function desconectar() {
  userAddress = null; signer = null; walletProvider = null;
  for (const k of Object.keys(saldos)) delete saldos[k];
  const wi = $("walletInfo"); if (wi) wi.style.display = "none";
  const bc = $("btnConnect"); if (bc) { bc.textContent = "🔌 Conectar carteira"; bc.disabled = false; }
  setBotoes(false);
  renderMural(ordersCache);
  atualizarHints();
  toast("Carteira desconectada.", "info");
}

function renderSaldos(ativos) {
  const box = $("balances");
  if (!box) return;
  box.replaceChildren(...ativos.map(a => {
    const card = el("div", "bal");
    const t = el("div", "t");
    t.appendChild(el("span", "chip " + chipClasse(a.symbol), a.symbol.slice(0, 1)));
    t.appendChild(document.createTextNode(" " + a.symbol));
    card.appendChild(t);
    const id = a.native ? "POL" : a.address;
    card.appendChild(el("div", "v", saldos[id] === undefined ? "—" : fmt(saldos[id], a.decimals)));
    return card;
  }));
}

async function carregarSaldos() {
  if (!userAddress) return;
  const ativos = [NATIVO, ...tokensOk()];
  await mapLimit(ativos, CONCORRENCIA, async (a) => {
    const id = a.native ? "POL" : a.address;
    try { saldos[id] = await saldoDe(a, userAddress, walletProvider ? callWallet : rawCall); }
    catch (e) { delete saldos[id]; }
  });
  renderSaldos(ativos);
  atualizarHints();
}

// ============================================================
// TRANSAÇÕES
// ============================================================
async function comTransacao(fn) {
  if (emTransacao) { toast("Aguarde a transação atual terminar.", "warn"); return; }
  if (!signer || !userAddress) { toast("Conecte a carteira primeiro.", "warn"); return; }
  emTransacao = true; setBotoes(false);
  try { await fn(); }
  catch (e) { console.error(e); toast(erroLegivel(e), "err", 8000); }
  finally { emTransacao = false; setBotoes(true); }
}

async function enviarTx(to, data, rotulo) {
  await garantirPolygon();
  try {
    await withTimeout(walletProvider.call({ from: userAddress, to, data }), RPC_TIMEOUT_MS * 2);
  } catch (e) {
    throw new Error("A simulação falhou (" + rotulo + "): " + erroLegivel(e) + " — nada foi enviado.");
  }
  const tx = await signer.sendTransaction({ to, data });
  toastTx("Transação enviada — aguardando…", tx.hash);
  const rc = await tx.wait();
  if (!rc || rc.status !== 1) throw new Error("A transação foi revertida on-chain (" + rotulo + ").");
  return rc;
}

async function enviarPOL(destino, valor) {
  await garantirPolygon();
  const hexValor = "0x" + valor.toString(16);
  try {
    await withTimeout(walletProvider.estimateGas({ from: userAddress, to: destino, value: hexValor }), RPC_TIMEOUT_MS * 2);
  } catch (e) {
    throw new Error("A simulação falhou (envio de POL): " + erroLegivel(e) + " — nada foi enviado.");
  }
  const tx = await signer.sendTransaction({ to: destino, value: hexValor });
  toastTx("Transação enviada — aguardando…", tx.hash);
  const rc = await tx.wait();
  if (!rc || rc.status !== 1) throw new Error("A transação foi revertida on-chain (envio de POL).");
  return rc;
}

async function recarregarApos() {
  await sleep(2500);
  await carregarSaldos();
  await carregarMural(false);
}

async function reservaGasPOL() {
  try {
    const fd = await walletProvider.getFeeData();
    const preco = fd.maxFeePerGas || fd.gasPrice;
    if (preco) return BigInt(preco.toString()) * 21000n * 2n;
  } catch (e) { /* usa o padrão */ }
  return 10n ** 16n;
}

// ---------------- ENVIAR ----------------
function enderecosBloqueados() {
  const s = new Set(["0x0000000000000000000000000000000000000000", ESCROW_FACTORY_ADDRESS.toLowerCase()]);
  TOKENS.forEach(t => { if (isAddr(t.address)) s.add(t.address.toLowerCase()); });
  ordersCache.forEach(o => { if (o.endereco) s.add(o.endereco.toLowerCase()); });
  return s;
}

function validarDestino(txt, meuEndereco = userAddress) {
  const s = String(txt || "").trim();
  if (!isAddr(s)) throw new Error("Endereço de destino inválido (use 0x + 40 caracteres).");
  const misto = s.slice(2) !== s.slice(2).toLowerCase() && s.slice(2) !== s.slice(2).toUpperCase();
  if (misto) {
    try { ethers.utils.getAddress(s); }
    catch (e) { throw new Error("Checksum do endereço inválido — possível erro de digitação."); }
  }
  const norm = ethers.utils.getAddress("0x" + s.slice(2).toLowerCase());
  if (mesmoEndereco(norm, meuEndereco)) throw new Error("O destino é o seu próprio endereço.");
  if (enderecosBloqueados().has(norm.toLowerCase())) {
    throw new Error("Destino bloqueado: é o zero-address, um contrato de token ou o factory/escrow. Os fundos seriam perdidos.");
  }
  return norm;
}

async function enviarAtivo() {
  await comTransacao(async () => {
    const ativo = ativoPorId($("sAtivo").value);
    if (!ativo) throw new Error("Escolha o que enviar.");
    const destino = validarDestino($("sDestino").value);
    const valor = lerValor($("sValor").value, ativo.decimals, ativo.symbol);
    await garantirPolygon();

    const saldo = await saldoDe(ativo, userAddress, callWallet);
    if (saldo < valor) throw new Error("Saldo insuficiente de " + ativo.symbol + ".");

    let ehContrato = false;
    try { ehContrato = (await walletProvider.getCode(destino)) !== "0x"; } catch (e) { /* ignora */ }

    const ok = window.confirm(
      "Enviar " + fmt(valor, ativo.decimals) + " " + ativo.symbol + "\n\n" +
      "Para:\n" + destino + "\n\n" +
      "Rede: Polygon" +
      (ehContrato ? "\n\n⚠️ O destino é um CONTRATO. Confirme que ele aceita receber " + ativo.symbol + "." : "") +
      "\n\nEssa ação não pode ser desfeita.");
    if (!ok) return;

    toast("Enviando " + ativo.symbol + "… confirme na MetaMask.", "info");
    let rc;
    if (ativo.native) {
      rc = await enviarPOL(destino, valor);
    } else {
      const data = "0x" + SEL_ERC20.transfer + encAddress(destino) + encUint(valor);
      rc = await enviarTx(ativo.address, data, "transferência de " + ativo.symbol);
    }
    toastTx("✅ " + ativo.symbol + " enviado!", rc.transactionHash, "ok");
    $("sValor").value = "";
    await sleep(2000);
    await carregarSaldos();
  });
}

async function maxEnviar() {
  try {
    const ativo = ativoPorId($("sAtivo").value);
    if (!ativo || !userAddress) return;
    let saldo = await saldoDe(ativo, userAddress, callWallet);
    if (ativo.native) {
      const reserva = await reservaGasPOL();
      saldo = saldo > reserva ? saldo - reserva : 0n;
    }
    if (saldo <= 0n) { toast("Sem saldo disponível de " + ativo.symbol + ".", "warn"); return; }
    $("sValor").value = paraInput(saldo, ativo.decimals);
  } catch (e) { toast(erroLegivel(e), "err"); }
}

// ---------------- VENDER ----------------
function tokensDaVenda() {
  const tOf = tokenOk($("vTokOf").value);
  const tDe = tokenOk($("vTokDe").value);
  if (!tOf || !tDe) throw new Error("Escolha tokens suportados.");
  if (tOf.address === tDe.address) throw new Error("Escolha tokens diferentes para oferecer e pedir.");
  return { tOf, tDe };
}

async function aprovarToken() {
  await comTransacao(async () => {
    const { tOf } = tokensDaVenda();
    const vOf = lerValor($("inOf").value, tOf.decimals, tOf.symbol);
    await garantirPolygon();
    const saldo = await lerSaldo(tOf.address, userAddress, callWallet);
    if (saldo < vOf) throw new Error("Saldo de " + tOf.symbol + " insuficiente para esse valor.");

    toast("Aprovando " + tOf.symbol + "… confirme na MetaMask.", "info");
    const data = "0x" + SEL_ERC20.approve + encAddress(ESCROW_FACTORY_ADDRESS) + encUint(vOf);
    await enviarTx(tOf.address, data, "approve " + tOf.symbol);
    toast("✅ " + tOf.symbol + " aprovado!", "ok");
  });
}

async function criarOrdem() {
  await comTransacao(async () => {
    const { tOf, tDe } = tokensDaVenda();
    const vOf = lerValor($("inOf").value, tOf.decimals, tOf.symbol);
    const vDe = lerValor($("inDe").value, tDe.decimals, tDe.symbol);
    await garantirPolygon();

    const [saldo, allow] = await Promise.all([
      lerSaldo(tOf.address, userAddress, callWallet),
      lerAllowance(tOf.address, userAddress, ESCROW_FACTORY_ADDRESS, callWallet),
    ]);
    if (saldo < vOf) throw new Error("Saldo de " + tOf.symbol + " insuficiente.");
    if (allow < vOf) throw new Error("Aprove o " + tOf.symbol + " primeiro (botão 'Aprovar').");

    const ok = window.confirm(
      "Criar ordem de venda?\n\n" +
      "Você trava " + fmt(vOf, tOf.decimals) + " " + tOf.symbol + " e pede " + fmt(vDe, tDe.decimals) + " " + tDe.symbol + ".\n\n" +
      "O contrato não é verificado: use valores pequenos.");
    if (!ok) return;

    const data = "0x" + SEL_FACTORY.criarOrdem +
      encAddress(tOf.address) + encAddress(tDe.address) +
      encUint(vOf) + encUint(vDe);

    toast("Criando ordem… confirme na MetaMask.", "info");
    await enviarTx(ESCROW_FACTORY_ADDRESS, data, "criar ordem");
    toast("✅ Ordem criada on-chain!", "ok");
    $("inOf").value = ""; $("inDe").value = "";
    atualizarCotacao();
    await recarregarApos();
    mostrarAba("mural");
  });
}

async function maxVender() {
  try {
    const { tOf } = tokensDaVenda();
    if (!userAddress) return;
    const saldo = await lerSaldo(tOf.address, userAddress, callWallet);
    if (saldo <= 0n) { toast("Sem saldo de " + tOf.symbol + ".", "warn"); return; }
    $("inOf").value = paraInput(saldo, tOf.decimals);
    atualizarCotacao();
  } catch (e) { toast(erroLegivel(e), "err"); }
}

// ---------------- EXECUTAR ----------------
async function executarOrdem(escrowAddr) {
  await comTransacao(async () => {
    const conhecida = ordersCache.find(x => mesmoEndereco(x.endereco, escrowAddr));
    if (!conhecida) throw new Error("Ordem não encontrada no mural.");
    await garantirPolygon();

    const o = await lerOrdem(escrowAddr, callWallet);
    if (o.executado || o.cancelado) { await carregarMural(false); throw new Error("Essa ordem não está mais ativa."); }
    if (mesmoEndereco(o.criador, userAddress)) throw new Error("Você não pode executar a sua própria ordem.");

    const av = avaliar(o);
    if (!av.suportada) throw new Error("Ordem bloqueada: token fora da lista de suportados.");
    const { tOf, tDe } = av;

    if (!conhecida.erro &&
        (conhecida.valorOferecido !== o.valorOferecido || conhecida.valorDesejado !== o.valorDesejado)) {
      await carregarMural(false);
      throw new Error("Os valores da ordem mudaram. Confira o mural atualizado.");
    }

    const saldoEscrow = await lerSaldo(tOf.address, escrowAddr, callWallet);
    if (saldoEscrow < o.valorOferecido) throw new Error("O escrow não tem os " + tOf.symbol + " da ordem — não é executável.");

    const saldoComprador = await lerSaldo(tDe.address, userAddress, callWallet);
    if (saldoComprador < o.valorDesejado) throw new Error("Saldo de " + tDe.symbol + " insuficiente.");

    const ok = window.confirm(
      "Executar ordem " + short(escrowAddr) + "?\n\n" +
      "Você paga: " + fmt(o.valorDesejado, tDe.decimals) + " " + tDe.symbol + "\n" +
      "Você recebe: " + fmt(o.valorOferecido, tOf.decimals) + " " + tOf.symbol);
    if (!ok) return;

    const allow = await lerAllowance(tDe.address, userAddress, escrowAddr, callWallet);
    if (allow < o.valorDesejado) {
      toast("Aprovando " + tDe.symbol + " para o escrow… confirme na MetaMask.", "info");
      const dataA = "0x" + SEL_ERC20.approve + encAddress(escrowAddr) + encUint(o.valorDesejado);
      await enviarTx(tDe.address, dataA, "approve " + tDe.symbol);
      toast("✅ " + tDe.symbol + " aprovado!", "ok");
      await sleep(1500);
    }

    toast("Executando ordem… confirme na MetaMask.", "info");
    await enviarTx(escrowAddr, "0x" + SEL_ESCROW.executar, "executar");
    toast("✅ Ordem executada! Troca concluída.", "ok");
    await recarregarApos();
  });
}

// ---------------- CANCELAR ----------------
async function cancelarOrdem(escrowAddr) {
  await comTransacao(async () => {
    const conhecida = ordersCache.find(x => mesmoEndereco(x.endereco, escrowAddr));
    if (!conhecida) throw new Error("Ordem não encontrada no mural.");
    await garantirPolygon();

    const o = await lerOrdem(escrowAddr, callWallet);
    if (o.executado || o.cancelado) { await carregarMural(false); throw new Error("Essa ordem não está mais ativa."); }
    if (!mesmoEndereco(o.criador, userAddress)) throw new Error("Só o criador pode cancelar esta ordem.");

    const ok = window.confirm("Cancelar a ordem " + short(escrowAddr) + " e receber os tokens de volta?");
    if (!ok) return;

    toast("Cancelando ordem… confirme na MetaMask.", "info");
    await enviarTx(escrowAddr, "0x" + SEL_ESCROW.cancelar, "cancelar");
    toast("✅ Ordem cancelada. Tokens devolvidos.", "ok");
    await recarregarApos();
  });
}

// ============================================================
// HINTS / COTAÇÃO
// ============================================================
function textoSaldo(ativo) {
  if (!ativo) return "";
  const id = ativo.native ? "POL" : ativo.address;
  return "Saldo: " + (saldos[id] === undefined ? "—" : fmt(saldos[id], ativo.decimals)) + " " + ativo.symbol;
}

function atualizarHints() {
  const tOf = tokenOk($("vTokOf").value);
  const tDe = tokenOk($("vTokDe").value);
  const ba = $("btnApprove");
  if (ba) ba.textContent = tOf ? "✅ Aprovar " + tOf.symbol : "✅ Aprovar";
  const so = $("vSaldoOf"); if (so) so.textContent = textoSaldo(tOf);
  const sd = $("vSaldoDe"); if (sd) sd.textContent = textoSaldo(tDe);
  const ss = $("sSaldo");   if (ss) ss.textContent = textoSaldo(ativoPorId($("sAtivo").value));
  atualizarCotacao();
}

function atualizarCotacao() {
  const tOf = tokenOk($("vTokOf").value);
  const tDe = tokenOk($("vTokDe").value);
  const b = Number(String($("inOf").value).replace(",", "."));
  const u = Number(String($("inDe").value).replace(",", "."));
  const info = $("rateInfo");
  if (!info) return;
  if (tOf && tDe && b > 0 && u > 0) {
    const preco = u / b;
    info.style.display = "block";
    info.textContent = "💱 Preço: 1 " + tOf.symbol + " = " +
      preco.toLocaleString("pt-BR", { maximumFractionDigits: 8 }) + " " + tDe.symbol;
  } else {
    info.style.display = "none";
  }
}

function evitarIguais(mudou) {
  const a = $("vTokOf"), b = $("vTokDe");
  if (!a || !b) return;
  if (a.value && a.value === b.value) {
    const outro = mudou === "of" ? b : a;
    const alt = tokensOk().find(t => t.address !== (mudou === "of" ? a.value : b.value));
    if (alt) outro.value = alt.address;
  }
  atualizarHints();
}

// ============================================================
// INIT
// ============================================================
function init() {
  normalizarTokens();

  const tabs = $("tabs");
  if (tabs) tabs.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-tab]");
    if (b) mostrarAba(b.dataset.tab);
  });
  window.addEventListener("hashchange", () => mostrarAba(location.hash.replace("#", ""), false));
  mostrarAba(location.hash.replace("#", ""), false);

  const bc = $("btnConnect"); if (bc) bc.addEventListener("click", conectarCarteira);
  const bd = $("btnDisconnect"); if (bd) bd.addEventListener("click", desconectar);

  const br = $("btnRefresh"); if (br) br.addEventListener("click", () => carregarMural(false));
  ["fStatus", "fOferece", "fPede", "fMinhas"].forEach(id => {
    const e = $(id); if (e) e.addEventListener("change", lerFiltrosDaTela);
  });
  const fl = $("fLimpar"); if (fl) fl.addEventListener("click", limparFiltros);

  const bap = $("btnApprove"); if (bap) bap.addEventListener("click", aprovarToken);
  const bcr = $("btnCreate"); if (bcr) bcr.addEventListener("click", criarOrdem);
  const bmo = $("btnMaxOf"); if (bmo) bmo.addEventListener("click", maxVender);
  const vOf = $("vTokOf"); if (vOf) vOf.addEventListener("change", () => evitarIguais("of"));
  const vDe = $("vTokDe"); if (vDe) vDe.addEventListener("change", () => evitarIguais("de"));
  const iOf = $("inOf"); if (iOf) iOf.addEventListener("input", atualizarCotacao);
  const iDe = $("inDe"); if (iDe) iDe.addEventListener("input", atualizarCotacao);

  const bs = $("btnSend"); if (bs) bs.addEventListener("click", enviarAtivo);
  const bms = $("btnMaxSend"); if (bms) bms.addEventListener("click", maxEnviar);
  const sa = $("sAtivo"); if (sa) sa.addEventListener("change", atualizarHints);

  const orders = $("orders");
  if (orders) orders.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-action]");
    if (!btn) return;
    const addr = btn.dataset.addr;
    if (!isAddr(addr)) return;
    if (btn.dataset.action === "executar") executarOrdem(addr);
    else if (btn.dataset.action === "cancelar") cancelarOrdem(addr);
  });

  renderListaTokens();
  carregarMural(false);
  setInterval(() => { if (!emTransacao && !document.hidden) carregarMural(true); }, 60000);
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
