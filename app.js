// ============================================================
// APP.JS — Carteira BRN P2P + CONSULTA BTC
// Versão: 5.2 | Data: 2026-09-22
// ✅ Melhorias: Mais RPCs, diagnóstico de conexão, tratamento de erros aprimorado
// ============================================================

const ESCROW_FACTORY_ADDRESS = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;
const APP_VERSION = "v5.2";

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

// ✅ ATUALIZADO: Mais RPCs para maior confiabilidade
const RPCS = [
  "https://polygon-rpc.com",
  "https://rpc.ankr.com/polygon",
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://api.securerpc.com/v1",
  "https://polygon.publicnode.com",
];
const RPC_TIMEOUT_MS = 5000;
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
// CONSULTA DE SALDO BTC — API PÚBLICA
// ============================================================
function validarEnderecoBTC(endereco) {
  if (!endereco || typeof endereco !== "string") return false;
  const s = endereco.trim();
  if (/^bc1q[a-z0-9]{38,59}$/i.test(s)) return true;
  if (/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(s)) return true;
  if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(s)) return true;
  return false;
}

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

    return { endereco: enderecoBTC, saldoConfirmado, saldoPendente, totalRecebido: saldoTotal, totalGasto: saldoGasto };
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
function elHTML(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
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
function tokensOk() { return TOKENS.filter(t => t.address); }
function opcoesTokens(sel, primeiro = null) {
  const el = $(sel); if (!el) return;
  el.innerHTML = "";
  if (primeiro) el.appendChild(el("option", "", primeiro));
  for (const t of tokensOk()) {
    const o = el("option", "", `${t.symbol} — ${t.name}`);
    o.value = t.address;
    el.appendChild(o);
  }
}

// ============================================================
// RPC / PROVEDOR
// ============================================================
async function testarRpc(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), RPC_TIMEOUT_MS);
  try {
    const p = new ethers.providers.JsonRpcProvider({ url, timeout: RPC_TIMEOUT_MS });
    const n = await p.getNetwork();
    if (n.chainId !== POLYGON_CHAIN_ID) throw new Error("Rede errada");
    providersOk[url] = p;
    return true;
  } catch {
    return false;
  } finally { clearTimeout(t); }
}

async function getAnyProvider() {
  for (let i = 0; i < RPCS.length; i++) {
    const url = RPCS[(rpcIdx + i) % RPCS.length];
    if (providersOk[url]) return providersOk[url];
    if (await testarRpc(url)) {
      currentRpc = url;
      rpcIdx = (i + 1) % RPCS.length;
      return providersOk[url];
    }
  }
  throw new Error("Sem conexão com a rede Polygon. Verifique sua internet ou tente novamente mais tarde.");
}

// ============================================================
// CHAMADAS DE CONTRATO
// ============================================================
async function call(provider, to, data) {
  return await provider.call({ to, data });
}

async function getTotalOrdens(provider) {
  const r = await call(provider, ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.totalOrdens);
  return Number(decUint(r));
}

async function getOrdemEscrow(provider, idx) {
  const data = "0x" + SEL_FACTORY.ordem + encUint(idx);
  const r = await call(provider, ESCROW_FACTORY_ADDRESS, data);
  return decAddress(r);
}

async function getDadosOrdem(provider, escrowAddr) {
  const dados = { endereco: escrowAddr, indice: -1 };
  try {
    let r = await call(provider, escrowAddr, "0x" + SEL_ESCROW.obterDados);
    const w = splitWords(r);
    dados.criador = decAddress(w[0]);
    dados.tokenOferecido = decAddress(w[1]);
    dados.valorOferecido = decUint(w[2]);
    dados.tokenDesejado = decAddress(w[3]);
    dados.valorDesejado = decUint(w[4]);
    dados.executado = decBool(w[5]);
    dados.cancelado = decBool(w[6]);
    dados.valido = true;
  } catch (e) {
    dados.valido = false; dados.erro = e.message;
  }
  return dados;
}

