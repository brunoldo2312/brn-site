// ============================================================
// APP.JS — Carteira BRN P2P + CONSULTA BTC
// Versão: 5.0 | Data: 2026-09-22
// ============================================================

const ESCROW_FACTORY_ADDRESS = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;
const APP_VERSION = "v5.0";

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
const ABAS = ["mural", "vender", "enviar", "converter", "btc", "ajuda"];

// ============================================================
// 🟠 CONSULTA DE SALDO BTC — API PÚBLICA
// ============================================================

/**
 * Valida formato de endereço Bitcoin
 * Suporta: bc1q… (SegWit), 1… (Legacy), 3… (P2SH)
 */
function validarEnderecoBTC(endereco) {
  if (!endereco || typeof endereco !== "string") return false;
  const s = endereco.trim();
  if (/^bc1q[a-z0-9]{38,59}$/i.test(s)) return true;
  if (/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(s)) return true;
  if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(s)) return true;
  return false;
}

/**
 * Consulta saldo de endereço BTC via API pública do mempool.space
 * NÃO precisa de chave — apenas leitura pública
 */
async function consultarSaldoBTC(enderecoBTC) {
  const resultadoEl = document.getElementById("btcBalanceResult");
  const valorEl = document.getElementById("btcBalanceValue");
  const detalhesEl = document.getElementById("btcBalanceDetails");
  
  if (!validarEnderecoBTC(enderecoBTC)) {
    toast("Endereço BTC inválido. Verifique o formato.", "warn");
    if (resultadoEl) resultadoEl.classList.remove("show");
    return null;
  }

  try {
    const apiUrl = `https://mempool.space/api/address/${enderecoBTC.trim()}`;
    const resposta = await fetch(apiUrl, {
      method: "GET",
      cache: "no-cache",
      signal: AbortSignal.timeout(10000)
    });

    if (!resposta.ok) {
      throw new Error(`Endereço não encontrado ou API indisponível (${resposta.status})`);
    }

    const dados = await resposta.json();
    
    const saldoTotal = dados.chain_stats.funded_txo_sum / 100000000;
    const saldoGasto = dados.chain_stats.spent_txo_sum / 100000000;
    const saldoConfirmado = saldoTotal - saldoGasto;
    const saldoPendenteEntrada = dados.mempool_stats.funded_txo_sum / 100000000;
    const saldoPendenteSaida = dados.mempool_stats.spent_txo_sum / 100000000;
    const saldoPendente = saldoPendenteEntrada - saldoPendenteSaida;

    if (valorEl) valorEl.textContent = `${saldoConfirmado.toFixed(8)} BTC`;
    if (detalhesEl) {
      detalhesEl.textContent = saldoPendente > 0 
        ? `Pendente: +${saldoPendente.toFixed(8)} BTC` 
        : saldoPendente < 0
          ? `Pendente: ${saldoPendente.toFixed(8)} BTC`
          : "Nenhuma transação pendente";
    }
    if (resultadoEl) resultadoEl.classList.add("show");
    toast("✅ Saldo consultado com sucesso!", "ok");
    
    return { 
      endereco: enderecoBTC,
      saldoConfirmado,
      saldoPendente,
      totalRecebido: saldoTotal,
      totalGasto: saldoGasto
    };
  } catch (erro) {
    console.error("Erro na consulta BTC:", erro);
    if (valorEl) valorEl.textContent = "Erro na consulta";
    if (detalhesEl) detalhesEl.textContent = erro.message || "Tente novamente mais tarde";
    if (resultadoEl) resultadoEl.classList.add("show");
    toast("Falha ao consultar: " + erro.message, "err");
    return null;
  }
}

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
  if (symbol === "WBTC") return "btc";
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

async function getProvider(rpcUrl) {
  if (providersOk[rpcUrl]) return providersOk[rpcUrl];
  const p = new ethers.providers.JsonRpcProvider(rpcUrl);
  p._url = rpcUrl;
  try {
    await withTimeout(p.getBlockNumber(), RPC_TIMEOUT_MS);
    providersOk[rpcUrl] = p;
  } catch (e) {
    console.warn("RPC indisponível:", rpcUrl, e.message);
    throw e;
  }
  return p;
}

