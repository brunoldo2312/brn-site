// ============================================================
// APP.JS — BRN Exchange | Versão Completa e Corrigida
// ✅ Conexão Polygon | ✅ Mural de Ordens | ✅ Criar Ordem
// ✅ Enviar Tokens | ✅ POL ↔ WPOL | ✅ Diagnóstico Completo
// 🔄 Visualização Separada: Rede Polygon (RPC) e Bitcoin (API)
// ============================================================

// ================= CONFIGURAÇÕES =================
const ESCROW_FACTORY = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;

// Tokens suportados
const TOKENS = [
  { symbol: "BRN",  name: "BRN Token",         address: "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210", decimals: 18 },
  { symbol: "USDC", name: "USD Coin",           address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
  { symbol: "USDT", name: "Tether USD",          address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8a", decimals: 6 },
  { symbol: "WPOL", name: "Wrapped POL",         address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
  { symbol: "WBTC", name: "Wrapped BTC",         address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
];

// RPCs confiáveis (com fallbacks)
const RPC_LIST = [
  "https://polygon-rpc.com",
  "https://ankr.com",
  "https://publicnode.com",
  "https://drpc.org",
  "https://1rpc.io",
];

// Selectors de funções (4 bytes)
const S = {
  Factory: {
    criarOrdem: "ceff4da6",
    totalOrdens: "8275d6fa",
    ordem: "72c453b8",
  },
  Escrow: {
    obterDados: "32c9e06c",
    executar: "b2d44d08",
    cancelar: "8ffb1ccf",
  },
  ERC20: {
    balanceOf: "70a08231",
    allowance: "dd62ed3e",
    approve: "095ea7b3",
    transfer: "a9059cbb",
  },
  WPOL: {
    deposit: "d0e30db0",   // POL → WPOL
    withdraw: "2e1a7d4d",   // WPOL → POL
  },
};

// Estado global
let provider = null;
let signer = null;
let userAddress = null;
let rpcProvider = null;
let ordersCache = [];
let loading = false;
let isTxBusy = false;
let saldos = { POL: 0n };
let filtroAtivo = { status: "ativas", oferece: "", pede: "", minhas: false };
let btcApiSincronizada = false; // Controle de sincronização remota do BTC

// ================= UTILITÁRIOS =================
const \$ = id => document.getElementById(id);
const isAddr = a => /^0x[a-fA-F0-9]{40}\$/.test(a || "");
const short = a => isAddr(a) ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
const mesmoAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Formatar valores
function fmt(bigInt, decimals, maxFrac = 6) {
  try {
    const str = ethers.utils.formatUnits(bigInt.toString(), decimals);
    const [inteiro, fracao = ""] = str.split(".");
    const limpo = fracao.slice(0, maxFrac).replace(/0+\$/, "");
    return limpo ? `${inteiro},${limpo}` : inteiro;
  } catch { return "0"; }
}

// Notificações
function toast(texto, tipo = "info", duracao = 4000) {
  const container = \$("toasts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = texto;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); }, duracao);
}

function toastTx(texto, hash, tipo = "info") {
  const link = `https://polygonscan.com{hash}`;
  const container = \$("toasts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.innerHTML = `${texto} <a href="${link}" target="_blank" rel="noopener">Ver no PolygonScan ↗</a>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); }, 8000);
}
// ================= CODIFICAÇÃO ABI =================
function encAddr(addr) {
  if (!isAddr(addr)) throw new Error("Endereço inválido");
  return addr.toLowerCase().slice(2).padStart(64, "0");
}
function encUint(valor) {
  return BigInt(valor).toString(16).padStart(64, "0");
}
function decAddr(palavra) {
  return ethers.utils.getAddress("0x" + palavra.slice(-40));
}
function decUint(palavra) {
  return BigInt("0x" + palavra);
}
function decBool(palavra) {
  return decUint(palavra) === 1n;
}
function splitResposta(hex) {
  const semPrefixo = hex.slice(2);
  const partes = [];
  for (let i = 0; i < semPrefixo.length; i += 64) {
    partes.push(semPrefixo.slice(i, i + 64));
  }
  return partes;
}

// ================= REDE / RPC POLYGON =================
async function testarRPC(url) {
  try {
    const p = new ethers.providers.JsonRpcProvider({ url, timeout: 8000 });
    const rede = await p.getNetwork();
    if (rede.chainId === POLYGON_CHAIN_ID) return p;
  } catch {}
  return null;
}

async function conectarRPC() {
  for (const url of RPC_LIST) {
    const p = await testarRPC(url);
    if (p) {
      rpcProvider = p;
      console.log(`✅ RPC conectado: ${url}`);
      return true;
    }
  }
  return false;
}

async function atualizarStatusRede() {
  const dot = \$("netDot");
  const txt = \$("netText");
  if (!dot || !txt) return false;

  dot.className = "dot load";
  txt.textContent = "Polygon: Conectando…";
  
  const ok = await conectarRPC();
  if (ok) {
    dot.className = "dot";
    txt.textContent = "Polygon: Conectado ✅";
  } else {
    dot.className = "dot off";
    txt.textContent = "Polygon: Sem conexão ❌";
    toast("❌ Não foi possível conectar à rede Polygon. Verifique sua internet.", "err", 10000);
  }
  return ok;
}

// ================= REDE REMOTA BITCOIN (Sincronização API) =================
async function verificarStatusRedeBitcoin() {
  const dot = \$("btcDot");
  const txt = \$("btcText");
  if (!dot || !txt) return;
  
  dot.className = "dot btc-status load";
  txt.textContent = "Bitcoin API: Sincronizando…";

  try {
    const resposta = await fetch("https://blockstream.info", { timeout: 8000 });
    if (resposta.ok) {
      const blocoAtual = await resposta.text();
      btcApiSincronizada = true;
      dot.className = "dot btc-status"; 
      txt.textContent = `Bitcoin API: Online (Bloco ${blocoAtual}) 🟠`;
    } else {
      throw new Error();
    }
  } catch (e) {
    btcApiSincronizada = false;
    dot.className = "dot btc-status off";
    txt.textContent = "Bitcoin API: Fora do Ar ❌";
    console.warn("⚠️ API de consulta do Bitcoin está indisponível no momento.");
  }
}
// ================= CODIFICAÇÃO ABI =================
function encAddr(addr) {
  if (!isAddr(addr)) throw new Error("Endereço inválido");
  return addr.toLowerCase().slice(2).padStart(64, "0");
}
function encUint(valor) {
  return BigInt(valor).toString(16).padStart(64, "0");
}
function decAddr(palavra) {
  return ethers.utils.getAddress("0x" + palavra.slice(-40));
}
function decUint(palavra) {
  return BigInt("0x" + palavra);
}
function decBool(palavra) {
  return decUint(palavra) === 1n;
}
function splitResposta(hex) {
  const semPrefixo = hex.slice(2);
  const partes = [];
  for (let i = 0; i < semPrefixo.length; i += 64) {
    partes.push(semPrefixo.slice(i, i + 64));
  }
  return partes;
}

// ================= REDE / RPC POLYGON =================
async function testarRPC(url) {
  try {
    const p = new ethers.providers.JsonRpcProvider({ url, timeout: 8000 });
    const rede = await p.getNetwork();
    if (rede.chainId === POLYGON_CHAIN_ID) return p;
  } catch {}
  return null;
}

async function conectarRPC() {
  for (const url of RPC_LIST) {
    const p = await testarRPC(url);
    if (p) {
      rpcProvider = p;
      console.log(`✅ RPC conectado: ${url}`);
      return true;
    }
  }
  return false;
}

async function atualizarStatusRede() {
  const dot = \$("netDot");
  const txt = \$("netText");
  if (!dot || !txt) return false;

  dot.className = "dot load";
  txt.textContent = "Polygon: Conectando…";
  
  const ok = await conectarRPC();
  if (ok) {
    dot.className = "dot";
    txt.textContent = "Polygon: Conectado ✅";
  } else {
    dot.className = "dot off";
    txt.textContent = "Polygon: Sem conexão ❌";
    toast("❌ Não foi possível conectar à rede Polygon. Verifique sua internet.", "err", 10000);
  }
  return ok;
}

// ================= REDE REMOTA BITCOIN (Sincronização API) =================
async function verificarStatusRedeBitcoin() {
  const dot = \$("btcDot");
  const txt = \$("btcText");
  if (!dot || !txt) return;
  
  dot.className = "dot btc-status load";
  txt.textContent = "Bitcoin API: Sincronizando…";

  try {
    const resposta = await fetch("https://blockstream.info", { timeout: 8000 });
    if (resposta.ok) {
      const blocoAtual = await resposta.text();
      btcApiSincronizada = true;
      dot.className = "dot btc-status"; 
      txt.textContent = `Bitcoin API: Online (Bloco ${blocoAtual}) 🟠`;
    } else {
      throw new Error();
    }
  } catch (e) {
    btcApiSincronizada = false;
    dot.className = "dot btc-status off";
    txt.textContent = "Bitcoin API: Fora do Ar ❌";
    console.warn("⚠️ API de consulta do Bitcoin está indisponível no momento.");
  }
}
// ============================================================
// APP.JS — BRN Exchange | Versão Completa e Corrigida
// ✅ Conexão Polygon | ✅ Mural de Ordens | ✅ Criar Ordem
// ✅ Enviar Tokens | ✅ POL ↔ WPOL | ✅ Consulta BTC
// ✅ Copiar Endereço BRN | ✅ Diagnóstico Completo
// ============================================================

// ================= CONFIGURAÇÕES =================
const ESCROW_FACTORY = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;

// Tokens suportados
const TOKENS = [
  { symbol: "BRN",  name: "BRN Token",         address: "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210", decimals: 18 },
  { symbol: "USDC", name: "USD Coin",           address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
  { symbol: "USDT", name: "Tether USD",          address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8a", decimals: 6 },
  { symbol: "WPOL", name: "Wrapped POL",         address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
  { symbol: "WBTC", name: "Wrapped BTC",         address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
];

// RPCs confiáveis (com fallbacks)
const RPC_LIST = [
  "https://polygon-rpc.com",
  "https://rpc.ankr.com/polygon",
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://1rpc.io/matic",
];

// Selectors de funções (4 bytes)
const S = {
  Factory: {
    criarOrdem: "ceff4da6",
    totalOrdens: "8275d6fa",
    ordem: "72c453b8",
  },
  Escrow: {
    obterDados: "32c9e06c",
    executar: "b2d44d08",
    cancelar: "8ffb1ccf",
  },
  ERC20: {
    balanceOf: "70a08231",
    allowance: "dd62ed3e",
    approve: "095ea7b3",
    transfer: "a9059cbb",
  },
  WPOL: {
    deposit: "d0e30db0",   // POL → WPOL
    withdraw: "2e1a7d4d",   // WPOL → POL
  },
};

// Estado global
let provider = null;
let signer = null;
let userAddress = null;
let rpcProvider = null;
let ordersCache = [];
let loading = false;
let isTxBusy = false;
let saldos = { POL: 0n };
let filtroAtivo = { status: "ativas", oferece: "", pede: "", minhas: false };

// ================= UTILITÁRIOS =================
const $ = id => document.getElementById(id);
const isAddr = a => /^0x[a-fA-F0-9]{40}$/.test(a || "");
const short = a => isAddr(a) ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
const mesmoAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Formatar valores
function fmt(bigInt, decimals, maxFrac = 6) {
  try {
    const str = ethers.utils.formatUnits(bigInt.toString(), decimals);
    const [inteiro, fracao = ""] = str.split(".");
    const limpo = fracao.slice(0, maxFrac).replace(/0+$/, "");
    return limpo ? `${inteiro},${limpo}` : inteiro;
  } catch { return "0"; }
}

// Notificações
function toast(texto, tipo = "info", duracao = 4000) {
  const container = $("toasts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = texto;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); }, duracao);
}

function toastTx(texto, hash, tipo = "info") {
  const link = `https://polygonscan.com/tx/${hash}`;
  const container = $("toasts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.innerHTML = `${texto} <a href="${link}" target="_blank" rel="noopener">Ver no PolygonScan ↗</a>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); }, 8000);
}

// ================= CODIFICAÇÃO ABI =================
function encAddr(addr) {
  if (!isAddr(addr)) throw new Error("Endereço inválido");
  return addr.toLowerCase().slice(2).padStart(64, "0");
}
function encUint(valor) {
  return BigInt(valor).toString(16).padStart(64, "0");
}
function decAddr(palavra) {
  return ethers.utils.getAddress("0x" + palavra.slice(-40));
}
function decUint(palavra) {
  return BigInt("0x" + palavra);
}
function decBool(palavra) {
  return decUint(palavra) === 1n;
}
function splitResposta(hex) {
  const semPrefixo = hex.slice(2);
  const partes = [];
  for (let i = 0; i < semPrefixo.length; i += 64) {
    partes.push(semPrefixo.slice(i, i + 64));
  }
  return partes;
}

// ================= REDE / RPC =================
async function testarRPC(url) {
  try {
    const p = new ethers.providers.JsonRpcProvider({ url, timeout: 8000 });
    const rede = await p.getNetwork();
    if (rede.chainId === POLYGON_CHAIN_ID) return p;
  } catch {}
  return null;
}

async function conectarRPC() {
  for (const url of RPC_LIST) {
    const p = await testarRPC(url);
    if (p) {
      rpcProvider = p;
      console.log(`✅ RPC conectado: ${url}`);
      return true;
    }
  }
  return false;
}

async function atualizarStatusRede() {
  const dot = $("netDot");
  const txt = $("netText");
  if (dot) dot.className = "dot load";
  if (txt) txt.textContent = "Conectando…";

  const ok = await conectarRPC();
  if (ok) {
    if (dot) dot.className = "dot";
    if (txt) txt.textContent = "Polygon ✅";
  } else {
    if (dot) dot.className = "dot off";
    if (txt) txt.textContent = "Sem conexão ❌";
    toast("❌ Não foi possível conectar à rede Polygon. Verifique sua internet.", "err", 10000);
  }
  return ok;
}

// ================= TOKENS =================
function tokenPorEndereco(endereco) {
  return TOKENS.find(t => mesmoAddr(t.address, endereco));
}

function preencherSeletores() {
  const opts = TOKENS.map(t => `<option value="${t.address}">${t.symbol} — ${t.name}</option>`).join("");
  ["selOferece", "selDeseja", "selTokenEnvio"].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = opts;
  });
}

// ================= SALDOS =================
async function carregarSaldos() {
  if (!rpcProvider || !userAddress) return;

  try {
    saldos.POL = BigInt((await rpcProvider.getBalance(userAddress)).toString());

    for (const t of TOKENS) {
      if (t.symbol === "POL") continue;
      try {
        const res = await rpcProvider.call({
          to: t.address,
          data: "0x" + S.ERC20.balanceOf + encAddr(userAddress)
        });
        saldos[t.address] = decUint(res.slice(2));
      } catch {
        saldos[t.address] = 0n;
      }
    }
    renderizarSaldos();
  } catch (e) {
    console.error("Erro ao carregar saldos:", e);
  }
}

function renderizarSaldos() {
  const container = $("balances");
  if (!container) return;

  container.innerHTML = "";

  const add = (simbolo, valor, decimais) => {
    const div = document.createElement("div");
    div.className = "bal";
    div.innerHTML = `
      <span class="t">${simbolo}</span>
      <span class="v">${fmt(valor, decimais)}</span>
    `;
    container.appendChild(div);
  };

  add("POL", saldos.POL, 18);
  TOKENS.forEach(t => add(t.symbol, saldos[t.address] || 0n, t.decimals));

  // Atualizar hints
  document.querySelectorAll("[data-hint]").forEach(el => {
    const [tipo, ref] = el.getAttribute("data-hint").split(":");
    if (tipo === "saldoPOL") el.textContent = fmt(saldos.POL, 18);
    if (tipo === "saldoWPOL") {
      const wpol = TOKENS.find(t => t.symbol === "WPOL");
      el.textContent = fmt(saldos[wpol.address] || 0n, 18);
    }
    if (tipo === "saldo" && ref) {
      const sel = $(ref);
      if (sel && sel.value) {
        const tok = tokenPorEndereco(sel.value);
        if (tok) {
          const val = tok.symbol === "POL" ? saldos.POL : (saldos[tok.address] || 0n);
          el.textContent = `Saldo: ${fmt(val, tok.decimals)} ${tok.symbol}`;
        }
      }
    }
  });
}

// ================= CARTEIRA =================
async function conectarCarteira() {
  if (!window.ethereum) {
    toast("❌ MetaMask não detectada! Instale a extensão e recarregue.", "err", 10000);
    return;
  }

  try {
    provider = new ethers.providers.Web3Provider(window.ethereum);

    // Solicitar contas
    const contas = await provider.send("eth_requestAccounts", []);
    if (!contas.length) throw new Error("Nenhuma conta encontrada");

    userAddress = ethers.utils.getAddress(contas[0]);
    signer = provider.getSigner();

    // Verificar rede
    const rede = await provider.getNetwork();
    if (rede.chainId !== POLYGON_CHAIN_ID) {
      toast("⚠️ Mudando para Polygon Mainnet…", "warn");
      try {
        await provider.send("wallet_switchEthereumChain", [{ chainId: "0x89" }]);
      } catch {
        toast("❌ Selecione manualmente a rede Polygon na MetaMask", "err", 8000);
        return;
      }
    }

    // Atualizar UI
    $("btnConnect").style.display = "none";
    $("walletInfo").style.display = "flex";
    $("addr").textContent = short(userAddress);

    toast("✅ Carteira conectada!", "ok");

    // Injetar botões de copiar (garante botão ao lado do endereço)
    injetarBotoesCopiar();

    // Carregar dados
    await carregarSaldos();
    await carregarOrdens();

  } catch (e) {
    if (e.code === 4001) toast("Conexão recusada.", "warn");
    else toast("Erro: " + e.message, "err");
    console.error(e);
  }
}

function desconectarCarteira() {
  provider = null;
  signer = null;
  userAddress = null;
  $("btnConnect").style.display = "block";
  $("walletInfo").style.display = "none";
  toast("Desconectado", "info");
}

// ================= MURAL DE ORDENS =================
async function carregarOrdens() {
  if (loading || !rpcProvider) return;
  loading = true;

  const container = $("orders");
  const counter = $("counter");

  try {
    counter.textContent = "⏳ Consultando…";
    container.innerHTML = '<div class="state"><div class="spinner"></div><p>Carregando ordens…</p></div>';

    // Obter total de ordens
    const totalRes = await rpcProvider.call({
      to: ESCROW_FACTORY,
      data: "0x" + S.Factory.totalOrdens
    });
    const total = Number(decUint(totalRes.slice(2)));

    counter.textContent = `${total} ordem${total !== 1 ? "ens" : ""}`;

    if (total === 0) {
      container.innerHTML = '<div class="empty"><div class="big">📋</div><p>Nenhuma ordem encontrada. Seja o primeiro a criar uma!</p></div>';
      ordersCache = [];
      return;
    }

    // Carregar cada ordem
    const ordens = [];
    for (let i = 0; i < total; i++) {
      try {
        // Obter endereço do escrow
        const enderecoRes = await rpcProvider.call({
          to: ESCROW_FACTORY,
          data: "0x" + S.Factory.ordem + encUint(i)
        });
        const endereco = decAddr(enderecoRes.slice(2));

        // Obter dados do escrow
        const dadosRes = await rpcProvider.call({
          to: endereco,
          data: "0x" + S.Escrow.obterDados
        });
        const p = splitResposta(dadosRes.slice(2));

        ordens.push({
          indice: i,
          endereco: endereco,
          criador: decAddr(p[0]),
          tokenOferecido: decAddr(p[1]),
          valorOferecido: decUint(p[2]),
          tokenDesejado: decAddr(p[3]),
          valorDesejado: decUint(p[4]),
          executado: decBool(p[5]),
          cancelado: decBool(p[6]),
        });
      } catch (e) {
        console.warn(`Erro ao carregar ordem ${i}:`, e.message);
      }
    }

    ordersCache = ordens;
    aplicarFiltros();
    $("muralInfo").textContent = `Exibindo ${ordens.length} de ${total} ordens`;

  } catch (e) {
    container.innerHTML = `<div class="empty">❌ Erro: ${e.message}</div>`;
    console.error("Erro ao carregar ordens:", e);
  } finally {
    loading = false;
  }
}

function aplicarFiltros() {
  let filtrado = [...ordersCache];

  // Status
  if (filtroAtivo.status === "ativas") filtrado = filtrado.filter(o => !o.executado && !o.cancelado);
  if (filtroAtivo.status === "executaveis") filtrado = filtrado.filter(o => !o.executado && !o.cancelado && userAddress && !mesmoAddr(o.criador, userAddress));
  if (filtroAtivo.status === "executadas") filtrado = filtrado.filter(o => o.executado);
  if (filtroAtivo.status === "canceladas") filtrado = filtrado.filter(o => o.cancelado);

  // Outros filtros
  if (filtroAtivo.oferece) filtrado = filtrado.filter(o => mesmoAddr(o.tokenOferecido, filtroAtivo.oferece));
  if (filtroAtivo.pede) filtrado = filtrado.filter(o => mesmoAddr(o.tokenDesejado, filtroAtivo.pede));
  if (filtroAtivo.minhas && userAddress) filtrado = filtrado.filter(o => mesmoAddr(o.criador, userAddress));

  renderizarOrdens(filtrado);
}

function renderizarOrdens(lista) {
  const container = $("orders");
  if (!lista.length) {
    container.innerHTML = '<div class="empty">🔍 Nenhuma ordem encontrada.</div>';
    return;
  }

  container.innerHTML = "";
  lista.sort((a, b) => b.indice - a.indice);

  for (const o of lista) {
    const ofer = tokenPorEndereco(o.tokenOferecido);
    const ped = tokenPorEndereco(o.tokenDesejado);
    const minha = userAddress && mesmoAddr(o.criador, userAddress);
    const ativa = !o.executado && !o.cancelado;

    const div = document.createElement("div");
    div.className = `order ${ativa ? "active" : ""} ${o.executado ? "done" : ""} ${o.cancelado ? "cancelled" : ""}`;
    div.innerHTML = `
      <div class="order-head">
        <span class="order-num">#${o.indice}</span>
        <span class="tag ${o.executado ? "done" : o.cancelado ? "cancelled" : "active"}">
          ${o.executado ? "✅ Executada" : o.cancelado ? "❌ Cancelada" : "🔵 Ativa"}
        </span>
      </div>
      <div class="order-id">Escrow: ${short(o.endereco)}</div>
      <div class="swap">
        <div class="swap-side">
          <div class="swap-lbl">Oferece</div>
          <div class="swap-amt">${ofer ? fmt(o.valorOferecido, ofer.decimals) : "?"} ${ofer?.symbol || "???"}</div>
        </div>
        <div class="swap-icon">⇄</div>
        <div class="swap-side">
          <div class="swap-lbl">Pede</div>
          <div class="swap-amt">${ped ? fmt(o.valorDesejado, ped.decimals) : "?"} ${ped?.symbol || "???"}</div>
        </div>
      </div>
      <div class="swap-escrow ok">Criador: ${short(o.criador)} ${minha ? "(você)" : ""}</div>
      <div class="order-foot">
        <span class="order-meta">${minha ? "Sua ordem" : "Ordem externa"}</span>
        <div class="order-actions">
          ${ativa && !minha ? `<button class="btn btn-sm btn-primary" onclick="executarOrdem('${o.endereco}')">Executar</button>` : ""}
          ${ativa && minha ? `<button class="btn btn-sm" onclick="cancelarOrdem('${o.endereco}')">Cancelar</button>` : ""}
        </div>
      </div>
    `;
    container.appendChild(div);
  }
}

// ================= CRIAR ORDEM =================
async function criarOrdem() {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;

  try {
    const ofAddr = $("selOferece").value;
    const deAddr = $("selDeseja").value;
    const ofToken = tokenPorEndereco(ofAddr);
    const deToken = tokenPorEndereco(deAddr);

    if (!ofToken || !deToken) throw new Error("Selecione os tokens");
    if (mesmoAddr(ofAddr, deAddr)) throw new Error("Tokens devem ser diferentes");

    // Ler valores
    const ofVal = ethers.utils.parseUnits($("valorOferece").value.replace(",", "."), ofToken.decimals);
    const deVal = ethers.utils.parseUnits($("valorDeseja").value.replace(",", "."), deToken.decimals);

    // Verificar saldo
    const saldo = ofToken.symbol === "POL"
      ? saldos.POL
      : decUint((await rpcProvider.call({ to: ofAddr, data: "0x" + S.ERC20.balanceOf + encAddr(userAddress) })).slice(2));

    if (saldo < ofVal) throw new Error(`Saldo insuficiente de ${ofToken.symbol}`);

    // Aprovar se for token ERC20
    if (ofToken.symbol !== "POL") {
      const allowance = decUint((await rpcProvider.call({
        to: ofAddr,
        data: "0x" + S.ERC20.allowance + encAddr(userAddress) + encAddr(ESCROW_FACTORY)
      })).slice(2));

      if (allowance < ofVal) {
        toast(`⏳ Aprovando ${ofToken.symbol}…`, "info");
        const tx = await signer.sendTransaction({
          to: ofAddr,
          data: "0x" + S.ERC20.approve + encAddr(ESCROW_FACTORY) + encUint(ofVal),
          gasLimit: 100000
        });
        toastTx("📤 Aprovação:", tx.hash);
        await tx.wait();
        toast("✅ Aprovado!", "ok");
      }
    }

    // Criar ordem
    toast("⏳ Criando ordem…", "info");
    const tx = await signer.sendTransaction({
      to: ESCROW_FACTORY,
      data: "0x" + S.Factory.criarOrdem + encAddr(ofAddr) + encUint(ofVal) + encAddr(deAddr) + encUint(deVal),
      gasLimit: 500000,
      value: ofToken.symbol === "POL" ? ofVal : 0n
    });

    toastTx("📤 Ordem criada:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Ordem criada com sucesso!", "ok");

    // Limpar e recarregar
    $("valorOferece").value = "";
    $("valorDeseja").value = "";
    await carregarSaldos();
    await carregarOrdens();

  } catch (e) {
    toast("❌ " + (e.message || "Erro desconhecido"), "err");
    console.error(e);
  } finally {
    isTxBusy = false;
  }
}

// ================= EXECUTAR / CANCELAR ORDEM =================
window.executarOrdem = async function(escrowAddr) {
  if (!signer || isTxBusy) return;
  isTxBusy = true;

  try {
    toast("⏳ Executando…", "info");
    const tx = await signer.sendTransaction({
      to: escrowAddr,
      data: "0x" + S.Escrow.executar,
      gasLimit: 300000
    });
    toastTx("📤 Transação:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Ordem executada!", "ok");
    await carregarSaldos();
    await carregarOrdens();
  } catch (e) {
    toast("❌ " + e.message, "err");
  } finally {
    isTxBusy = false;
  }
};

window.cancelarOrdem = async function(escrowAddr) {
  if (!signer || isTxBusy) return;
  isTxBusy = true;

  try {
    toast("⏳ Cancelando…", "info");
    const tx = await signer.sendTransaction({
      to: escrowAddr,
      data: "0x" + S.Escrow.cancelar,
      gasLimit: 200000
    });
    toastTx("📤 Transação:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Ordem cancelada!", "ok");
    await carregarSaldos();
    await carregarOrdens();
  } catch (e) {
    toast("❌ " + e.message, "err");
  } finally {
    isTxBusy = false;
  }
};

// ================= ENVIAR TOKENS =================
async function enviarToken() {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;

  try {
    const tokenAddr = $("selTokenEnvio").value;
    const destino = $("destinoEnvio").value.trim();
    const valorStr = $("valorEnvio").value.replace(",", ".");
    const token = tokenPorEndereco(tokenAddr);

    if (!token) throw new Error("Selecione um token");
    if (!isAddr(destino)) throw new Error("Endereço inválido");
    if (mesmoAddr(destino, userAddress)) throw new Error("Não pode enviar para você mesmo");

    const valor = ethers.utils.parseUnits(valorStr, token.decimals);

    toast(`⏳ Enviando ${fmt(valor, token.decimals, 4)} ${token.symbol}…`, "info");

    let tx;
    if (token.symbol === "POL") {
      tx = await signer.sendTransaction({ to: destino, value: valor, gasLimit: 21000 });
    } else {
      tx = await signer.sendTransaction({
        to: token.address,
        data: "0x" + S.ERC20.transfer + encAddr(destino) + encUint(valor),
        gasLimit: 100000
      });
    }

    toastTx("📤 Transação:", tx.hash, "ok");
    await tx.wait();
    toast(`✅ ${token.symbol} enviado!`, "ok");

    $("destinoEnvio").value = "";
    $("valorEnvio").value = "";
    await carregarSaldos();

  } catch (e) {
    toast("❌ " + e.message, "err");
  } finally {
    isTxBusy = false;
  }
}

// ================= CONVERSÃO POL ↔ WPOL =================
async function wrapPOL() {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;

  try {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    const valorStr = $("valorWPOL").value.replace(",", ".");
    const valor = ethers.utils.parseUnits(valorStr, 18);

    if (valor > saldos.POL) throw new Error("Saldo insuficiente de POL");

    toast(`⏳ Convertendo ${fmt(valor, 18, 4)} POL → WPOL…`, "info");
    const tx = await signer.sendTransaction({
      to: wpol.address,
      data: "0x" + S.WPOL.deposit,
      value: valor,
      gasLimit: 50000
    });
    toastTx("📤 Transação:", tx.hash, "ok");
    await tx.wait();
    toast("✅ POL convertido em WPOL!", "ok");

    $("valorWPOL").value = "";
    await carregarSaldos();

  } catch (e) {
    toast("❌ " + e.message, "err");
  } finally {
    isTxBusy = false;
  }
}

async function unwrapWPOL() {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;

  try {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    const valorStr = $("valorPOL").value.replace(",", ".");
    const valor = ethers.utils.parseUnits(valorStr, 18);

    const saldoWPOL = saldos[wpol.address] || 0n;
    if (valor > saldoWPOL) throw new Error("Saldo insuficiente de WPOL");

    toast(`⏳ Convertendo ${fmt(valor, 18, 4)} WPOL → POL…`, "info");
    const tx = await signer.sendTransaction({
      to: wpol.address,
      data: "0x" + S.WPOL.withdraw + encUint(valor),
      gasLimit: 50000
    });
    toastTx("📤 Transação:", tx.hash, "ok");
    await tx.wait();
    toast("✅ WPOL convertido em POL!", "ok");

    $("valorPOL").value = "";
    await carregarSaldos();

  } catch (e) {
    toast("❌ " + e.message, "err");
  } finally {
    isTxBusy = false;
  }
}

// ================= BITCOIN (BTC) =================
const BTC_API = "https://mempool.space/api";

// Valida endereços Legacy (1...), P2SH (3...), Bech32 (bc1q...) e Bech32m (bc1p...)
function isBTCAddr(addr) {
  if (!addr) return false;
  return /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{25,62})$/i.test(addr.trim());
}

// Formata satoshis → "X.XXXXXXXX BTC"
function fmtBTC(sats) {
  const btc = Number(sats) / 1e8;
  return btc.toLocaleString("pt-BR", {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8,
  });
}

async function consultarBTC() {
  const input    = $("btcAddressQuery");
  const result   = $("btcBalanceResult");
  const valueEl  = $("btcBalanceValue");
  const detailEl = $("btcBalanceDetails");
  const btn      = $("btnCheckBtc");

  const addr = (input?.value || "").trim();

  if (!addr) {
    toast("❌ Digite um endereço Bitcoin", "warn");
    return;
  }
  if (!isBTCAddr(addr)) {
    toast("❌ Endereço Bitcoin inválido. Use bc1…, 1… ou 3…", "err");
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "⏳ Consultando…"; }
  if (result) result.classList.remove("show");

  try {
    // 1) Saldo — mempool.space
    const res = await fetch(`${BTC_API}/address/${encodeURIComponent(addr)}`);
    if (!res.ok) {
      if (res.status === 400) throw new Error("Endereço não reconhecido pela rede Bitcoin");
      throw new Error(`API retornou ${res.status}`);
    }
    const data = await res.json();

    const chain   = data.chain_stats   || {};
    const mempool = data.mempool_stats || {};

    const confirmado = (chain.funded_txo_sum   || 0) - (chain.spent_txo_sum   || 0);
    const pendente   = (mempool.funded_txo_sum || 0) - (mempool.spent_txo_sum || 0);
    const txs        = (chain.tx_count || 0) + (mempool.tx_count || 0);

    // 2) Preço em USD (opcional, não bloqueia)
    let precoUSD = null;
    try {
      const pr = await fetch(`${BTC_API}/v1/prices`);
      if (pr.ok) {
        const prices = await pr.json();
        precoUSD = prices.USD || null;
      }
    } catch { /* ignora falha de preço */ }

    // 3) Renderizar resultado
    if (result)  result.classList.add("show");
    if (valueEl) valueEl.textContent = `${fmtBTC(confirmado)} BTC`;

    const partes = [];
    if (precoUSD) {
      const usd = (confirmado / 1e8) * precoUSD;
      partes.push(`≈ ${usd.toLocaleString("pt-BR", { style: "currency", currency: "USD" })}`);
    }
    partes.push(`Transações: ${txs}`);
    if (pendente > 0) partes.push(`⏳ Recebendo: ${fmtBTC(pendente)} BTC`);
    else if (pendente < 0) partes.push(`⏳ Enviando: ${fmtBTC(-pendente)} BTC`);

    if (detailEl) detailEl.textContent = partes.join("  •  ");

    toast(`✅ Saldo: ${fmtBTC(confirmado)} BTC`, "ok");

  } catch (e) {
    console.error("Erro BTC:", e);
    if (result) result.classList.remove("show");
    toast("❌ " + (e.message || "Erro ao consultar BTC"), "err", 8000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "₿ Consultar Saldo"; }
  }
}

// ================= COPIAR ENDEREÇOS =================
async function copiarTexto(texto) {
  try {
    // Método moderno (requer HTTPS ou localhost)
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
    // Fallback para navegadores antigos / HTTP
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, texto.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    console.error("Erro ao copiar:", e);
    return false;
  }
}

async function copiarEnderecoBRN(btn) {
  const brn = TOKENS.find(t => t.symbol === "BRN");
  if (!brn) { toast("❌ Token BRN não encontrado", "err"); return; }

  const ok = await copiarTexto(brn.address);
  if (ok) {
    toast("📋 Endereço do contrato BRN copiado! Envie para o cliente importar.", "ok", 6000);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "✅ Copiado!";
      btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    }
  } else {
    toast("❌ Não foi possível copiar. Copie manualmente: " + brn.address, "err", 10000);
  }
}

async function copiarMeuEndereco(btn) {
  if (!userAddress) {
    toast("⚠️ Conecte a carteira primeiro", "warn");
    return;
  }
  const ok = await copiarTexto(userAddress);
  if (ok) {
    toast("📋 Seu endereço copiado! Envie para o cliente fazer o pagamento.", "ok", 6000);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "✅";
      btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    }
  } else {
    toast("❌ Não foi possível copiar.", "err");
  }
}

// Injeta os botões na UI sem alterar o HTML
function injetarBotoesCopiar() {
  // ========== 1) Botão "Copiar contrato BRN" — no card de saldos ==========
  const balancesCard = $("balances")?.closest(".card");
  if (balancesCard && !$("btnCopyBRN")) {
    const h2 = balancesCard.querySelector("h2");
    if (h2 && !h2.dataset.wrapped) {
      // Envolver o h2 + botão em um flex para alinhar lado a lado
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "8px";
      wrap.style.marginBottom = "16px";
      wrap.style.flexWrap = "wrap";

      h2.parentNode.insertBefore(wrap, h2);
      h2.style.margin = "0";
      h2.dataset.wrapped = "1";
      wrap.appendChild(h2);

      const btn = document.createElement("button");
      btn.id = "btnCopyBRN";
      btn.className = "btn btn-sm";
      btn.style.fontSize = "0.75rem";
      btn.textContent = "📋 Copiar contrato BRN";
      btn.title = "Copiar endereço do contrato BRN para o cliente importar na carteira";
      btn.addEventListener("click", () => copiarEnderecoBRN(btn));
      wrap.appendChild(btn);
    }
  }

  // ========== 2) Botão "Copiar meu endereço" — na barra da carteira ==========
  const walletInfo = $("walletInfo");
  const addrEl = $("addr");
  if (walletInfo && addrEl && !$("btnCopyMyAddr")) {
    const btn = document.createElement("button");
    btn.id = "btnCopyMyAddr";
    btn.className = "btn btn-sm";
    btn.textContent = "📋";
    btn.title = "Copiar meu endereço (para o cliente enviar tokens)";
    btn.style.padding = "2px 8px";
    btn.style.fontSize = "0.85rem";
    btn.addEventListener("click", () => copiarMeuEndereco(btn));
    addrEl.parentNode.insertBefore(btn, addrEl.nextSibling);
  }

  // ========== 3) Botão "Copiar meu endereço" — no painel Enviar ==========
  const enviarPanel = $("panel-enviar");
  if (enviarPanel && !$("btnCopyMyAddrEnviar")) {
    const card = enviarPanel.querySelector(".card");
    if (card) {
      const h2 = card.querySelector("h2");
      if (h2 && !h2.dataset.wrapped) {
        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.alignItems = "center";
        wrap.style.justifyContent = "space-between";
        wrap.style.gap = "8px";
        wrap.style.marginBottom = "16px";

        h2.parentNode.insertBefore(wrap, h2);
        h2.style.margin = "0";
        h2.dataset.wrapped = "1";
        wrap.appendChild(h2);

        const btn = document.createElement("button");
        btn.id = "btnCopyMyAddrEnviar";
        btn.className = "btn btn-sm";
        btn.style.fontSize = "0.75rem";
        btn.textContent = "📋 Copiar meu endereço";
        btn.title = "Copiar seu endereço para compartilhar com clientes";
        btn.addEventListener("click", () => copiarMeuEndereco(btn));
        wrap.appendChild(btn);
      }
    }
  }
}

// ================= NAVEGAÇÃO DE ABAS =================
function configurarAbas() {
  document.querySelectorAll(".tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      const aba = btn.dataset.tab;

      // Atualizar botões
      document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Mostrar painel correto
      document.querySelectorAll(".panel").forEach(p => p.hidden = true);
      $(`panel-${aba}`).hidden = false;

      // Atualizar hints de saldo
      setTimeout(renderizarSaldos, 50);

      // Garantir botões de copiar em painéis recém-exibidos
      setTimeout(injetarBotoesCopiar, 60);
    });
  });
}

// ================= FILTROS =================
function configurarFiltros() {
  $("filtroStatus").addEventListener("change", e => {
    filtroAtivo.status = e.target.value;
    aplicarFiltros();
  });
  $("filtroOferece").addEventListener("change", e => {
    filtroAtivo.oferece = e.target.value;
    aplicarFiltros();
  });
  $("filtroPede").addEventListener("change", e => {
    filtroAtivo.pede = e.target.value;
    aplicarFiltros();
  });
  $("filtroMinhas").addEventListener("change", e => {
    filtroAtivo.minhas = e.target.checked;
    aplicarFiltros();
  });
  $("btnLimparFiltros").addEventListener("click", () => {
    filtroAtivo = { status: "ativas", oferece: "", pede: "", minhas: false };
    $("filtroStatus").value = "ativas";
    $("filtroOferece").value = "";
    $("filtroPede").value = "";
    $("filtroMinhas").checked = false;
    aplicarFiltros();
  });
}

// ================= INICIALIZAÇÃO =================
async function init() {
  console.log("🚀 BRN Exchange — Iniciando…");

  // Verificar ethers
  if (typeof ethers === "undefined") {
    console.error("❌ Ethers.js não carregado! Verifique a ordem dos scripts no HTML.");
    alert("ERRO: Ethers.js não foi carregado. Verifique a ordem dos scripts.");
    return;
  }
  console.log("✅ Ethers.js carregado");

  // Conectar RPC
  await atualizarStatusRede();

  // Preencher seletores
  preencherSeletores();

  // Injetar botões de copiar
  injetarBotoesCopiar();

  // Configurar abas
  configurarAbas();

  // Configurar filtros
  configurarFiltros();

  // Botões principais
  $("btnConnect").addEventListener("click", conectarCarteira);
  $("btnDisconnect").addEventListener("click", desconectarCarteira);
  $("btnRefresh").addEventListener("click", carregarOrdens);
  $("btnCriarOrdem").addEventListener("click", criarOrdem);
  $("btnEnviar").addEventListener("click", enviarToken);
  $("btnConverterWPOL").addEventListener("click", wrapPOL);
  $("btnConverterPOL").addEventListener("click", unwrapWPOL);

  // ===== Bitcoin =====
  $("btnCheckBtc")?.addEventListener("click", consultarBTC);
  $("btcAddressQuery")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); consultarBTC(); }
  });

  // Botões MAX
  $("btnMaxOf")?.addEventListener("click", () => {
    const sel = $("selOferece");
    const tok = tokenPorEndereco(sel.value);
    if (tok) {
      const val = tok.symbol === "POL" ? saldos.POL : (saldos[tok.address] || 0n);
      $("valorOferece").value = ethers.utils.formatUnits(val.toString(), tok.decimals).replace(/\.?0+$/, "");
    }
  });
  $("btnMaxSend")?.addEventListener("click", () => {
    const sel = $("selTokenEnvio");
    const tok = tokenPorEndereco(sel.value);
    if (tok) {
      const val = tok.symbol === "POL" ? saldos.POL : (saldos[tok.address] || 0n);
      $("valorEnvio").value = ethers.utils.formatUnits(val.toString(), tok.decimals).replace(/\.?0+$/, "");
    }
  });
  $("btnMaxWrap")?.addEventListener("click", () => {
    $("valorWPOL").value = ethers.utils.formatUnits(saldos.POL.toString(), 18).replace(/\.?0+$/, "");
  });
  $("btnMaxUnwrap")?.addEventListener("click", () => {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    $("valorPOL").value = ethers.utils.formatUnits((saldos[wpol.address] || 0n).toString(), 18).replace(/\.?0+$/, "");
  });

  // Atualizar hints ao mudar seleção
  ["selOferece", "selTokenEnvio"].forEach(id => {
    $(id)?.addEventListener("change", renderizarSaldos);
  });

  // Carregar ordens automaticamente
  if (rpcProvider) {
    await carregarOrdens();
  }

  console.log("✅ Inicialização concluída!");
}