async function saldoToken(provider, tokenAddr, usuarioAddr) {
  if (mesmoEndereco(tokenAddr, NATIVO.symbol)) {
    return BigInt((await provider.getBalance(usuarioAddr)).toString());
  }
  const r = await call(provider, tokenAddr, "0x" + SEL_ERC20.balanceOf + encAddress(usuarioAddr));
  return decUint(r);
}

async function allowanceToken(provider, tokenAddr, ownerAddr, spenderAddr) {
  const r = await call(provider, tokenAddr, "0x" + SEL_ERC20.allowance + encAddress(ownerAddr) + encAddress(spenderAddr));
  return decUint(r);
}

async function atualizarSaldos(provider, usuarioAddr) {
  if (!usuarioAddr) return;
  const saldoPOL = await provider.getBalance(usuarioAddr);
  saldos.POL = BigInt(saldoPOL.toString());
  for (const t of tokensOk()) {
    try {
      saldos[t.address] = await saldoToken(provider, t.address, usuarioAddr);
    } catch {
      saldos[t.address] = 0n;
    }
  }
  atualizarExibicaoSaldos();
}

function atualizarExibicaoSaldos() {
  const container = $("balances");
  if (!container) return;
  container.innerHTML = "";

  const addBal = (symbol, chip, valor, dec, note = "") => {
    const card = el("div", "bal");
    card.innerHTML = `
      <span class="t"><span class="chip ${symbol.toLowerCase()}">${chip}</span> ${symbol}${note}</span>
      <span class="v">${fmt(valor, dec)}</span>
    `;
    container.appendChild(card);
  };

  addBal("POL", "⚡", saldos.POL || 0n, 18);
  for (const t of tokensOk()) {
    const val = saldos[t.address] ?? 0n;
    addBal(t.symbol, t.symbol.slice(0, 2).toUpperCase(), val, t.decimals);
  }

  document.querySelectorAll("[data-hint]").forEach(el => {
    const [tipo, ref] = el.getAttribute("data-hint").split(":");
    if (tipo === "saldo") {
      const tok = ref === "selOferece" || ref === "selDeseja" || ref === "selTokenEnvio"
        ? tokenPorEndereco($(ref)?.value)
        : tokenPorEndereco(ref);
      if (tok) {
        const val = tok.symbol === "POL" ? saldos.POL || 0n : saldos[tok.address] ?? 0n;
        el.textContent = `Saldo: ${fmt(val, tok.decimals)} ${tok.symbol}`;
      }
    } else if (tipo === "saldoPOL") {
      el.textContent = fmt(saldos.POL || 0n, 18);
    } else if (tipo === "saldoWPOL") {
      const wpol = TOKENS.find(t => t.symbol === "WPOL");
      el.textContent = wpol ? fmt(saldos[wpol.address] || 0n, 18) : "—";
    }
  });
}

// ============================================================
// CONEXÃO CARTEIRA
// ============================================================
async function conectarCarteira() {
  try {
    if (!window.ethereum) {
      toast("❌ MetaMask não detectada. Instale a extensão e recarregue a página.", "err", 10000);
      return;
    }

    walletProvider = new ethers.providers.Web3Provider(window.ethereum);
    const contas = await walletProvider.send("eth_requestAccounts", []);
    if (!contas || contas.length === 0) {
      toast("Nenhuma conta selecionada.", "warn");
      return;
    }

    userAddress = ethers.utils.getAddress(contas[0].toLowerCase());
    signer = walletProvider.getSigner();

    const rede = await walletProvider.getNetwork();
    if (rede.chainId !== POLYGON_CHAIN_ID) {
      toast("⚠️ Selecione a rede Polygon na MetaMask.", "warn", 8000);
      try {
        await walletProvider.send("wallet_switchEthereumChain", [{ chainId: "0x89" }]);
      } catch {
        toast("Não foi possível mudar de rede. Mude manualmente.", "warn");
      }
      return;
    }

    $("btnConnect").style.display = "none";
    $("walletInfo").style.display = "flex";
    $("addr").textContent = short(userAddress);
    toast("✅ Carteira conectada!", "ok");

    await atualizarSaldos(walletProvider, userAddress);
    if (!listenersRegistrados) registrarListeners();
    await carregarOrdens();

  } catch (e) {
    if (e.code === 4001) toast("Conexão recusada.", "warn");
    else toast("Erro: " + erroLegivel(e), "err");
    console.error(e);
  }
}