async function getAnyProvider() {
  for (let tentativa = 0; tentativa < RPCS.length * 2; tentativa++) {
    rpcIdx = (rpcIdx + 1) % RPCS.length;
    const url = RPCS[rpcIdx];
    try {
      currentRpc = await getProvider(url);
      return currentRpc;
    } catch (e) { continue; }
  }
  throw new Error("Nenhum RPC da rede Polygon está acessível no momento. Tente novamente mais tarde.");
}

async function rpcCall(method, params = []) {
  const p = currentRpc || (await getAnyProvider());
  for (let i = 0; i < 3; i++) {
    try {
      return await withTimeout(p.send(method, params), RPC_TIMEOUT_MS);
    } catch (e) {
      currentRpc = null;
      if (i === 2) throw e;
      await sleep(500);
    }
  }
}

// ============================================================
// LEITURA DE CONTRATOS
// ============================================================
async function lerEndereco(addrContract, selector, ...args) {
  const p = currentRpc || (await getAnyProvider());
  const data = "0x" + selector + args.map(a => encAddress(a)).join("");
  for (let i = 0; i < 3; i++) {
    try {
      const r = await withTimeout(p.call({ to: addrContract, data }), RPC_TIMEOUT_MS);
      return decAddress(r);
    } catch (e) {
      currentRpc = null;
      if (i === 2) throw e;
      await sleep(300);
    }
  }
}

async function lerUint(addrContract, selector, ...args) {
  const p = currentRpc || (await getAnyProvider());
  const data = "0x" + selector + args.map(a => encUint(a)).join("");
  for (let i = 0; i < 3; i++) {
    try {
      const r = await withTimeout(p.call({ to: addrContract, data }), RPC_TIMEOUT_MS);
      return decUint(r);
    } catch (e) {
      currentRpc = null;
      if (i === 2) throw e;
      await sleep(300);
    }
  }
}

async function lerBool(addrContract, selector, ...args) {
  const p = currentRpc || (await getAnyProvider());
  const data = "0x" + selector + args.map(a => encUint(a)).join("");
  for (let i = 0; i < 3; i++) {
    try {
      const r = await withTimeout(p.call({ to: addrContract, data }), RPC_TIMEOUT_MS);
      return decBool(r);
    } catch (e) {
      currentRpc = null;
      if (i === 2) throw e;
      await sleep(300);
    }
  }
}

async function lerEnderecoArray(addrContract, selector, ...args) {
  const p = currentRpc || (await getAnyProvider());
  const data = "0x" + selector + args.map(a => encAddress(a)).join("");
  for (let i = 0; i < 3; i++) {
    try {
      const r = await withTimeout(p.call({ to: addrContract, data }), RPC_TIMEOUT_MS);
      return decAddressArray(r);
    } catch (e) {
      currentRpc = null;
      if (i === 2) throw e;
      await sleep(300);
    }
  }
}

// ============================================================
// CARTEIRA / CONEXÃO
// ============================================================
async function conectarCarteira() {
  if (!window.ethereum) {
    toast("MetaMask não detectada. Instale a extensão MetaMask no navegador.", "err", 8000);
    return false;
  }
  try {
    walletProvider = new ethers.providers.Web3Provider(window.ethereum);
    await walletProvider.send("eth_requestAccounts", []);
    signer = walletProvider.getSigner();
    userAddress = await signer.getAddress();
    
    const rede = await walletProvider.getNetwork();
    if (rede.chainId !== POLYGON_CHAIN_ID) {
      toast("Mudando para a rede Polygon…", "info");
      try {
        await walletProvider.send("wallet_switchEthereumChain", [{ chainId: "0x" + POLYGON_CHAIN_ID.toString(16) }]);
      } catch (e) {
        if (e.code === 4902) {
          await walletProvider.send("wallet_addEthereumChain", [{
            chainId: "0x" + POLYGON_CHAIN_ID.toString(16),
            chainName: "Polygon Mainnet",
            rpcUrls: ["https://polygon-rpc.com"],
            nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
            blockExplorerUrls: ["https://polygonscan.com"]
          }]);
        } else throw e;
      }
    }
    
    $("btnConnect").style.display = "none";
    $("walletInfo").style.display = "flex";
    $("addr").textContent = short(userAddress);
    setNet("ok", "Conectado");
    
    await atualizarSaldos();
    await carregarOrdens();
    registrarEventosCarteira();
    return true;
  } catch (e) {
    toast("Falha ao conectar: " + erroLegivel(e), "err");
    desconectarCarteira();
    return false;
  }
}

