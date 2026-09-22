// ============================================================
// APP.JS — Carteira BRN P2P (v4.1 — COMPLETO)
// ✅ Mural de ordens | ✅ Criar ordem | ✅ Executar/Cancelar
// ✅ Enviar tokens | ✅ Wrap/Unwrap POL ↔ WPOL
// ✅ RPC fallback | ✅ MetaMask Android compatível
// ============================================================

const ESCROW_FACTORY_ADDRESS = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;
const APP_VERSION = "v4.1";

const NATIVO = { symbol: "POL", name: "POL (nativo)", decimals: 18, native: true };
const TOKENS = [
  { symbol: "BRN",    name: "BRN",                address: "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210", decimals: 18 },
  { symbol: "USDC.e", name: "USD Coin (PoS)",     address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6 },
  { symbol: "USDC",   name: "USD Coin (nativo)",  address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
  { symbol: "USDT",   name: "Tether USD",         address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8a", decimals: 6 },
  { symbol: "DAI",    name: "Dai Stablecoin",     address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 },
  { symbol: "WPOL",   name: "Wrapped POL",        address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
  { symbol: "WBTC",   name: "Wrapped BTC",        address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
  { symbol: "WETH",   name: "Wrapped Ether",      address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
];

const RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://polygon-rpc.com",
  "https://rpc.ankr.com/polygon",
];
const RPC_TIMEOUT_MS = 8000;
const MAX_ORDENS = 1000;
const CONCORRENCIA = 8;

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
};
const SEL_WPOL = { deposit: "d0e30db0", withdraw: "2e1a7d4d" };

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
const ABAS = ["mural", "vender", "converter", "enviar", "ajuda"];
const IDS_ACOES = ["btnCreate", "btnApprove", "btnSend", "btnMaxOf", "btnMaxSend", "btnWrapPol", "btnUnwrapPol"];

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

function fmt(value, decimals, maxFrac = 8) {
  try {
    const s = ethers.utils.formatUnits(value.toString(), decimals);
    const partes = s.split(".");
    const inteiro = BigInt(partes[0]).toLocaleString("pt-BR");
    const frac = (partes[1] || "").slice(0, maxFrac).replace(/0+$/, "");
    if (BigInt(value) > 0n && inteiro === "0" && !frac) return "< 0," + "0".repeat(maxFrac - 1) + "1";
    return frac ? inteiro + "," + frac : inteiro;
  } catch (e) { return String(value); }
}

function paraInput(valor, decimals) {
  const s = ethers.utils.formatUnits(valor.toString(), decimals);
  return s.replace(/\.0+$/, "");
}

function toast(msg, type = "info", ms = 5000, href = null) {
  const box = $("toasts"); if (!box) return;
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
  if (!Number.isSafeInteger(len) || len > MAX_ORDENS || start + 1 + len > w.length) throw new Error("Lista de ordens inválida.");
  const arr = [];
  for (let i = 0; i < len; i++) arr.push(decAddress(w[start + 1 + i]));
  return arr;
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
// TOKENS
// ============================================================
function normalizarTokens() {
  for (const t of TOKENS) {
    try { t.address = ethers.utils.getAddress(t.address.toLowerCase()); }
    catch (e) { t.address = null; }
  }
}
function tokenPorEndereco(addr) { return TOKENS.find(t => t.address && mesmoEndereco(t.address, addr)) || null; }
function tokenOk(addr) { return tokenPorEndereco(addr); }
function tokensOk() { return TOKENS.filter(t => !!t.address); }
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
// RPCs
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
  if (parseInt(hex, 16) !== POLYGON_CHAIN_ID) throw new Error("RPC em rede errada");
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
// NAVEGAÇÃO
// ============================================================
function mostrarAba(nome, atualizarHash = true) {
  if (!ABAS.includes(nome)) nome = "mural";
  document.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === nome));
  document.querySelectorAll("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== nome; });
  if (atualizarHash) { try { history.replaceState(null, "", "#" + nome); } catch (e) {} }
  if (nome === "enviar" || nome === "vender" || nome === "converter") atualizarHints();
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
    const o = document.createElement("option"); o.value = v; o.textContent = txt; return o;
  }));
  if (valorAtual && opcoes.some(([v]) => v === valorAtual)) sel.value = valorAtual;
}