function desconectarCarteira() {
  walletProvider = null;
  signer = null;
  userAddress = null;
  $("btnConnect").style.display = "block";
  $("walletInfo").style.display = "none";
  toast("Carteira desconectada", "info");
}

async function verificarRede() {
  try {
    const p = await getAnyProvider();
    const rede = await p.getNetwork();
    if (rede.chainId === POLYGON_CHAIN_ID) {
      setNet("ok", "Polygon ✅");
      return true;
    }
    setNet("off", "Rede Errada ❌");
    return false;
  } catch {
    setNet("off", "Sem conexão ❌");
    return false;
  }
}

// ============================================================
// CARREGAR ORDENS
// ============================================================
async function carregarOrdens(forcar = false) {
  if (carregando) return;
  carregando = true;
  const container = $("orders");
  const counter = $("counter");
  const muralInfo = $("muralInfo");

  try {
    counter.textContent = "⏳ Consultando…";
    container.innerHTML = el("div", "state", el("div", "spinner", ""));

    const provider = await getAnyProvider();
    const total = await getTotalOrdens(provider);
    counter.textContent = `Encontradas ${total} ordem${total !== 1 ? "ens" : ""}`;
    if (total === 0) {
      container.innerHTML = el("div", "empty", "📋 Nenhuma ordem encontrada. Seja o primeiro a criar uma!");
      ordersCache = [];
      return;
    }

    const indices = Array.from({ length: total }, (_, i) => i);
    const enderecos = await mapLimit(indices, CONCORRENCIA, async i => {
      try { return await getOrdemEscrow(provider, i); }
      catch { return null; }
    });

    const escrows = enderecos.filter(Boolean);
    const dados = await mapLimit(escrows, CONCORRENCIA, async addr => {
      try { return await getDadosOrdem(provider, addr); }
      catch { return null; }
    });

    ordersCache = dados.filter(d => d && d.valido);
    aplicarFiltros();
    muralInfo.textContent = `Exibindo ${ordersCache.length} de ${total} ordens`;

  } catch (e) {
    container.innerHTML = el("div", "empty", "❌ Erro ao carregar ordens: " + esc(erroLegivel(e)));
    console.error(e);
  } finally {
    carregando = false;
  }
}

function aplicarFiltros() {
  let filtrado = [...ordersCache];
  const container = $("orders");

  if (filtro.status === "ativas") filtrado = filtrado.filter(o => !o.executado && !o.cancelado);
  else if (filtro.status === "executaveis") filtrado = filtrado.filter(o => !o.executado && !o.cancelado && userAddress && !mesmoEndereco(o.criador, userAddress));
  else if (filtro.status === "executadas") filtrado = filtrado.filter(o => o.executado);
  else if (filtro.status === "canceladas") filtrado = filtrado.filter(o => o.cancelado);

  if (filtro.oferece) filtrado = filtrado.filter(o => mesmoEndereco(o.tokenOferecido, filtro.oferece));
  if (filtro.pede) filtrado = filtrado.filter(o => mesmoEndereco(o.tokenDesejado, filtro.pede));
  if (filtro.minhas && userAddress) filtrado = filtrado.filter(o => mesmoEndereco(o.criador, userAddress));

  atualizarOpcoesFiltro();
  renderizarOrdens(filtrado, container);
}