function desconectarCarteira() {
  walletProvider = null;
  signer = null;
  userAddress = null;
  $("btnConnect").style.display = "inline-block";
  $("walletInfo").style.display = "none";
  Object.keys(saldos).forEach(k => delete saldos[k]);
  atualizarExibicaoSaldos();
}

function registrarEventosCarteira() {
  if (listenersRegistrados) return;
  listenersRegistrados = true;
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", contas => {
      if (contas.length === 0) desconectarCarteira();
      else window.location.reload();
    });
    window.ethereum.on("chainChanged", () => window.location.reload());
  }
}

// ============================================================
// SALDOS
// ============================================================
async function atualizarSaldos() {
  if (!userAddress) return;
  try {
    const p = await getAnyProvider();
    
    // Saldo nativo POL
    const saldoPOL = await p.getBalance(userAddress);
    saldos["POL"] = saldoPOL;
    
    // Saldos de tokens
    for (const t of tokensOk()) {
      try {
        const data = "0x" + SEL_ERC20.balanceOf + encAddress(userAddress);
        const r = await withTimeout(p.call({ to: t.address, data }), RPC_TIMEOUT_MS);
        saldos[t.symbol] = decUint(r);
      } catch (e) { saldos[t.symbol] = 0n; }
    }
    
    atualizarExibicaoSaldos();
  } catch (e) { console.warn("Erro ao atualizar saldos:", e); }
}

function atualizarExibicaoSaldos() {
  const container = $("balances");
  if (!container) return;
  container.innerHTML = "";
  
  if (!userAddress) {
    container.innerHTML = '<p class="dim">Conecte sua carteira para ver seus saldos.</p>';
    return;
  }
  
  // POL
  container.appendChild(el("div", "bal", `
    <span class="t">POL (nativo)</span>
    <span class="v">${fmt(saldos["POL"] || 0n, 18)}</span>
  `));
  
  // Tokens
  for (const t of tokensOk()) {
    if (t.symbol === "WPOL") continue;
    container.appendChild(el("div", "bal", `
      <span class="t">${t.symbol}</span>
      <span class="v">${fmt(saldos[t.symbol] || 0n, t.decimals)}</span>
    `));
  }
}

// ============================================================
// ORDENS
// ============================================================
async function totalOrdens() {
  try {
    return await lerUint(ESCROW_FACTORY_ADDRESS, SEL_FACTORY.totalOrdens);
  } catch (e) {
    console.warn("Não foi possível ler total de ordens:", e);
    return 0n;
  }
}

async function carregarOrdens() {
  if (carregando) return;
  carregando = true;
  $("orders").innerHTML = '<div class="state"><div class="spinner"></div><p>Consultando blockchain…</p></div>';
  
  try {
    const total = await totalOrdens();
    $("counter").textContent = `Ordens ativas: ${total.toString()}`;
    
    if (total === 0n) {
      ordersCache = [];
      exibirOrdensFiltradas();
      return;
    }
    
    const listaEscrow = await lerEnderecoArray(ESCROW_FACTORY_ADDRESS, SEL_FACTORY.todasOrdens);
    $("orders").innerHTML = `<div class="state"><div class="spinner"></div><p>Carregando ${listaEscrow.length} ordens…</p></div>`;
    
    ordersCache = [];
    for (const escrowAddr of listaEscrow) {
      try {
        const [criador, tokenOferecido, valorOferecido, tokenDesejado, valorDesejado, executado, cancelado] = await Promise.all([
          lerEndereco(escrowAddr, SEL_ESCROW.criador),
          lerEndereco(escrowAddr, SEL_ESCROW.tokenOferecido),
          lerUint(escrowAddr, SEL_ESCROW.valorOferecido),
          lerEndereco(escrowAddr, SEL_ESCROW.tokenDesejado),
          lerUint(escrowAddr, SEL_ESCROW.valorDesejado),
          lerBool(escrowAddr, SEL_ESCROW.executado),
          lerBool(escrowAddr, SEL_ESCROW.cancelado),
        ]);
        
        ordersCache.push({
          id: escrowAddr,
          criador,
          tokenOferecido,
          valorOferecido,
          tokenDesejado,
          valorDesejado,
          executado,
          cancelado,
        });
      } catch (e) { console.warn("Erro ao ler ordem", escrowAddr, e); }
    }
    
    exibirOrdensFiltradas();
  } catch (e) {
    $("orders").innerHTML = `<p class="warn">Erro ao carregar ordens: ${esc(erroLegivel(e))}</p>`;
  } finally {
    carregando = false;
  }
}