function montarSelects() {
  const toks = tokensOk();
  const opts = toks.map(t => [t.address, t.symbol]);
  preencherSelect($("fOferece"), [["", "Todos os tokens"], ...opts], filtro.oferece);
  preencherSelect($("fPede"),    [["", "Todos os tokens"], ...opts], filtro.pede);

  const vOf = $("vTokOf"), vDe = $("vTokDe");
  if (vOf) preencherSelect(vOf, opts, vOf.value);
  if (vDe) preencherSelect(vDe, opts, vDe.value);
  if (vOf && vDe && opts.length > 1 && vOf.value === vDe.value) {
    vDe.value = opts.find(([v]) => v !== vOf.value)[0][0];
  }
  atualizarHints();
}

// ============================================================
// MURAL
// ============================================================
function mostrarErroMural(msg) {
  const box = $("orders"); if (!box) return;
  box.innerHTML = `<div class="empty"><div class="big">⚠️</div>Não foi possível consultar a blockchain.<br><small>${esc(msg)}</small></div>`;
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
    let addrs = [];
    try {
      const r = await rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.todasOrdens);
      addrs = decAddressArray(r);
    } catch (e) {
      const rTotal = await rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.totalOrdens);
      const n = Number(decUint(splitWords(rTotal)[0]));
      if (!Number.isSafeInteger(n) || n > MAX_ORDENS) throw new Error("Quantidade de ordens inválida.");
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
    if (!silencioso || !ordersCache.length) mostrarErroMural(e.message);
    const c = $("counter"); if (c) c.textContent = "❌ Falha na consulta";
    setNet("off", "Offline");
  } finally {
    carregando = false;
  }
}