function atualizarOpcoesFiltro() {
  const ofertas = [...new Set(ordersCache.map(o => o.tokenOferecido).filter(Boolean))];
  const pedidos = [...new Set(ordersCache.map(o => o.tokenDesejado).filter(Boolean))];

  const selOf = $("filtroOferece");
  const selPe = $("filtroPede");
  if (!selOf || !selPe) return;

  selOf.innerHTML = '<option value="">Todos os ativos</option>';
  selPe.innerHTML = '<option value="">Todos os ativos</option>';

  for (const addr of ofertas) {
    const t = tokenPorEndereco(addr);
    if (!t) continue;
    const o = el("option", "", t.symbol);
    o.value = addr;
    if (filtro.oferece === addr) o.selected = true;
    selOf.appendChild(o);
  }
  for (const addr of pedidos) {
    const t = tokenPorEndereco(addr);
    if (!t) continue;
    const o = el("option", "", t.symbol);
    o.value = addr;
    if (filtro.pede === addr) o.selected = true;
    selPe.appendChild(o);
  }
}

function renderizarOrdens(lista, container) {
  if (!lista.length) {
    container.innerHTML = el("div", "empty", "🔍 Nenhuma ordem corresponde aos filtros.").outerHTML;
    return;
  }
  container.innerHTML = "";
  lista.sort((a, b) => (b.indice || 0) - (a.indice || 0));

  for (const ordem of lista) {
    const ofer = tokenPorEndereco(ordem.tokenOferecido);
    const ped = tokenPorEndereco(ordem.tokenDesejado);
    const minha = userAddress && mesmoEndereco(ordem.criador, userAddress);
    const ativa = !ordem.executado && !ordem.cancelado;

    const div = el("div", `order ${ativa ? "active" : ""} ${ordem.executado ? "done" : ""} ${ordem.cancelado ? "cancelled" : ""}`);
    div.innerHTML = `
      <div class="order-head">
        <span class="order-num">#${ordem.indice ?? "—"}</span>
        <span class="tag ${ordem.executado ? "done" : ordem.cancelado ? "cancelled" : "active"}">
          ${ordem.executado ? "✅ Executada" : ordem.cancelado ? "❌ Cancelada" : "🔵 Ativa"}
        </span>
      </div>
      <div class="order-id">Escrow: ${ordem.endereco}</div>
      <div class="swap">
        <div class="swap-side">
          <div class="swap-lbl">Oferece</div>
          <div class="swap-amt">${ofer ? fmt(ordem.valorOferecido, ofer.decimals) : "?"} ${ofer?.symbol || "???"}</div>
        </div>
        <div class="swap-icon">⇄</div>
        <div class="swap-side">
          <div class="swap-lbl">Pede</div>
          <div class="swap-amt">${ped ? fmt(ordem.valorDesejado, ped.decimals) : "?"} ${ped?.symbol || "???"}</div>
        </div>
      </div>
      <div class="swap-escrow ${ativa ? "ok" : ""}">
        Criador: ${short(ordem.criador)} ${minha ? "(você)" : ""}
      </div>
      <div class="order-foot">
        <span class="order-meta">${minha ? "Sua ordem" : "Ordem de " + short(ordem.criador)}</span>
        <div class="order-actions">
          ${ativa && !minha ? `<button class="btn btn-sm btn-primary" data-acao="executar" data-escrow="${ordem.endereco}">Executar</button>` : ""}
          ${ativa && minha ? `<button class="btn btn-sm" data-acao="cancelar" data-escrow="${ordem.endereco}">Cancelar</button>` : ""}
        </div>
      </div>
    `;
    container.appendChild(div);
  }
}