function exibirOrdensFiltradas() {
  const container = $("orders");
  let filtradas = ordersCache.filter(o => {
    if (o.executado || o.cancelado) return false;
    if (filtro.minhas && !mesmoEndereco(o.criador, userAddress)) return false;
    if (filtro.oferece && !mesmoEndereco(o.tokenOferecido, filtro.oferece)) return false;
    if (filtro.pede && !mesmoEndereco(o.tokenDesejado, filtro.pede)) return false;
    return true;
  });
  
  if (filtradas.length === 0) {
    container.innerHTML = '<p class="dim">Nenhuma ordem encontrada com os filtros atuais.</p>';
    return;
  }
  
  container.innerHTML = "";
  for (const ordem of filtradas) {
    const tokOferece = tokenOk(ordem.tokenOferecido);
    const tokDeseja = tokenOk(ordem.tokenDesejado);
    const ehMeu = mesmoEndereco(ordem.criador, userAddress);
    
    const card = el("div", `order-card ${ehMeu ? "mine" : ""}`);
    card.innerHTML = `
      <div class="order-header">
        <span class="chip ${tokOferece ? chipClasse(tokOferece.symbol) : "other"}">
          ${tokOferece ? tokOferece.symbol : short(ordem.tokenOferecido)}
        </span>
        <span class="chip-arrow">→</span>
        <span class="chip ${tokDeseja ? chipClasse(tokDeseja.symbol) : "other"}">
          ${tokDeseja ? tokDeseja.symbol : short(ordem.tokenDesejado)}
        </span>
      </div>
      <div class="order-body">
        <div class="order-row">
          <span>Oferece:</span>
          <strong>${tokOferece ? fmt(ordem.valorOferecido, tokOferece.decimals) : ordem.valorOferecido.toString()}</strong>
        </div>
        <div class="order-row">
          <span>Quer receber:</span>
          <strong>${tokDeseja ? fmt(ordem.valorDesejado, tokDeseja.decimals) : ordem.valorDesejado.toString()}</strong>
        </div>
        <div class="order-row">
          <span>Criador:</span>
          <span class="creator">${short(ordem.criador)}</span>
        </div>
      </div>
      <div class="order-footer">
        ${ehMeu 
          ? `<button class="btn-sm btn-danger" data-cancel="${ordem.id}">Cancelar</button>`
          : `<button class="btn-sm btn-primary" data-exec="${ordem.id}">Executar Troca</button>`
        }
      </div>
    `;
    container.appendChild(card);
  }
  
  // Vincular eventos dos botões
  container.querySelectorAll("[data-exec]").forEach(btn => {
    btn.addEventListener("click", () => executarOrdem(btn.dataset.exec));
  });
  container.querySelectorAll("[data-cancel]").forEach(btn => {
    btn.addEventListener("click", () => cancelarOrdem(btn.dataset.cancel));
  });
}

