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

// RPCs confiáveis e atualizados da rede Polygon
const RPC_LIST = [
  "https://drpc.org",
  "https://polygon-rpc.com",
  "https://publicnode.com",
  "https://onfinality.io",
  "https://1rpc.io"
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
let btcApiSincronizada = false;

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

// ================= TOKENS / AUXILIARES =================
function tokenPorEndereco(endereco) {
  return TOKENS.find(t => mesmoAddr(t.address, endereco));
}

function preencherSeletores() {
  const opts = TOKENS.map(t => `<option value="${t.address}">${t.symbol} — ${t.name}</option>`).join("");
  ["selOferece", "selDeseja", "selTokenEnvio", "filtroOferece", "filtroPede"].forEach(id => {
    const el = \$(id);
    if (el) el.innerHTML = id.startsWith("filtro") ? `<option value="">Todos</option>` + opts : opts;
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
    const contas = await provider.send("eth_requestAccounts", []);
    if (!contas.length) throw new Error("Nenhuma conta encontrada");
    
    userAddress = ethers.utils.getAddress(contas[0]);
    signer = provider.getSigner();
    
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
    
    $("btnConnect").style.display = "none";
    $("walletInfo").style.display = "flex";
    $("addr").textContent = short(userAddress);
    
    toast("✅ Carteira conectada!", "ok");
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
    
    const ordens = [];
    for (let i = 0; i < total; i++) {
      try {
        const enderecoRes = await rpcProvider.call({
          to: ESCROW_FACTORY,
          data: "0x" + S.Factory.ordem + encUint(i)
        });
        const endereco = decAddr(enderecoRes.slice(2));
        
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
  
  if (filtroAtivo.status === "ativas") filtrado = filtrado.filter(o => !o.executado && !o.cancelado);
  if (filtroAtivo.status === "executaveis") filtrado = filtrado.filter(o => !o.executado && !o.cancelado && userAddress && !mesmoAddr(o.criador, userAddress));
  if (filtroAtivo.status === "executadas") filtrado = filtrado.filter(o => o.executado);
  if (filtroAtivo.status === "canceladas") filtrado = filtrado.filter(o => o.cancelado);
  
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
    
    const ofVal = ethers.utils.parseUnits($("valorOferece").value.replace(",", "."), ofToken.decimals);
    const deVal = ethers.utils.parseUnits($("valorDeseja").value.replace(",", "."), deToken.decimals);
    
    const saldo = ofToken.symbol === "POL" 
      ? saldos.POL 
      : decUint((await rpcProvider.call({ to: ofAddr, data: "0x" + S.ERC20.balanceOf + encAddr(userAddress) })).slice(2));
    
    if (saldo < ofVal) throw new Error(`Saldo insuficiente de ${ofToken.symbol}`);
    
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