function renderMural(orders) {
  const box = $("orders"); if (!box) return;
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
    if (o.erro) return `<div class="order error"><div class="order-head"><span class="order-num">—</span><span class="order-id">${esc(o.endereco)}</span></div><div class="order-body dim">⚠️ Não foi possível ler esta ordem.</div></div>`;
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

    let escrowInfo = "";
    if (av.ativa && o.saldoEscrow !== null) {
      const ok = o.saldoEscrow >= o.valorOferecido;
      escrowInfo = `<div class="swap-escrow ${ok ? "ok" : "bad"}">${ok ? "✓" : "⚠"} No escrow: ${esc(fmtToken(o.saldoEscrow, o.tokenOferecido))}</div>`;
    }

    const clsOf = av.tOf ? chipClasse(av.tOf.symbol) : "other";
    const clsDe = av.tDe ? chipClasse(av.tDe.symbol) : "other";

    return `
      <div class="order ${classe}">
        <div class="order-head">
          <span class="order-num">#${o.indice + 1}</span>
          <span class="order-id" title="${esc(o.endereco)}">${esc(short(o.endereco))}</span>
          <span class="tag ${classe}">${esc(tagTxt)}</span>
        </div>
        <div class="swap">
          <div class="swap-side">
            <div class="swap-lbl">Oferece</div>
            <div class="swap-amt ${clsOf}">${esc(fmtToken(o.valorOferecido, o.tokenOferecido))}</div>
            ${escrowInfo}
          </div>
          <div class="swap-icon">⇄</div>
          <div class="swap-side">
            <div class="swap-lbl">Pede</div>
            <div class="swap-amt ${clsDe}">${esc(fmtToken(o.valorDesejado, o.tokenDesejado))}</div>
          </div>
        </div>
        <div class="order-foot">
          <div class="order-meta"><span title="${esc(o.criador)}">👤 ${esc(short(o.criador))}</span></div>
          <div class="order-actions">
            ${podeExecutar ? `<button class="btn-ok btn-sm" data-action="executar" data-addr="${esc(o.endereco)}">⚡ Executar</button>` : ""}
            ${podeCancelar ? `<button class="btn-err btn-sm" data-action="cancelar" data-addr="${esc(o.endereco)}">✖ Cancelar</button>` : ""}
            ${!userAddress && av.executavel ? `<span class="order-id dim">conecte a carteira</span>` : ""}
          </div>
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
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + POLYGON_CHAIN_ID.toString(16) }] });
  } catch (e) { throw new Error(msg); }
  if (parseInt(await window.ethereum.request({ method: "eth_chainId" }), 16) !== POLYGON_CHAIN_ID) throw new Error(msg);
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
        else toast("Você saiu da Polygon. Transações bloqueadas.", "warn", 8000);
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

function atualizarHints() {
  const hs = document.querySelectorAll("[data-hint]");
  hs.forEach(el => {
    const a = el.dataset.hint;
    if (!userAddress) el.textContent = "Conecte a carteira primeiro.";
    else if (a === "saldoPOL") el.textContent = saldos.POL !== undefined ? fmt(saldos.POL, 18) + " POL" : "—";
    else if (a === "saldoWPOL") {
      const wpol = tokenOk(TOKENS.find(t => t.symbol === "WPOL").address);
      el.textContent = wpol && saldos[wpol.address] !== undefined ? fmt(saldos[wpol.address], wpol.decimals) + " WPOL" : "—";
    }
    else if (a.startsWith("saldo:")) {
      const addr = a.slice(6);
      const t = tokenOk(addr);
      el.textContent = t && saldos[addr] !== undefined ? fmt(saldos[addr], t.decimals) + " " + t.symbol : "—";
    }
  });
}

async function carregarSaldos() {
  if (!userAddress) return;
  const ativos = [NATIVO, ...tokensOk()];
  await mapLimit(ativos, CONCORRENCIA, async (a) => {
    const id = a.native ? "POL" : a.address;
    try { saldos[id] = await saldoDe(a, userAddress, walletProvider ? callWallet : rawCall); }
    catch (e) { saldos[id] = undefined; }
  });
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

async function enviarTx(to, data, rotulo, valor = null) {
  await garantirPolygon();
  try {
    const opts = { from: userAddress, to, data };
    if (valor !== null) opts.value = valor;
    await withTimeout(walletProvider.call(opts), RPC_TIMEOUT_MS * 2);
  } catch (e) { throw new Error("Simulação falhou (" + rotulo + "): " + erroLegivel(e)); }
  const tx = await signer.sendTransaction({ to, data, value: valor });
  toastTx("Transação enviada", tx.hash);
  const rc = await tx.wait();
  if (!rc || rc.status !== 1) throw new Error("Transação revertida: " + rotulo);
  return rc;
}

async function recarregarApos() {
  await sleep(3000);
  await carregarSaldos();
  await carregarMural(false);
}

// ============================================================
// ✅ CONVERSÃO POL ↔ WPOL
// ============================================================
async function wrapPOL() {
  await comTransacao(async () => {
    const wpol = tokenOk(TOKENS.find(t => t.symbol === "WPOL").address);
    if (!wpol) throw new Error("WPOL não encontrado.");
    
    const valor = lerValor($("wpolValor").value, 18, "POL");
    const saldo = await saldoDe(NATIVO, userAddress, callWallet);
    if (valor > saldo - 10n ** 15n) throw new Error("Saldo POL insuficiente (reserve para gás).");
    
    await enviarTx(wpol.address, "0x" + SEL_WPOL.deposit, "Wrap POL→WPOL", valor);
    toast(`✅ ${fmt(valor, 18)} POL → WPOL concluído!`, "ok");
    $("wpolValor").value = "";
    await recarregarApos();
  });
}

async function unwrapPOL() {
  await comTransacao(async () => {
    const wpol = tokenOk(TOKENS.find(t => t.symbol === "WPOL").address);
    if (!wpol) throw new Error("WPOL não encontrado.");
    
    const valor = lerValor($("unwrapValor").value, 18, "WPOL");
    const saldo = await saldoDe(wpol, userAddress, callWallet);
    if (valor > saldo) throw new Error("Saldo WPOL insuficiente.");
    
    await enviarTx(wpol.address, "0x" + SEL_WPOL.withdraw + encUint(valor), "Unwrap WPOL→POL");
    toast(`✅ ${fmt(valor, 18)} WPOL → POL concluído!`, "ok");
    $("unwrapValor").value = "";
    await recarregarApos();
  });
}

// ============================================================
// ✅ ENVIAR TOKENS
// ============================================================
function validarDestino(txt) {
  const s = String(txt || "").trim();
  if (!isAddr(s)) throw new Error("Endereço inválido. Use 0x + 40 caracteres.");
  return ethers.utils.getAddress(s.toLowerCase());
}

async function enviarToken() {
  await comTransacao(async () => {
    const tokenAddr = $("sendToken").value;
    const destino = validarDestino($("sendDestino").value);
    const valorInput = $("sendValor").value;
    
    const token = tokenOk(tokenAddr);
    if (!token) throw new Error("Token não suportado.");
    
    const valor = lerValor(valorInput, token.decimals, token.symbol);
    const saldo = await saldoDe(token, userAddress, callWallet);
    if (valor > saldo) throw new Error(`Saldo insuficiente. Você tem ${fmt(saldo, token.decimals)} ${token.symbol}`);
    
    await enviarTx(token.address, "0x" + SEL_ERC20.transfer + encAddress(destino) + encUint(valor), 
      `Enviar ${token.symbol}`);
    toast(`✅ ${fmt(valor, token.decimals)} ${token.symbol} enviado para ${short(destino)}`, "ok");
    $("sendValor").value = ""; $("sendDestino").value = "";
    await recarregarApos();
  });
}

// ============================================================
// ✅ CRIAR ORDEM DE TROCA
// ============================================================
async function criarOrdem() {
  await comTransacao(async () => {
    const tokOf = $("vTokOf").value;
    const tokDe = $("vTokDe").value;
    const valOf = $("vValOf").value;
    const valDe = $("vValDe").value;

    if (tokOf === tokDe) throw new Error("Os tokens devem ser diferentes.");

    const tOf = tokenOk(tokOf), tDe = tokenOk(tokDe);
    if (!tOf || !tDe) throw new Error("Token não suportado.");

    const vOf = lerValor(valOf, tOf.decimals, tOf.symbol);
    const vDe = lerValor(valDe, tDe.decimals, tDe.symbol);

    const saldo = await saldoDe(tOf, userAddress, callWallet);
    if (vOf > saldo) throw new Error(`Saldo insuficiente. Você tem ${fmt(saldo, tOf.decimals)} ${tOf.symbol}`);

    const allowance = await lerAllowance(tOf.address, userAddress, ESCROW_FACTORY_ADDRESS, callWallet);
    if (allowance < vOf) {
      toast("🔑 Aprovando tokens para o escrow…", "info");
      await enviarTx(tOf.address, "0x" + SEL_ERC20.approve + encAddress(ESCROW_FACTORY_ADDRESS) + encUint(vOf), "Aprovar tokens");
    }

    await enviarTx(ESCROW_FACTORY_ADDRESS,
      "0x" + SEL_FACTORY.criarOrdem + encAddress(tOf.address) + encUint(vOf) + encAddress(tDe.address) + encUint(vDe),
      "Criar ordem");
    
    toast(`✅ Ordem criada! Oferece: ${fmt(vOf, tOf.decimals)} ${tOf.symbol} → Pede: ${fmt(vDe, tDe.decimals)} ${tDe.symbol}`, "ok");
    $("vValOf").value = ""; $("vValDe").value = "";
    await recarregarApos();
  });
}

// ============================================================
// ✅ EXECUTAR ORDEM
// ============================================================
async function executarOrdem(endereco) {
  await comTransacao(async () => {
    const ordem = await lerOrdem(endereco, callWallet);
    const av = avaliar(ordem);
    if (!av.executavel) throw new Error("Esta ordem não pode ser executada.");
    if (mesmoEndereco(ordem.criador, userAddress)) throw new Error("Você não pode executar sua própria ordem.");

    const saldo = await saldoDe(av.tDe.address, userAddress, callWallet);
    if (saldo < ordem.valorDesejado) throw new Error(`Saldo insuficiente. Precisa de ${fmt(ordem.valorDesejado, av.tDe.decimals)} ${av.tDe.symbol}`);

    const allowance = await lerAllowance(av.tDe.address, userAddress, endereco, callWallet);
    if (allowance < ordem.valorDesejado) {
      toast("🔑 Aprovando tokens para o escrow…", "info");
      await enviarTx(av.tDe.address, "0x" + SEL_ERC20.approve + encAddress(endereco) + encUint(ordem.valorDesejado), "Aprovar para troca");
    }

    await enviarTx(endereco, "0x" + SEL_ESCROW.executar, "Executar troca");
    toast("✅ Troca concluída com sucesso!", "ok");
    await recarregarApos();
  });
}

// ============================================================
// ✅ CANCELAR ORDEM
// ============================================================
async function cancelarOrdem(endereco) {
  if (!confirm("Tem certeza que deseja cancelar esta ordem? Os tokens serão devolvidos.")) return;
  await comTransacao(async () => {
    const ordem = await lerOrdem(endereco, callWallet);
    if (!mesmoEndereco(ordem.criador, userAddress)) throw new Error("Você não é o criador desta ordem.");
    if (ordem.executado || ordem.cancelado) throw new Error("Esta ordem já foi finalizada.");

    await enviarTx(endereco, "0x" + SEL_ESCROW.cancelar, "Cancelar ordem");
    toast("✅ Ordem cancelada. Tokens devolvidos!", "ok");
    await recarregarApos();
  });
}

// ============================================================
// ✅ EVENTOS
// ============================================================
function registrarEventos() {
  // Navegação entre abas
  document.querySelectorAll("[data-tab]").forEach(b => {
    b.addEventListener("click", () => mostrarAba(b.dataset.tab));
  });

  // Conectar/Desconectar carteira
  const btnConn = $("btnConnect");
  if (btnConn) btnConn.addEventListener("click", () => {
    if (userAddress) desconectar();
    else conectarCarteira();
  });

  // Filtros
  $("fStatus")?.addEventListener("change", lerFiltrosDaTela);
  $("fOferece")?.addEventListener("change", lerFiltrosDaTela);
  $("fPede")?.addEventListener("change", lerFiltrosDaTela);
  $("fMinhas")?.addEventListener("change", lerFiltrosDaTela);
  $("btnLimparFiltros")?.addEventListener("click", limparFiltros);

  // Ações
  $("btnCreate")?.addEventListener("click", criarOrdem);
  $("btnSend")?.addEventListener("click", enviarToken);
  $("btnWrapPol")?.addEventListener("click", wrapPOL);
  $("btnUnwrapPol")?.addEventListener("click", unwrapPOL);

  // Botões de máximo
  $("btnMaxOf")?.addEventListener("click", () => {
    const sel = $("vTokOf")?.value;
    if (!sel || !userAddress) return;
    const t = tokenOk(sel);
    if (!t) return;
    saldoDe(t, userAddress, callWallet).then(s => {
      $("vValOf").value = paraInput(s, t.decimals);
    });
  });
  $("btnMaxSend")?.addEventListener("click", () => {
    const sel = $("sendToken")?.value;
    if (!sel || !userAddress) return;
    const t = tokenOk(sel);
    if (!t) return;
    saldoDe(t, userAddress, callWallet).then(s => {
      $("sendValor").value = paraInput(s, t.decimals);
    });
  });

  // Ações no mural (delegação)
  $("orders")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const addr = btn.dataset.addr;
    const acao = btn.dataset.action;
    if (!isAddr(addr)) return;
    if (acao === "executar") executarOrdem(addr);
    else if (acao === "cancelar") cancelarOrdem(addr);
  });

  // Atualizar mural
  $("btnRefresh")?.addEventListener("click", () => carregarMural(false));
}

// ============================================================
// ✅ INICIALIZAÇÃO
// ============================================================
async function init() {
  normalizarTokens();
  montarSelects();
  registrarEventos();
  
  // Restaurar aba da URL
  const hash = window.location.hash.slice(1);
  mostrarAba(hash || "mural", false);
  
  await carregarMural();
  
  // Atualização automática a cada 30s
  setInterval(() => carregarMural(true), 30000);
}

document.addEventListener("DOMContentLoaded", init);