// ============================================================
// TRANSAÇÕES
// ============================================================
async function executarOrdem(escrowAddr) {
  if (!signer || emTransacao) return;
  emTransacao = true;
  try {
    toast("⏳ Executando ordem…", "info");
    const tx = await signer.sendTransaction({
      to: escrowAddr,
      data: "0x" + SEL_ESCROW.executar,
      gasLimit: 300000
    });
    toastTx("📤 Transação enviada:", tx.hash, "info");
    await tx.wait();
    toast("✅ Ordem executada com sucesso!", "ok");
    await carregarOrdens(true);
    await atualizarSaldos(walletProvider, userAddress);
  } catch (e) {
    toast("❌ Erro: " + erroLegivel(e), "err");
  } finally { emTransacao = false; }
}

async function cancelarOrdem(escrowAddr) {
  if (!signer || emTransacao) return;
  emTransacao = true;
  try {
    toast("⏳ Cancelando ordem…", "info");
    const tx = await signer.sendTransaction({
      to: escrowAddr,
      data: "0x" + SEL_ESCROW.cancelar,
      gasLimit: 200000
    });
    toastTx("📤 Transação enviada:", tx.hash, "info");
    await tx.wait();
    toast("✅ Ordem cancelada!", "ok");
    await carregarOrdens(true);
    await atualizarSaldos(walletProvider, userAddress);
  } catch (e) {
    toast("❌ Erro: " + erroLegivel(e), "err");
  } finally { emTransacao = false; }
}

async function aprovarToken(tokenAddr, spenderAddr, valor) {
  if (!signer || emTransacao) return false;
  emTransacao = true;
  try {
    const token = tokenPorEndereco(tokenAddr);
    toast(`⏳ Aprovando ${token?.symbol || "token"}…`, "info");
    const tx = await signer.sendTransaction({
      to: tokenAddr,
      data: "0x" + SEL_ERC20.approve + encAddress(spenderAddr) + encUint(valor),
      gasLimit: 100000
    });
    toastTx("📤 Aprovação enviada:", tx.hash, "info");
    await tx.wait();
    toast("✅ Aprovado!", "ok");
    return true;
  } catch (e) {
    toast("❌ Erro: " + erroLegivel(e), "err");
    return false;
  } finally { emTransacao = false; }
}

async function criarOrdem() {
  if (!signer || !userAddress || emTransacao) return;
  emTransacao = true;
  try {
    const ofAddr = $("selOferece").value;
    const deAddr = $("selDeseja").value;
    const ofToken = tokenPorEndereco(ofAddr);
    const deToken = tokenPorEndereco(deAddr);
    if (!ofToken || !deToken) throw new Error("Selecione os tokens.");
    if (mesmoEndereco(ofAddr, deAddr)) throw new Error("Os ativos devem ser diferentes.");

    const ofVal = lerValor($("valorOferece").value, ofToken.decimals, ofToken.symbol);
    const deVal = lerValor($("valorDeseja").value, deToken.decimals, deToken.symbol);

    const saldo = await saldoToken(walletProvider, ofAddr, userAddress);
    if (saldo < ofVal) throw new Error(`Saldo insuficiente de ${ofToken.symbol}.`);

    if (ofToken.symbol !== "POL") {
      const allowance = await allowanceToken(walletProvider, ofAddr, userAddress, ESCROW_FACTORY_ADDRESS);
      if (allowance < ofVal) {
        const ok = await aprovarToken(ofAddr, ESCROW_FACTORY_ADDRESS, ofVal);
        if (!ok) return;
      }
    }

    toast("⏳ Criando ordem…", "info");
    const tx = await signer.sendTransaction({
      to: ESCROW_FACTORY_ADDRESS,
      data: "0x" + SEL_FACTORY.criarOrdem + encAddress(ofAddr) + encUint(ofVal) + encAddress(deAddr) + encUint(deVal),
      gasLimit: 500000,
      value: ofToken.symbol === "POL" ? ofVal : 0n
    });
    toastTx("📤 Ordem criada:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Ordem criada com sucesso!", "ok");

    $("valorOferece").value = "";
    $("valorDeseja").value = "";
    await carregarOrdens(true);
    await atualizarSaldos(walletProvider, userAddress);
  } catch (e) {
    toast("❌ Erro: " + erroLegivel(e), "err");
  } finally { emTransacao = false; }
}