// ============================================================
// TRANSAÇÕES
// ============================================================
async function executarOrdem(escrowAddr) {
  if (!userAddress) { toast("Conecte sua carteira primeiro.", "warn"); return; }
  if (emTransacao) { toast("Aguarde a transação anterior…", "warn"); return; }
  
  try {
    emTransacao = true;
    toast("Verificando ordem…", "info");
    
    const [tokenDesejado, valorDesejado, tokenOferecido, valorOferecido, criador] = await Promise.all([
      lerEndereco(escrowAddr, SEL_ESCROW.tokenDesejado),
      lerUint(escrowAddr, SEL_ESCROW.valorDesejado),
      lerEndereco(escrowAddr, SEL_ESCROW.tokenOferecido),
      lerUint(escrowAddr, SEL_ESCROW.valorOferecido),
      lerEndereco(escrowAddr, SEL_ESCROW.criador),
    ]);
    
    if (mesmoEndereco(criador, userAddress)) {
      throw new Error("Você não pode executar sua própria ordem.");
    }
    
    const tok = tokenOk(tokenDesejado);
    if (!tok) throw new Error("Token desconhecido.");
    
    // Verificar/aprovar allowance
    if (!tok.native) {
      const allowance = await lerUint(tokenDesejado, SEL_ERC20.allowance, userAddress, escrowAddr);
      if (allowance < valorDesejado) {
        toast("Aprovando tokens…", "info");
        const tx = await signer.sendTransaction({
          to: tokenDesejado,
          data: "0x" + SEL_ERC20.approve + encAddress(escrowAddr) + encUint(valorDesejado)
        });
        toastTx("Aprovação enviada:", tx.hash, "info");
        await tx.wait();
        toast("✅ Aprovado!", "ok");
      }
    }
    
    // Executar
    toast("Enviando transação…", "info");
    const tx = await signer.sendTransaction({
      to: escrowAddr,
      data: "0x" + SEL_ESCROW.executar,
      value: tok.native ? valorDesejado : 0n
    });
    toastTx("✅ Transação enviada:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Troca executada com sucesso!", "ok", 8000);
    
    await atualizarSaldos();
    await carregarOrdens();
  } catch (e) {
    toast("Erro: " + erroLegivel(e), "err", 8000);
  } finally {
    emTransacao = false;
  }
}

async function cancelarOrdem(escrowAddr) {
  if (!userAddress) { toast("Conecte sua carteira primeiro.", "warn"); return; }
  if (emTransacao) { toast("Aguarde a transação anterior…", "warn"); return; }
  
  try {
    emTransacao = true;
    toast("Cancelando ordem…", "info");
    
    const criador = await lerEndereco(escrowAddr, SEL_ESCROW.criador);
    if (!mesmoEndereco(criador, userAddress)) {
      throw new Error("Apenas o criador pode cancelar esta ordem.");
    }
    
    const tx = await signer.sendTransaction({
      to: escrowAddr,
      data: "0x" + SEL_ESCROW.cancelar
    });
    toastTx("Cancelamento enviado:", tx.hash, "info");
    await tx.wait();
    toast("✅ Ordem cancelada!", "ok");
    
    await carregarOrdens();
  } catch (e) {
    toast("Erro: " + erroLegivel(e), "err", 8000);
  } finally {
    emTransacao = false;
  }
}