// Iniciar quando a página carregar
window.addEventListener("load", init);

// Detectar troca de conta na MetaMask
if (window.ethereum) {
  window.ethereum.on("accountsChanged", contas => {
    if (contas.length === 0) desconectarCarteira();
    else window.location.reload();
  });
  window.ethereum.on("chainChanged", () => window.location.reload());
}
// ============================================================
// APP.JS — BRN Exchange | Versão Completa e Corrigida
// ✅ Conexão Polygon | ✅ Mural de Ordens | ✅ Criar Ordem
// ✅ Enviar Tokens | ✅ POL ↔ WPOL | ✅ Consulta BTC
// ✅ Copiar Endereço BRN | ✅ Diagnóstico Completo
// ============================================================

// ================= CONFIGURAÇÕES =================
const ESCROW_FACTORY = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;

// Tokens suportados
const TOKENS = [
  { symbol: "BRN",  name: "BRN Token",         address: "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210", decimals: 18 },
  { symbol: "USDC", name: "USD Coin",           address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
  { symbol: "USDT", name: "Tether USD",          address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8a", decimals: 6 },
  { symbol: "WPOL", name: "Wrapped POL",         address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
  { symbol: "WBTC", name: "Wrapped BTC",         address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
];

// RPCs confiáveis (com fallbacks)
const RPC_LIST = [
  "https://polygon-rpc.com",
  "https://rpc.ankr.com/polygon",
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://1rpc.io/matic",
];

// Selectors de funções (4 bytes)
const S = {
  Factory: {
    criarOrdem: "ceff4da6",
    totalOrdens: "8275d6fa",
    ordem: "72c453b8",
  },
  Escrow: {
    obterDados: "32c9e06c",
    executar: "b2d44d08",
    cancelar: "8ffb1ccf",
  },
  ERC20: {
    balanceOf: "70a08231",
    allowance: "dd62ed3e",
    approve: "095ea7b3",
    transfer: "a9059cbb",
  },
  WPOL: {
    deposit: "d0e30db0",   // POL → WPOL
    withdraw: "2e1a7d4d",   // WPOL → POL
  },
};

// Estado global
let provider = null;
let signer = null;
let userAddress = null;
let rpcProvider = null;
let ordersCache = [];
let loading = false;
let isTxBusy = false;
let saldos = { POL: 0n };
let filtroAtivo = { status: "ativas", oferece: "", pede: "", minhas: false };

// ================= UTILITÁRIOS =================
const $ = id => document.getElementById(id);
const isAddr = a => /^0x[a-fA-F0-9]{40}$/.test(a || "");
const short = a => isAddr(a) ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
const mesmoAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Formatar valores
function fmt(bigInt, decimals, maxFrac = 6) {
  try {
    const str = ethers.utils.formatUnits(bigInt.toString(), decimals);
    const [inteiro, fracao = ""] = str.split(".");
    const limpo = fracao.slice(0, maxFrac).replace(/0+$/, "");
    return limpo ? `${inteiro},${limpo}` : inteiro;
  } catch { return "0"; }
}

// Notificações
function toast(texto, tipo = "info", duracao = 4000) {
  const container = $("toasts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = texto;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); }, duracao);
}

function toastTx(texto, hash, tipo = "info") {
  const link = `https://polygonscan.com/tx/${hash}`;
  const container = $("toasts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.innerHTML = `${texto} <a href="${link}" target="_blank" rel="noopener">Ver no PolygonScan ↗</a>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); }, 8000);
}

// ================= CODIFICAÇÃO ABI =================
function encAddr(addr) {
  if (!isAddr(addr)) throw new Error("Endereço inválido");
  return addr.toLowerCase().slice(2).padStart(64, "0");
}
function encUint(valor) {
  return BigInt(valor).toString(16).padStart(64, "0");
}
function decAddr(palavra) {
  return ethers.utils.getAddress("0x" + palavra.slice(-40));
}
function decUint(palavra) {
  return BigInt("0x" + palavra);
}
function decBool(palavra) {
  return decUint(palavra) === 1n;
}
function splitResposta(hex) {
  const semPrefixo = hex.slice(2);
  const partes = [];
  for (let i = 0; i < semPrefixo.length; i += 64) {
    partes.push(semPrefixo.slice(i, i + 64));
  }
  return partes;
}

// ================= REDE / RPC =================
async function testarRPC(url) {
  try {
    const p = new ethers.providers.JsonRpcProvider({ url, timeout: 8000 });
    const rede = await p.getNetwork();
    if (rede.chainId === POLYGON_CHAIN_ID) return p;
  } catch {}
  return null;
}

async function conectarRPC() {
  for (const url of RPC_LIST) {
    const p = await testarRPC(url);
    if (p) {
      rpcProvider = p;
      console.log(`✅ RPC conectado: ${url}`);
      return true;
    }
  }
  return false;
}

async function atualizarStatusRede() {
  const dot = $("netDot");
  const txt = $("netText");
  if (dot) dot.className = "dot load";
  if (txt) txt.textContent = "Conectando…";

  const ok = await conectarRPC();
  if (ok) {
    if (dot) dot.className = "dot";
    if (txt) txt.textContent = "Polygon ✅";
  } else {
    if (dot) dot.className = "dot off";
    if (txt) txt.textContent = "Sem conexão ❌";
    toast("❌ Não foi possível conectar à rede Polygon. Verifique sua internet.", "err", 10000);
  }
  return ok;
}

// ================= TOKENS =================
function tokenPorEndereco(endereco) {
  return TOKENS.find(t => mesmoAddr(t.address, endereco));
}

function preencherSeletores() {
  const opts = TOKENS.map(t => `<option value="${t.address}">${t.symbol} — ${t.name}</option>`).join("");
  ["selOferece", "selDeseja", "selTokenEnvio"].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = opts;
  });
}

// ================= SALDOS =================
async function carregarSaldos() {
  if (!rpcProvider || !userAddress) return;

  try {
    saldos.POL = BigInt((await rpcProvider.getBalance(userAddress)).toString());

    for (const t of TOKENS) {
      if (t.symbol === "POL") continue;
      try {
        const res = await rpcProvider.call({
          to: t.address,
          data: "0x" + S.ERC20.balanceOf + encAddr(userAddress)
        });
        saldos[t.address] = decUint(res.slice(2));
      } catch {
        saldos[t.address] = 0n;
      }
    }
    renderizarSaldos();
  } catch (e) {
    console.error("Erro ao carregar saldos:", e);
  }
}

function renderizarSaldos() {
  const container = $("balances");
  if (!container) return;

  container.innerHTML = "";

  const add = (simbolo, valor, decimais) => {
    const div = document.createElement("div");
    div.className = "bal";
    div.innerHTML = `
      <span class="t">${simbolo}</span>
      <span class="v">${fmt(valor, decimais)}</span>
    `;
    container.appendChild(div);
  };

  add("POL", saldos.POL, 18);
  TOKENS.forEach(t => add(t.symbol, saldos[t.address] || 0n, t.decimals));

  // Atualizar hints
  document.querySelectorAll("[data-hint]").forEach(el => {
    const [tipo, ref] = el.getAttribute("data-hint").split(":");
    if (tipo === "saldoPOL") el.textContent = fmt(saldos.POL, 18);
    if (tipo === "saldoWPOL") {
      const wpol = TOKENS.find(t => t.symbol === "WPOL");
      el.textContent = fmt(saldos[wpol.address] || 0n, 18);
    }
    if (tipo === "saldo" && ref) {
      const sel = $(ref);
      if (sel && sel.value) {
        const tok = tokenPorEndereco(sel.value);
        if (tok) {
          const val = tok.symbol === "POL" ? saldos.POL : (saldos[tok.address] || 0n);
          el.textContent = `Saldo: ${fmt(val, tok.decimals)} ${tok.symbol}`;
        }
      }
    }
  });
}

// ================= CARTEIRA =================
async function conectarCarteira() {
  if (!window.ethereum) {
    toast("❌ MetaMask não detectada! Instale a extensão e recarregue.", "err", 10000);
    return;
  }

  try {
    provider = new ethers.providers.Web3Provider(window.ethereum);

    // Solicitar contas
    const contas = await provider.send("eth_requestAccounts", []);
    if (!contas.length) throw new Error("Nenhuma conta encontrada");

    userAddress = ethers.utils.getAddress(contas[0]);
    signer = provider.getSigner();

    // Verificar rede
    const rede = await provider.getNetwork();
    if (rede.chainId !== POLYGON_CHAIN_ID) {
      toast("⚠️ Mudando para Polygon Mainnet…", "warn");
      try {
        await provider.send("wallet_switchEthereumChain", [{ chainId: "0x89" }]);
      } catch {
        toast("❌ Selecione manualmente a rede Polygon na MetaMask", "err", 8000);
        return;
      }
    }

    // Atualizar UI
    $("btnConnect").style.display = "none";
    $("walletInfo").style.display = "flex";
    $("addr").textContent = short(userAddress);

    toast("✅ Carteira conectada!", "ok");

    // Injetar botões de copiar (garante botão ao lado do endereço)
    injetarBotoesCopiar();

    // Carregar dados
    await carregarSaldos();
    await carregarOrdens();

  } catch (e) {
    if (e.code === 4001) toast("Conexão recusada.", "warn");
    else toast("Erro: " + e.message, "err");
    console.error(e);
  }
}

function desconectarCarteira() {
  provider = null;
  signer = null;
  userAddress = null;
  $("btnConnect").style.display = "block";
  $("walletInfo").style.display = "none";
  toast("Desconectado", "info");
}

// ================= MURAL DE ORDENS =================
async function carregarOrdens() {
  if (loading || !rpcProvider) return;
  loading = true;

  const container = $("orders");
  const counter = $("counter");

  try {
    counter.textContent = "⏳ Consultando…";
    container.innerHTML = '<div class="state"><div class="spinner"></div><p>Carregando ordens…</p></div>';

    // Obter total de ordens
    const totalRes = await rpcProvider.call({
      to: ESCROW_FACTORY,
      data: "0x" + S.Factory.totalOrdens
    });
    const total = Number(decUint(totalRes.slice(2)));

    counter.textContent = `${total} ordem${total !== 1 ? "ens" : ""}`;

    if (total === 0) {
      container.innerHTML = '<div class="empty"><div class="big">📋</div><p>Nenhuma ordem encontrada. Seja o primeiro a criar uma!</p></div>';
      ordersCache = [];
      return;
    }

    // Carregar cada ordem
    const ordens = [];
    for (let i = 0; i < total; i++) {
      try {
        // Obter endereço do escrow
        const enderecoRes = await rpcProvider.call({
          to: ESCROW_FACTORY,
          data: "0x" + S.Factory.ordem + encUint(i)
        });
        const endereco = decAddr(enderecoRes.slice(2));

        // Obter dados do escrow
        const dadosRes = await rpcProvider.call({
          to: endereco,
          data: "0x" + S.Escrow.obterDados
        });
        const p = splitResposta(dadosRes.slice(2));

        ordens.push({
          indice: i,
          endereco: endereco,
          criador: decAddr(p[0]),
          tokenOferecido: decAddr(p[1]),
          valorOferecido: decUint(p[2]),
          tokenDesejado: decAddr(p[3]),
          valorDesejado: decUint(p[4]),
          executado: decBool(p[5]),
          cancelado: decBool(p[6]),
        });
      } catch (e) {
        console.warn(`Erro ao carregar ordem ${i}:`, e.message);
      }
    }

    ordersCache = ordens;
    aplicarFiltros();
    $("muralInfo").textContent = `Exibindo ${ordens.length} de ${total} ordens`;

  } catch (e) {
    container.innerHTML = `<div class="empty">❌ Erro: ${e.message}</div>`;
    console.error("Erro ao carregar ordens:", e);
  } finally {
    loading = false;
  }
}

function aplicarFiltros() {
  let filtrado = [...ordersCache];

  // Status
  if (filtroAtivo.status === "ativas") filtrado = filtrado.filter(o => !o.executado && !o.cancelado);
  if (filtroAtivo.status === "executaveis") filtrado = filtrado.filter(o => !o.executado && !o.cancelado && userAddress && !mesmoAddr(o.criador, userAddress));
  if (filtroAtivo.status === "executadas") filtrado = filtrado.filter(o => o.executado);
  if (filtroAtivo.status === "canceladas") filtrado = filtrado.filter(o => o.cancelado);

  // Outros filtros
  if (filtroAtivo.oferece) filtrado = filtrado.filter(o => mesmoAddr(o.tokenOferecido, filtroAtivo.oferece));
  if (filtroAtivo.pede) filtrado = filtrado.filter(o => mesmoAddr(o.tokenDesejado, filtroAtivo.pede));
  if (filtroAtivo.minhas && userAddress) filtrado = filtrado.filter(o => mesmoAddr(o.criador, userAddress));

  renderizarOrdens(filtrado);
}

function renderizarOrdens(lista) {
  const container = $("orders");
  if (!lista.length) {
    container.innerHTML = '<div class="empty">🔍 Nenhuma ordem encontrada.</div>';
    return;
  }

  container.innerHTML = "";
  lista.sort((a, b) => b.indice - a.indice);

  for (const o of lista) {
    const ofer = tokenPorEndereco(o.tokenOferecido);
    const ped = tokenPorEndereco(o.tokenDesejado);
    const minha = userAddress && mesmoAddr(o.criador, userAddress);
    const ativa = !o.executado && !o.cancelado;

    const div = document.createElement("div");
    div.className = `order ${ativa ? "active" : ""} ${o.executado ? "done" : ""} ${o.cancelado ? "cancelled" : ""}`;
    div.innerHTML = `
      <div class="order-head">
        <span class="order-num">#${o.indice}</span>
        <span class="tag ${o.executado ? "done" : o.cancelado ? "cancelled" : "active"}">
          ${o.executado ? "✅ Executada" : o.cancelado ? "❌ Cancelada" : "🔵 Ativa"}
        </span>
      </div>
      <div class="order-id">Escrow: ${short(o.endereco)}</div>
      <div class="swap">
        <div class="swap-side">
          <div class="swap-lbl">Oferece</div>
          <div class="swap-amt">${ofer ? fmt(o.valorOferecido, ofer.decimals) : "?"} ${ofer?.symbol || "???"}</div>
        </div>
        <div class="swap-icon">⇄</div>
        <div class="swap-side">
          <div class="swap-lbl">Pede</div>
          <div class="swap-amt">${ped ? fmt(o.valorDesejado, ped.decimals) : "?"} ${ped?.symbol || "???"}</div>
        </div>
      </div>
      <div class="swap-escrow ok">Criador: ${short(o.criador)} ${minha ? "(você)" : ""}</div>
      <div class="order-foot">
        <span class="order-meta">${minha ? "Sua ordem" : "Ordem externa"}</span>
        <div class="order-actions">
          ${ativa && !minha ? `<button class="btn btn-sm btn-primary" onclick="executarOrdem('${o.endereco}')">Executar</button>` : ""}
          ${ativa && minha ? `<button class="btn btn-sm" onclick="cancelarOrdem('${o.endereco}')">Cancelar</button>` : ""}
        </div>
      </div>
    `;
    container.appendChild(div);
  }
}

// ================= CRIAR ORDEM =================
async function criarOrdem() {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;

  try {
    const ofAddr = $("selOferece").value;
    const deAddr = $("selDeseja").value;
    const ofToken = tokenPorEndereco(ofAddr);
    const deToken = tokenPorEndereco(deAddr);

    if (!ofToken || !deToken) throw new Error("Selecione os tokens");
    if (mesmoAddr(ofAddr, deAddr)) throw new Error("Tokens devem ser diferentes");

    // Ler valores
    const ofVal = ethers.utils.parseUnits($("valorOferece").value.replace(",", "."), ofToken.decimals);
    const deVal = ethers.utils.parseUnits($("valorDeseja").value.replace(",", "."), deToken.decimals);

    // Verificar saldo
    const saldo = ofToken.symbol === "POL"
      ? saldos.POL
      : decUint((await rpcProvider.call({ to: ofAddr, data: "0x" + S.ERC20.balanceOf + encAddr(userAddress) })).slice(2));

    if (saldo < ofVal) throw new Error(`Saldo insuficiente de ${ofToken.symbol}`);

    // Aprovar se for token ERC20
    if (ofToken.symbol !== "POL") {
      const allowance = decUint((await rpcProvider.call({
        to: ofAddr,
        data: "0x" + S.ERC20.allowance + encAddr(userAddress) + encAddr(ESCROW_FACTORY)
      })).slice(2));

      if (allowance < ofVal) {
        toast(`⏳ Aprovando ${ofToken.symbol}…`, "info");
        const tx = await signer.sendTransaction({
          to: ofAddr,
          data: "0x" + S.ERC20.approve + encAddr(ESCROW_FACTORY) + encUint(ofVal),
          gasLimit: 100000
        });
        toastTx("📤 Aprovação:", tx.hash);
        await tx.wait();
        toast("✅ Aprovado!", "ok");
      }
    }

    // Criar ordem
    toast("⏳ Criando ordem…", "info");
    const tx = await signer.sendTransaction({
      to: ESCROW_FACTORY,
      data: "0x" + S.Factory.criarOrdem + encAddr(ofAddr) + encUint(ofVal) + encAddr(deAddr) + encUint(deVal),
      gasLimit: 500000,
      value: ofToken.symbol === "POL" ? ofVal : 0n
    });

    toastTx("📤 Ordem criada:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Ordem criada com sucesso!", "ok");

    // Limpar e recarregar
    $("valorOferece").value = "";
    $("valorDeseja").value = "";
    await carregarSaldos();
    await carregarOrdens();

  } catch (e) {
    toast("❌ " + (e.message || "Erro desconhecido"), "err");
    console.error(e);
  } finally {
    isTxBusy = false;
  }
}

// ================= EXECUTAR / CANCELAR ORDEM =================
window.executarOrdem = async function(escrowAddr) {
  if (!signer || isTxBusy) return;
  isTxBusy = true;

  try {
    toast("⏳ Executando…", "info");
    const tx = await signer.sendTransaction({
      to: escrowAddr,
      data: "0x" + S.Escrow.executar,
      gasLimit: 300000
    });
    toastTx("📤 Transação:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Ordem executada!", "ok");
    await carregarSaldos();
    await carregarOrdens();
  } catch (e) {
    toast("❌ " + e.message, "err");
  } finally {
    isTxBusy = false;
  }
};

window.cancelarOrdem = async function(escrowAddr) {
  if (!signer || isTxBusy) return;
  isTxBusy = true;

  try {
    toast("⏳ Cancelando…", "info");
    const tx = await signer.sendTransaction({
      to: escrowAddr,
      data: "0x" + S.Escrow.cancelar,
      gasLimit: 200000
    });
    toastTx("📤 Transação:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Ordem cancelada!", "ok");
    await carregarSaldos();
    await carregarOrdens();
  } catch (e) {
    toast("❌ " + e.message, "err");
  } finally {
    isTxBusy = false;
  }
};

// ================= ENVIAR TOKENS =================
async function enviarToken() {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;

  try {
    const tokenAddr = $("selTokenEnvio").value;
    const destino = $("destinoEnvio").value.trim();
    const valorStr = $("valorEnvio").value.replace(",", ".");
    const token = tokenPorEndereco(tokenAddr);

    if (!token) throw new Error("Selecione um token");
    if (!isAddr(destino)) throw new Error("Endereço inválido");
    if (mesmoAddr(destino, userAddress)) throw new Error("Não pode enviar para você mesmo");

    const valor = ethers.utils.parseUnits(valorStr, token.decimals);

    toast(`⏳ Enviando ${fmt(valor, token.decimals, 4)} ${token.symbol}…`, "info");

    let tx;
    if (token.symbol === "POL") {
      tx = await signer.sendTransaction({ to: destino, value: valor, gasLimit: 21000 });
    } else {
      tx = await signer.sendTransaction({
        to: token.address,
        data: "0x" + S.ERC20.transfer + encAddr(destino) + encUint(valor),
        gasLimit: 100000
      });
    }

    toastTx("📤 Transação:", tx.hash, "ok");
    await tx.wait();
    toast(`✅ ${token.symbol} enviado!`, "ok");

    $("destinoEnvio").value = "";
    $("valorEnvio").value = "";
    await carregarSaldos();

  } catch (e) {
    toast("❌ " + e.message, "err");
  } finally {
    isTxBusy = false;
  }
}

// ================= CONVERSÃO POL ↔ WPOL =================
async function wrapPOL() {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;

  try {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    const valorStr = $("valorWPOL").value.replace(",", ".");
    const valor = ethers.utils.parseUnits(valorStr, 18);

    if (valor > saldos.POL) throw new Error("Saldo insuficiente de POL");

    toast(`⏳ Convertendo ${fmt(valor, 18, 4)} POL → WPOL…`, "info");
    const tx = await signer.sendTransaction({
      to: wpol.address,
      data: "0x" + S.WPOL.deposit,
      value: valor,
      gasLimit: 50000
    });
    toastTx("📤 Transação:", tx.hash, "ok");
    await tx.wait();
    toast("✅ POL convertido em WPOL!", "ok");

    $("valorWPOL").value = "";
    await carregarSaldos();

  } catch (e) {
    toast("❌ " + e.message, "err");
  } finally {
    isTxBusy = false;
  }
}

async function unwrapWPOL() {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;

  try {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    const valorStr = $("valorPOL").value.replace(",", ".");
    const valor = ethers.utils.parseUnits(valorStr, 18);

    const saldoWPOL = saldos[wpol.address] || 0n;
    if (valor > saldoWPOL) throw new Error("Saldo insuficiente de WPOL");

    toast(`⏳ Convertendo ${fmt(valor, 18, 4)} WPOL → POL…`, "info");
    const tx = await signer.sendTransaction({
      to: wpol.address,
      data: "0x" + S.WPOL.withdraw + encUint(valor),
      gasLimit: 50000
    });
    toastTx("📤 Transação:", tx.hash, "ok");
    await tx.wait();
    toast("✅ WPOL convertido em POL!", "ok");

    $("valorPOL").value = "";
    await carregarSaldos();

  } catch (e) {
    toast("❌ " + e.message, "err");
  } finally {
    isTxBusy = false;
  }
}

// ================= BITCOIN (BTC) =================
const BTC_API = "https://mempool.space/api";

// Valida endereços Legacy (1...), P2SH (3...), Bech32 (bc1q...) e Bech32m (bc1p...)
function isBTCAddr(addr) {
  if (!addr) return false;
  return /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{25,62})$/i.test(addr.trim());
}

// Formata satoshis → "X.XXXXXXXX BTC"
function fmtBTC(sats) {
  const btc = Number(sats) / 1e8;
  return btc.toLocaleString("pt-BR", {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8,
  });
}

async function consultarBTC() {
  const input    = $("btcAddressQuery");
  const result   = $("btcBalanceResult");
  const valueEl  = $("btcBalanceValue");
  const detailEl = $("btcBalanceDetails");
  const btn      = $("btnCheckBtc");

  const addr = (input?.value || "").trim();

  if (!addr) {
    toast("❌ Digite um endereço Bitcoin", "warn");
    return;
  }
  if (!isBTCAddr(addr)) {
    toast("❌ Endereço Bitcoin inválido. Use bc1…, 1… ou 3…", "err");
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "⏳ Consultando…"; }
  if (result) result.classList.remove("show");

  try {
    // 1) Saldo — mempool.space
    const res = await fetch(`${BTC_API}/address/${encodeURIComponent(addr)}`);
    if (!res.ok) {
      if (res.status === 400) throw new Error("Endereço não reconhecido pela rede Bitcoin");
      throw new Error(`API retornou ${res.status}`);
    }
    const data = await res.json();

    const chain   = data.chain_stats   || {};
    const mempool = data.mempool_stats || {};

    const confirmado = (chain.funded_txo_sum   || 0) - (chain.spent_txo_sum   || 0);
    const pendente   = (mempool.funded_txo_sum || 0) - (mempool.spent_txo_sum || 0);
    const txs        = (chain.tx_count || 0) + (mempool.tx_count || 0);

    // 2) Preço em USD (opcional, não bloqueia)
    let precoUSD = null;
    try {
      const pr = await fetch(`${BTC_API}/v1/prices`);
      if (pr.ok) {
        const prices = await pr.json();
        precoUSD = prices.USD || null;
      }
    } catch { /* ignora falha de preço */ }

    // 3) Renderizar resultado
    if (result)  result.classList.add("show");
    if (valueEl) valueEl.textContent = `${fmtBTC(confirmado)} BTC`;

    const partes = [];
    if (precoUSD) {
      const usd = (confirmado / 1e8) * precoUSD;
      partes.push(`≈ ${usd.toLocaleString("pt-BR", { style: "currency", currency: "USD" })}`);
    }
    partes.push(`Transações: ${txs}`);
    if (pendente > 0) partes.push(`⏳ Recebendo: ${fmtBTC(pendente)} BTC`);
    else if (pendente < 0) partes.push(`⏳ Enviando: ${fmtBTC(-pendente)} BTC`);

    if (detailEl) detailEl.textContent = partes.join("  •  ");

    toast(`✅ Saldo: ${fmtBTC(confirmado)} BTC`, "ok");

  } catch (e) {
    console.error("Erro BTC:", e);
    if (result) result.classList.remove("show");
    toast("❌ " + (e.message || "Erro ao consultar BTC"), "err", 8000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "₿ Consultar Saldo"; }
  }
}

// ================= COPIAR ENDEREÇOS =================
async function copiarTexto(texto) {
  try {
    // Método moderno (requer HTTPS ou localhost)
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
    // Fallback para navegadores antigos / HTTP
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, texto.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    console.error("Erro ao copiar:", e);
    return false;
  }
}

async function copiarEnderecoBRN(btn) {
  const brn = TOKENS.find(t => t.symbol === "BRN");
  if (!brn) { toast("❌ Token BRN não encontrado", "err"); return; }

  const ok = await copiarTexto(brn.address);
  if (ok) {
    toast("📋 Endereço do contrato BRN copiado! Envie para o cliente importar.", "ok", 6000);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "✅ Copiado!";
      btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    }
  } else {
    toast("❌ Não foi possível copiar. Copie manualmente: " + brn.address, "err", 10000);
  }
}

async function copiarMeuEndereco(btn) {
  if (!userAddress) {
    toast("⚠️ Conecte a carteira primeiro", "warn");
    return;
  }
  const ok = await copiarTexto(userAddress);
  if (ok) {
    toast("📋 Seu endereço copiado! Envie para o cliente fazer o pagamento.", "ok", 6000);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "✅";
      btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    }
  } else {
    toast("❌ Não foi possível copiar.", "err");
  }
}

// Injeta os botões na UI sem alterar o HTML
function injetarBotoesCopiar() {
  // ========== 1) Botão "Copiar contrato BRN" — no card de saldos ==========
  const balancesCard = $("balances")?.closest(".card");
  if (balancesCard && !$("btnCopyBRN")) {
    const h2 = balancesCard.querySelector("h2");
    if (h2 && !h2.dataset.wrapped) {
      // Envolver o h2 + botão em um flex para alinhar lado a lado
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "8px";
      wrap.style.marginBottom = "16px";
      wrap.style.flexWrap = "wrap";

      h2.parentNode.insertBefore(wrap, h2);
      h2.style.margin = "0";
      h2.dataset.wrapped = "1";
      wrap.appendChild(h2);

      const btn = document.createElement("button");
      btn.id = "btnCopyBRN";
      btn.className = "btn btn-sm";
      btn.style.fontSize = "0.75rem";
      btn.textContent = "📋 Copiar contrato BRN";
      btn.title = "Copiar endereço do contrato BRN para o cliente importar na carteira";
      btn.addEventListener("click", () => copiarEnderecoBRN(btn));
      wrap.appendChild(btn);
    }
  }

  // ========== 2) Botão "Copiar meu endereço" — na barra da carteira ==========
  const walletInfo = $("walletInfo");
  const addrEl = $("addr");
  if (walletInfo && addrEl && !$("btnCopyMyAddr")) {
    const btn = document.createElement("button");
    btn.id = "btnCopyMyAddr";
    btn.className = "btn btn-sm";
    btn.textContent = "📋";
    btn.title = "Copiar meu endereço (para o cliente enviar tokens)";
    btn.style.padding = "2px 8px";
    btn.style.fontSize = "0.85rem";
    btn.addEventListener("click", () => copiarMeuEndereco(btn));
    addrEl.parentNode.insertBefore(btn, addrEl.nextSibling);
  }

  // ========== 3) Botão "Copiar meu endereço" — no painel Enviar ==========
  const enviarPanel = $("panel-enviar");
  if (enviarPanel && !$("btnCopyMyAddrEnviar")) {
    const card = enviarPanel.querySelector(".card");
    if (card) {
      const h2 = card.querySelector("h2");
      if (h2 && !h2.dataset.wrapped) {
        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.alignItems = "center";
        wrap.style.justifyContent = "space-between";
        wrap.style.gap = "8px";
        wrap.style.marginBottom = "16px";

        h2.parentNode.insertBefore(wrap, h2);
        h2.style.margin = "0";
        h2.dataset.wrapped = "1";
        wrap.appendChild(h2);

        const btn = document.createElement("button");
        btn.id = "btnCopyMyAddrEnviar";
        btn.className = "btn btn-sm";
        btn.style.fontSize = "0.75rem";
        btn.textContent = "📋 Copiar meu endereço";
        btn.title = "Copiar seu endereço para compartilhar com clientes";
        btn.addEventListener("click", () => copiarMeuEndereco(btn));
        wrap.appendChild(btn);
      }
    }
  }
}

// ================= NAVEGAÇÃO DE ABAS =================
function configurarAbas() {
  document.querySelectorAll(".tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      const aba = btn.dataset.tab;

      // Atualizar botões
      document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Mostrar painel correto
      document.querySelectorAll(".panel").forEach(p => p.hidden = true);
      $(`panel-${aba}`).hidden = false;

      // Atualizar hints de saldo
      setTimeout(renderizarSaldos, 50);

      // Garantir botões de copiar em painéis recém-exibidos
      setTimeout(injetarBotoesCopiar, 60);
    });
  });
}