async function enviarToken() {
  if (!signer || !userAddress || emTransacao) return;
  emTransacao = true;
  try {
    const sel = $("selTokenEnvio").value;
    const destino = $("destinoEnvio").value.trim();
    const valorTxt = $("valorEnvio").value;
    const token = tokenPorEndereco(sel);

    if (!token) throw new Error("Selecione um ativo.");
    if (!isAddr(destino)) throw new Error("Endereço de destino inválido.");
    if (mesmoEndereco(destino, userAddress)) throw new Error("Não pode enviar para você mesmo.");

    const valor = lerValor(valorTxt, token.decimals, token.symbol);
    const saldo = token.symbol === "POL" ? saldos.POL || 0n : saldos[token.address] ?? 0n;
    if (saldo < valor) throw new Error(`Saldo insuficiente de ${token.symbol}.`);

    toast(`⏳ Enviando ${fmt(valor, token.decimals, 4)} ${token.symbol}…`, "info");

    let tx;
    if (token.symbol === "POL") {
      tx = await signer.sendTransaction({ to: destino, value: valor, gasLimit: 21000 });
    } else {
      tx = await signer.sendTransaction({
        to: token.address,
        data: "0x" + SEL_ERC20.transfer + encAddress(destino) + encUint(valor),
        gasLimit: 100000
      });
    }

    toastTx("📤 Transação enviada:", tx.hash, "ok");
    await tx.wait();
    toast(`✅ ${token.symbol} enviado com sucesso!`, "ok");

    $("destinoEnvio").value = "";
    $("valorEnvio").value = "";
    await atualizarSaldos(walletProvider, userAddress);
  } catch (e) {
    toast("❌ Erro: " + erroLegivel(e), "err");
  } finally { emTransacao = false; }
}

async function wrapPOL() {
  if (!signer || !userAddress || emTransacao) return;
  emTransacao = true;
  try {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    const valor = lerValor($("valorWPOL").value, 18, "POL");
    if ((saldos.POL || 0n) < valor) throw new Error("Saldo insuficiente de POL.");

    toast("⏳ Convertendo POL → WPOL…", "info");
    const tx = await signer.sendTransaction({
      to: wpol.address,
      data: "0x" + SEL_WPOL.deposit,
      value: valor,
      gasLimit: 50000
    });
    toastTx("📤 Transação enviada:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Convertido para WPOL!", "ok");

    $("valorWPOL").value = "";
    await atualizarSaldos(walletProvider, userAddress);
  } catch (e) {
    toast("❌ Erro: " + erroLegivel(e), "err");
  } finally { emTransacao = false; }
}

async function unwrapWPOL() {
  if (!signer || !userAddress || emTransacao) return;
  emTransacao = true;
  try {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    const valor = lerValor($("valorPOL").value, 18, "WPOL");
    const saldo = saldos[wpol.address] ?? 0n;
    if (saldo < valor) throw new Error("Saldo insuficiente de WPOL.");

    toast("⏳ Convertendo WPOL → POL…", "info");
    const tx = await signer.sendTransaction({
      to: wpol.address,
      data: "0x" + SEL_WPOL.withdraw + encUint(valor),
      gasLimit: 50000
    });
    toastTx("📤 Transação enviada:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Convertido para POL!", "ok");

    $("valorPOL").value = "";
    await atualizarSaldos(walletProvider, userAddress);
  } catch (e) {
    toast("❌ Erro: " + erroLegivel(e), "err");
  } finally { emTransacao = false; }
}