async function criarOrdem() {
  if (!userAddress) { toast("Conecte sua carteira primeiro.", "warn"); return; }
  if (emTransacao) { toast("Aguarde a transação anterior…", "warn"); return; }
  
  try {
    emTransacao = true;
    
    const tokOfereceSel = $("selOferece");
    const tokDesejaSel = $("selDeseja");
    const inValorOferece = $("valorOferece");
    const inValorDeseja = $("valorDeseja");
    
    const endOferece = tokOfereceSel.value;
    const endDeseja = tokDesejaSel.value;
    
    if (!endOferece || !endDeseja) throw new Error("Selecione os tokens.");
    if (mesmoEndereco(endOferece, endDeseja)) throw new Error("Os tokens devem ser diferentes.");
    
    const tokOferece = endOferece === "POL" ? NATIVO : tokenOk(endOferece);
    const tokDeseja = endDeseja === "POL" ? NATIVO : tokenOk(endDeseja);
    if (!tokOferece || !tokDeseja) throw new Error("Token inválido.");
    
    const valOferece = lerValor(inValorOferece.value, tokOferece.decimals, "valor oferecido");
    const valDeseja = lerValor(inValorDeseja.value, tokDeseja.decimals, "valor desejado");
    
    if (!tokOferece.native) {
      const allowance = await lerUint(tokOferece.address, SEL_ERC20.allowance, userAddress, ESCROW_FACTORY_ADDRESS);
      if (allowance < valOferece) {
        toast("Aprovando tokens para venda…", "info");
        const tx = await signer.sendTransaction({
          to: tokOferece.address,
          data: "0x" + SEL_ERC20.approve + encAddress(ESCROW_FACTORY_ADDRESS) + encUint(valOferece)
        });
        toastTx("Aprovação enviada:", tx.hash, "info");
        await tx.wait();
        toast("✅ Aprovado!", "ok");
      }
    }
    
    toast("Criando ordem…", "info");
    const tx = await signer.sendTransaction({
      to: ESCROW_FACTORY_ADDRESS,
      data: "0x" + SEL_FACTORY.criarOrdem + 
        encAddress(endOferece === "POL" ? "0x0000000000000000000000000000000000000000" : endOferece) +
        encUint(valOferece) +
        encAddress(endDeseja === "POL" ? "0x0000000000000000000000000000000000000000" : endDeseja) +
        encUint(valDeseja),
      value: tokOferece.native ? valOferece : 0n
    });
    toastTx("Ordem criada! Transação:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Ordem publicada no mural!", "ok", 8000);
    
    inValorOferece.value = "";
    inValorDeseja.value = "";
    
    await atualizarSaldos();
    await carregarOrdens();
  } catch (e) {
    toast("Erro: " + erroLegivel(e), "err", 8000);
  } finally {
    emTransacao = false;
  }
}

// ============================================================
// ENVIAR TOKENS
// ============================================================
async function enviarToken() {
  if (!userAddress) { toast("Conecte sua carteira primeiro.", "warn"); return; }
  if (emTransacao) { toast("Aguarde a transação anterior…", "warn"); return; }
  
  try {
    emTransacao = true;
    
    const selToken = $("selTokenEnvio");
    const dest = $("destinoEnvio").value.trim();
    const valorTxt = $("valorEnvio").value.trim();
    
    if (!selToken.value) throw new Error("Selecione um token.");
    if (!isAddr(dest)) throw new Error("Endereço de destino inválido. Deve começar com 0x.");
    if (mesmoEndereco(dest, userAddress)) throw new Error("Não envie para você mesmo.");
    
    const tok = selToken.value === "POL" ? NATIVO : tokenOk(selToken.value);
    if (!tok) throw new Error("Token inválido.");
    
    const valor = lerValor(valorTxt, tok.decimals, "valor");
    
    toast("Enviando transação…", "info");
    let tx;
    if (tok.native) {
      tx = await signer.sendTransaction({ to: dest, value: valor });
    } else {
      tx = await signer.sendTransaction({
        to: tok.address,
        data: "0x" + SEL_ERC20.transfer + encAddress(dest) + encUint(valor)
      });
    }
    
    toastTx("✅ Transação enviada:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Enviado com sucesso!", "ok", 8000);
    
    $("destinoEnvio").value = "";
    $("valorEnvio").value = "";
    
    await atualizarSaldos();
  } catch (e) {
    toast("Erro: " + erroLegivel(e), "err", 8000);
  } finally {
    emTransacao = false;
  }
}

// ============================================================
// CONVERSÃO POL ↔ WPOL
// ============================================================
async function converterWPOL() {
  if (!userAddress) { toast("Conecte sua carteira primeiro.", "warn"); return; }
  if (emTransacao) { toast("Aguarde a transação anterior…", "warn"); return; }
  
  try {
    emTransacao = true;
    const valorTxt = $("valorWPOL").value.trim();
    const valor = lerValor(valorTxt, 18, "valor");
    
    toast("Convertendo POL → WPOL…", "info");
    const tx = await signer.sendTransaction({
      to: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
      data: "0x" + SEL_WPOL.deposit,
      value: valor
    });
    toastTx("✅ Convertido:", tx.hash, "ok");
    await tx.wait();
    toast("✅ " + fmt(valor, 18) + " POL → WPOL", "ok");
    
    $("valorWPOL").value = "";
    await atualizarSaldos();
  } catch (e) {
    toast("Erro: " + erroLegivel(e), "err", 8000);
  } finally {
    emTransacao = false;
  }
}