// ================= FILTROS =================
function configurarFiltros() {
  $("filtroStatus").addEventListener("change", e => {
    filtroAtivo.status = e.target.value;
    aplicarFiltros();
  });
  $("filtroOferece").addEventListener("change", e => {
    filtroAtivo.oferece = e.target.value;
    aplicarFiltros();
  });
  $("filtroPede").addEventListener("change", e => {
    filtroAtivo.pede = e.target.value;
    aplicarFiltros();
  });
  $("filtroMinhas").addEventListener("change", e => {
    filtroAtivo.minhas = e.target.checked;
    aplicarFiltros();
  });
  $("btnLimparFiltros").addEventListener("click", () => {
    filtroAtivo = { status: "ativas", oferece: "", pede: "", minhas: false };
    $("filtroStatus").value = "ativas";
    $("filtroOferece").value = "";
    $("filtroPede").value = "";
    $("filtroMinhas").checked = false;
    aplicarFiltros();
  });
}

// ================= INICIALIZAÇÃO =================
async function init() {
  console.log("🚀 BRN Exchange — Iniciando…");

  // Verificar ethers
  if (typeof ethers === "undefined") {
    console.error("❌ Ethers.js não carregado! Verifique a ordem dos scripts no HTML.");
    alert("ERRO: Ethers.js não foi carregado. Verifique a ordem dos scripts.");
    return;
  }
  console.log("✅ Ethers.js carregado");

  // Conectar RPC
  await atualizarStatusRede();

  // Preencher seletores
  preencherSeletores();

  // Injetar botões de copiar
  injetarBotoesCopiar();

  // Configurar abas
  configurarAbas();

  // Configurar filtros
  configurarFiltros();

  // Botões principais
  $("btnConnect").addEventListener("click", conectarCarteira);
  $("btnDisconnect").addEventListener("click", desconectarCarteira);
  $("btnRefresh").addEventListener("click", carregarOrdens);
  $("btnCriarOrdem").addEventListener("click", criarOrdem);
  $("btnEnviar").addEventListener("click", enviarToken);
  $("btnConverterWPOL").addEventListener("click", wrapPOL);
  $("btnConverterPOL").addEventListener("click", unwrapWPOL);

  // ===== Bitcoin =====
  $("btnCheckBtc")?.addEventListener("click", consultarBTC);
  $("btcAddressQuery")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); consultarBTC(); }
  });

  // Botões MAX
  $("btnMaxOf")?.addEventListener("click", () => {
    const sel = $("selOferece");
    const tok = tokenPorEndereco(sel.value);
    if (tok) {
      const val = tok.symbol === "POL" ? saldos.POL : (saldos[tok.address] || 0n);
      $("valorOferece").value = ethers.utils.formatUnits(val.toString(), tok.decimals).replace(/\.?0+$/, "");
    }
  });
  $("btnMaxSend")?.addEventListener("click", () => {
    const sel = $("selTokenEnvio");
    const tok = tokenPorEndereco(sel.value);
    if (tok) {
      const val = tok.symbol === "POL" ? saldos.POL : (saldos[tok.address] || 0n);
      $("valorEnvio").value = ethers.utils.formatUnits(val.toString(), tok.decimals).replace(/\.?0+$/, "");
    }
  });
  $("btnMaxWrap")?.addEventListener("click", () => {
    $("valorWPOL").value = ethers.utils.formatUnits(saldos.POL.toString(), 18).replace(/\.?0+$/, "");
  });
  $("btnMaxUnwrap")?.addEventListener("click", () => {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    $("valorPOL").value = ethers.utils.formatUnits((saldos[wpol.address] || 0n).toString(), 18).replace(/\.?0+$/, "");
  });

  // Atualizar hints ao mudar seleção
  ["selOferece", "selTokenEnvio"].forEach(id => {
    $(id)?.addEventListener("change", renderizarSaldos);
  });

  // Carregar ordens automaticamente
  if (rpcProvider) {
    await carregarOrdens();
  }

  console.log("✅ Inicialização concluída!");
}

// Iniciar quando a página carregar
window.addEventListener("load", init);

// Detectar troca de conta na MetaMask
if (window.ethereum) {
  window.ethereum.on("accountsChanged", contas => {
    if (contas.length === 0) desconectarCarteira();
    else window.location.reload();
  });
  window.ethereum.on("chainChanged", () => window.location.reload());
}