// ============================================================
// NAVEGAÇÃO / EVENTOS
// ============================================================
function trocarAba(nomeAba) {
  document.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b.getAttribute("data-tab") === nomeAba));
  document.querySelectorAll("[data-panel]").forEach(p => p.hidden = p.getAttribute("data-panel") !== nomeAba);
  if (nomeAba === "mural") carregarOrdens();
}

function registrarListeners() {
  listenersRegistrados = true;

  $("btnConnect")?.addEventListener("click", conectarCarteira);
  $("btnDisconnect")?.addEventListener("click", desconectarCarteira);
  $("btnRefresh")?.addEventListener("click", () => carregarOrdens(true));
  $("btnCriarOrdem")?.addEventListener("click", criarOrdem);
  $("btnEnviar")?.addEventListener("click", enviarToken);
  $("btnConverterWPOL")?.addEventListener("click", wrapPOL);
  $("btnConverterPOL")?.addEventListener("click", unwrapWPOL);
  $("btnCheckBtc")?.addEventListener("click", () => {
    const addr = $("btcAddressQuery")?.value;
    if (addr) consultarSaldoBTC(addr);
  });

  $("btnMaxOf")?.addEventListener("click", () => {
    const t = tokenPorEndereco($("selOferece").value);
    if (t) $("valorOferece").value = paraInput(t.symbol === "POL" ? saldos.POL || 0n : saldos[t.address] ?? 0n, t.decimals);
  });
  $("btnMaxSend")?.addEventListener("click", () => {
    const t = tokenPorEndereco($("selTokenEnvio").value);
    if (t) $("valorEnvio").value = paraInput(t.symbol === "POL" ? saldos.POL || 0n : saldos[t.address] ?? 0n, t.decimals);
  });
  $("btnMaxWrap")?.addEventListener("click", () => {
    $("valorWPOL").value = paraInput((saldos.POL || 0n) - 1000000000000n, 18);
  });
  $("btnMaxUnwrap")?.addEventListener("click", () => {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    if (wpol) $("valorPOL").value = paraInput(saldos[wpol.address] ?? 0n, 18);
  });

  $("filtroStatus")?.addEventListener("change", e => { filtro.status = e.target.value; aplicarFiltros(); });
  $("filtroOferece")?.addEventListener("change", e => { filtro.oferece = e.target.value || null; aplicarFiltros(); });
  $("filtroPede")?.addEventListener("change", e => { filtro.pede = e.target.value || null; aplicarFiltros(); });
  $("filtroMinhas")?.addEventListener("change", e => { filtro.minhas = e.target.checked; aplicarFiltros(); });
  $("btnLimparFiltros")?.addEventListener("click", () => {
    filtro.status = "todas"; filtro.oferece = ""; filtro.pede = ""; filtro.minhas = false;
    $("filtroStatus").value = "todas";
    $("filtroOferece").value = "";
    $("filtroPede").value = "";
    $("filtroMinhas").checked = false;
    aplicarFiltros();
  });

  document.querySelectorAll("[data-tab]").forEach(b => {
    b.addEventListener("click", () => trocarAba(b.getAttribute("data-tab")));
  });

  document.body.addEventListener("click", async e => {
    const btn = e.target.closest("[data-acao]");
    if (!btn) return;
    const acao = btn.getAttribute("data-acao");
    const escrow = btn.getAttribute("data-escrow");
    if (acao === "executar") await executarOrdem(escrow);
    else if (acao === "cancelar") await cancelarOrdem(escrow);
  });

  window.ethereum?.on("accountsChanged", contas => {
    if (contas.length === 0) desconectarCarteira();
    else window.location.reload();
  });
  window.ethereum?.on("chainChanged", () => window.location.reload());
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
async function inicializar() {
  normalizarTokens();
  opcoesTokens("selOferece");
  opcoesTokens("selDeseja");
  opcoesTokens("selTokenEnvio");

  const listaTokens = $("listaTokens");
  if (listaTokens) {
    listaTokens.innerHTML = "";
    for (const t of tokensOk()) {
      const li = el("li", "", `<strong>${t