async function converterPOL() {
  if (!userAddress) { toast("Conecte sua carteira primeiro.", "warn"); return; }
  if (emTransacao) { toast("Aguarde a transação anterior…", "warn"); return; }
  
  try {
    emTransacao = true;
    const valorTxt = $("valorPOL").value.trim();
    const valor = lerValor(valorTxt, 18, "valor");
    
    toast("Convertendo WPOL → POL…", "info");
    const tx = await signer.sendTransaction({
      to: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
      data: "0x" + SEL_WPOL.withdraw + encUint(valor)
    });
    toastTx("✅ Convertido:", tx.hash, "ok");
    await tx.wait();
    toast("✅ " + fmt(valor, 18) + " WPOL → POL", "ok");
    
    $("valorPOL").value = "";
    await atualizarSaldos();
  } catch (e) {
    toast("Erro: " + erroLegivel(e), "err", 8000);
  } finally {
    emTransacao = false;
  }
}

// ============================================================
// NAVEGAÇÃO ENTRE ABAS
// ============================================================
function trocarAba(nomeAba) {
  ABAS.forEach(aba => {
    const el = document.querySelector(`[data-panel="${aba}"]`) || $(aba + "Panel");
    if (el) el.style.display = aba === nomeAba ? "block" : "none";
  });
  document.querySelectorAll(".tabs button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === nomeAba);
  });
  
  if (nomeAba === "mural") carregarOrdens();
  if (nomeAba === "mural" || nomeAba === "converter") atualizarSaldos();
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
async function inicializar() {
  normalizarTokens();
  
  // Popular seletores de tokens
  const selOferece = $("selOferece");
  const selDeseja = $("selDeseja");
  const selEnvio = $("selTokenEnvio");
  
  [selOferece, selDeseja, selEnvio].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = sel === selEnvio 
      ? '<option value="">Selecione…</option><option value="POL">POL (nativo)</option>'
      : '<option value="">Selecione…</option>';
    for (const t of tokensOk()) {
      const opt = document.createElement("option");
      opt.value = t.address;
      opt.textContent = t.symbol + " — " + t.name;
      sel.appendChild(opt);
    }
  });
  
  // Lista de tokens na aba Ajuda
  const listaTokens = $("listaTokens");
  if (listaTokens) {
    listaTokens.innerHTML = `<li><strong>POL</strong> — Polygon (moeda nativa da rede)</li>` +
      tokensOk().map(t => `<li><strong>${t.symbol}</strong> — ${t.name}: <code>${t.address}</code></li>`).join("");
  }
  
  // Eventos — Navegação
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => trocarAba(btn.dataset.tab));
  });
  
  // Eventos — Conexão carteira
  $("btnConnect")?.addEventListener("click", conectarCarteira);
  $("btnDisconnect")?.addEventListener("click", desconectarCarteira);
  
  // Eventos — Criar ordem
  $("btnCriarOrdem")?.addEventListener("click", criarOrdem);
  
  // Eventos — Enviar
  $("btnEnviar")?.addEventListener("click", enviarToken);
  
  // Eventos — Conversão POL ↔ WPOL
  $("btnConverterWPOL")?.addEventListener("click", converterWPOL);
  $("btnConverterPOL")?.addEventListener("click", converterPOL);
  
  // Eventos — Consulta BTC
  $("btnCheckBtc")?.addEventListener("click", () => {
    const end = $("btcAddressQuery").value;
    consultarSaldoBTC(end);
  });
  $("btcAddressQuery")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const end = $("btcAddressQuery").value;
      consultarSaldoBTC(end);
    }
  });
  
  // Eventos — Filtros
  $("filtroMinhas")