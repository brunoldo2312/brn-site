// ============================================================
// APP.JS — BRN Exchange | Versão 3.8
// ✅ Ordem dos parâmetros de criarOrdem corrigida
// ✅ Decodificação consistente com o contrato
// ✅ Inicialização completa (abas, filtros, botões, MAX)
// ✅ Sincronização Polygon + Bitcoin com auto-refresh
// ============================================================

const ESCROW_FACTORY = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;
const REFRESH_MS = 30000; // 30s

const TOKENS = [
  { symbol: "BRN",     name: "BRN Token",            address: "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210", decimals: 18 },
  { symbol: "USDC",    name: "USD Coin (nativo)",    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
  { symbol: "USDC.e",  name: "USD Coin (bridged)",   address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6 },
  { symbol: "USDT",    name: "Tether USD",           address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8a", decimals: 6 },
  { symbol: "USDT.e",  name: "Tether USD (bridged)", address: "0x9417669fBF23357D2774e9D4234219952D36A1e5", decimals: 6 },
  { symbol: "WPOL",    name: "Wrapped POL",          address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
  { symbol: "WBTC",    name: "Wrapped BTC",          address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
  { symbol: "WETH",    name: "Wrapped Ether",        address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
];

const RPC_LIST = [
  "https://polygon.publicnode.com",
  "https://polygon-rpc.com",
  "https://1rpc.io/matic",
  "https://polygon.drpc.org"
];

const S = {
  Factory: { criarOrdem: "ceff4da6", totalOrdens: "8275d6fa", ordem: "72c453b8" },
  Escrow:  { obterDados: "32c9e06c", executar: "b2d44d08", cancelar: "8ffb1ccf" },
  ERC20:   { balanceOf: "70a08231", allowance: "dd62ed3e", approve: "095ea7b3", transfer: "a9059cbb" },
  WPOL:    { deposit: "d0e30db0", withdraw: "2e1a7d4d" }
};

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
let refreshTimer = null;

// ================= UTILITÁRIOS =================
const $ = id => document.getElementById(id);
const isAddr = a => /^0x[a-fA-F0-9]{40}$/.test(a || "");
const short = a => isAddr(a) ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
const mesmoAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function fmt(bigInt, decimals, maxFrac = 6) {
  try {
    const str = ethers.utils.formatUnits(bigInt.toString(), decimals);
    const [inteiro, fracao = ""] = str.split(".");
    const limpo = fracao.slice(0, maxFrac).replace(/0+$/, "");
    return limpo ? `${inteiro},${limpo}` : inteiro;
  } catch { return "0"; }
}

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

async function fetchTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// ================= CODIFICAÇÃO ABI =================
function encAddr(addr) {
  if (!isAddr(addr)) throw new Error("Endereço inválido: " + addr);
  return addr.toLowerCase().slice(2).padStart(64, "0");
}
function encUint(valor) { return BigInt(valor).toString(16).padStart(64, "0"); }
function decUint(palavra) {
  if (!palavra) return 0n;
  try { return BigInt("0x" + palavra); } catch { return 0n; }
}
function decBool(palavra) {
  try { return decUint(palavra) === 1n; } catch { return false; }
}
function splitResposta(hex) {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  const p = [];
  for (let i = 0; i < s.length; i += 64) p.push(s.slice(i, i + 64));
  return p;
}

// ================= DECODIFICAÇÃO =================
function extrairEnderecoGenerico(word) {
  if (!word || word.length < 64) return "0x0000000000000000000000000000000000000000";
  try { return ethers.utils.getAddress("0x" + word.slice(24, 64)); } catch {}
  try { return ethers.utils.getAddress("0x" + word.slice(-40)); } catch {}
  return "0x0000000000000000000000000000000000000000";
}

// Fallback robusto — usado só se o genérico devolver zero
function extrairEnderecoToken(word) {
  const known = new Set(TOKENS.map(t => t.address.toLowerCase()));
  for (let off = 0; off <= word.length - 40; off++) {
    try {
      const addr = ethers.utils.getAddress("0x" + word.slice(off, off + 40));
      if (known.has(addr.toLowerCase())) return addr;
    } catch {}
  }
  return extrairEnderecoGenerico(word);
}

function extrairEnderecoTokenSeguro(word) {
  const gen = extrairEnderecoGenerico(word);
  if (gen && gen !== "0x0000000000000000000000000000000000000000") return gen;
  return extrairEnderecoToken(word);
}

// ✅ Ordem oficial do contrato:
// (criador, tokenOferecido, tokenDesejado, valorOferecido, valorDesejado, executado, cancelado)
function decodificarOrdem(hex) {
  const p = splitResposta(hex);
  if (p.length < 7) throw new Error("Resposta curta: " + p.length + " words");

  return {
    criador:        extrairEnderecoGenerico(p[0]),
    tokenOferecido: extrairEnderecoTokenSeguro(p[1]),
    tokenDesejado:  extrairEnderecoTokenSeguro(p[2]),
    valorOferecido: decUint(p[3]),
    valorDesejado:  decUint(p[4]),
    executado:      p[5] ? decBool(p[5]) : false,
    cancelado:      p[6] ? decBool(p[6]) : false,
  };
}

// ================= TOKENS =================
function tokenPorEndereco(endereco) {
  if (!endereco) return null;
  const t = TOKENS.find(t => mesmoAddr(t.address, endereco));
  if (t) return t;
  return {
    symbol: endereco.slice(0, 6) + "…",
    name: "Token não cadastrado",
    address: endereco,
    decimals: 18,
    desconhecido: true
  };
}

function nomeComRede(tok) {
  if (!tok) return "???";
  const rede = tok.desconhecido ? "" : " (Polygon)";
  return `${tok.symbol}${rede}`;
}

// ================= REDE POLYGON =================
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
    if (p) { rpcProvider = p; console.log(`✅ RPC Polygon conectado: ${url}`); return true; }
  }
  return false;
}

async function atualizarStatusRede() {
  const dot = $("netDot"), txt = $("netText");
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
    toast("❌ Não foi possível conectar à rede Polygon.", "err", 10000);
  }
  return ok;
}

// ================= BITCOIN API =================
async function verificarStatusRedeBitcoin() {
  const dot = $("btcDot"), txt = $("btcText");
  if (!dot || !txt) return;
  dot.className = "dot btc-status load";
  txt.textContent = "Bitcoin API: Sincronizando…";
  try {
    const resposta = await fetchTimeout("https://blockstream.info/api/blocks/tip/height", 8000);
    if (!resposta.ok) throw new Error("HTTP " + resposta.status);
    const blocoAtual = (await resposta.text()).trim();
    if (!/^\d+$/.test(blocoAtual)) throw new Error("Resposta inválida");
    btcApiSincronizada = true;
    dot.className = "dot btc-status";
    txt.textContent = `Bitcoin API: Online (Bloco ${blocoAtual}) 🟠`;
  } catch (e) {
    btcApiSincronizada = false;
    dot.className = "dot btc-status off";
    txt.textContent = "Bitcoin API: Fora do Ar ❌";
  }
}

async function consultarSaldoBTC() {
  const input = $("btcAddressInput"), card = $("btcResult"), valEl = $("btcBalanceValue");
  if (!input || !valEl) return;
  const endereco = input.value.trim();
  if (!endereco) { toast("Digite um endereço Bitcoin.", "warn"); return; }
  valEl.textContent = "Consultando…";
  card?.classList.add("show");
  try {
    const r = await fetchTimeout(`https://blockstream.info/api/address/${encodeURIComponent(endereco)}`, 10000);
    if (!r.ok) throw new Error("Endereço inválido ou não encontrado");
    const dados = await r.json();
    const chain = dados.chain_stats || {};
    const mem = dados.mempool_stats || {};
    const satsConf = (chain.funded_txo_sum || 0) - (chain.spent_txo_sum || 0);
    const satsPend = (mem.funded_txo_sum || 0) - (mem.spent_txo_sum || 0);
    const totalSats = satsConf + satsPend;
    valEl.textContent = `${(totalSats / 1e8).toFixed(8)} BTC`;
    if (satsPend !== 0) valEl.textContent += ` (${(satsPend / 1e8).toFixed(8)} pendente)`;
  } catch (e) {
    valEl.textContent = "— BTC";
    toast("❌ " + e.message, "err");
  }
}

// ================= PREENCHER SELECTS =================
function preencherSeletores() {
  const opts = TOKENS.map(t => `<option value="${t.address}">${t.symbol} — ${t.name}</option>`).join("");
  ["selOferece", "selDeseja", "selTokenEnvio"].forEach(id => {
    const el = $(id); if (el) el.innerHTML = opts;
  });
  const filtroOpts = TOKENS.map(t => `<option value="${t.address}">${t.symbol}</option>`).join("");
  const fo = $("filtroOferece"); if (fo) fo.innerHTML = '<option value="">Oferece: Todos</option>' + filtroOpts;
  const fp = $("filtroPede");   if (fp) fp.innerHTML = '<option value="">Pede: Todos</option>' + filtroOpts;
}

// ================= SALDOS =================
async function carregarSaldos() {
  if (!rpcProvider || !userAddress) return;
  try {
    saldos.POL = BigInt((await rpcProvider.getBalance(userAddress)).toString());
    for (const t of TOKENS) {
      try {
        const res = await rpcProvider.call({ to: t.address, data: "0x" + S.ERC20.balanceOf + encAddr(userAddress) });
        saldos[t.address] = decUint(res.slice(2));
      } catch { saldos[t.address] = 0n; }
    }
    renderizarSaldos();
  } catch (e) { console.error("Erro ao carregar saldos:", e); }
}

function renderizarSaldos() {
  const container = $("balances");
  if (!container) return;
  container.innerHTML = "";
  const add = (simbolo, valor, decimais) => {
    const div = document.createElement("div");
    div.className = "bal";
    div.innerHTML = `<span class="t">${simbolo}</span><span class="v">${fmt(valor, decimais)}</span>`;
    container.appendChild(div);
  };
  add("POL (Polygon)", saldos.POL, 18);
  TOKENS.forEach(t => add(`${t.symbol} (Polygon)`, saldos[t.address] || 0n, t.decimals));

  document.querySelectorAll("[data-hint]").forEach(el => {
    const attr = el.getAttribute("data-hint") || "";
    const [tipo, ref] = attr.split(":");
    if (tipo === "saldoPOL") el.textContent = fmt(saldos.POL, 18);
    if (tipo === "saldoWPOL") {
      const wpol = TOKENS.find(t => t.symbol === "WPOL");
      el.textContent = wpol ? fmt(saldos[wpol.address] || 0n, 18) : "0";
    }
    if (tipo === "saldo" && ref) {
      const sel = $(ref);
      if (sel && sel.value) {
        const tok = tokenPorEndereco(sel.value);
        if (tok) {
          const val = saldos[tok.address] || 0n;
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

    let rede = await provider.getNetwork();
    if (rede.chainId !== POLYGON_CHAIN_ID) {
      toast("⚠️ Mudando para Polygon Mainnet…", "warn");
      try {
        await provider.send("wallet_switchEthereumChain", [{ chainId: "0x89" }]);
        await new Promise(r => setTimeout(r, 500));
        rede = await provider.getNetwork();
        if (rede.chainId !== POLYGON_CHAIN_ID) {
          toast("❌ Selecione manualmente a rede Polygon na MetaMask", "err", 8000);
          return;
        }
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
  saldos = { POL: 0n };
  if ($("btnConnect")) $("btnConnect").style.display = "block";
  if ($("walletInfo")) $("walletInfo").style.display = "none";
  fecharPainelCompartilhar();
  renderizarSaldos();
  aplicarFiltros();
  toast("Desconectado", "info");
}

// ================= COMPARTILHAR ENDEREÇO =================
function abrirPainelCompartilhar() {
  if (!userAddress) { toast("Conecte a carteira primeiro.", "warn"); return; }
  const painel = $("sharePanel");
  const addrFull = $("shareAddrFull");
  if (!painel || !addrFull) return;

  addrFull.textContent = userAddress;
  const texto = `Meu endereço BRN na Polygon: ${userAddress}`;
  const textoEnc = encodeURIComponent(texto);

  const wa = $("btnShareWhatsApp");
  if (wa) wa.href = `https://wa.me/?text=${textoEnc}`;
  const tg = $("btnShareTelegram");
  if (tg) tg.href = `https://t.me/share/url?url=${encodeURIComponent(userAddress)}&text=${encodeURIComponent("Meu endereço BRN:")}`;
  const ps = $("btnSharePolygonScan");
  if (ps) ps.href = `https://polygonscan.com/address/${userAddress}`;

  const nat = $("btnShareNative");
  if (nat) {
    if (navigator.share) {
      const novo = nat.cloneNode(true);
      nat.parentNode.replaceChild(novo, nat);
      novo.addEventListener("click", async (e) => {
        e.preventDefault();
        try { await navigator.share({ title: "Meu Endereço BRN", text: texto }); }
        catch (err) { if (err.name !== "AbortError") console.warn("Erro ao compartilhar:", err.message); }
      });
      novo.style.display = "";
    } else {
      nat.style.display = "none";
    }
  }
  painel.style.display = "block";
  painel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function fecharPainelCompartilhar() {
  const painel = $("sharePanel");
  if (painel) painel.style.display = "none";
}

async function copiarEndereco() {
  if (!userAddress) return;
  try {
    await navigator.clipboard.writeText(userAddress);
    toast("✅ Endereço copiado!", "ok");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = userAddress;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("✅ Endereço copiado!", "ok"); }
    catch { toast("❌ Não foi possível copiar.", "err"); }
    ta.remove();
  }
}

// ================= MURAL DE ORDENS =================
async function carregarOrdens() {
  if (loading || !rpcProvider) return;
  loading = true;
  const container = $("orders");
  const counter = $("counter");

  try {
    if (counter) counter.textContent = "⏳ Consultando…";
    if (container) container.innerHTML = '<div class="state"><div class="spinner"></div><p>Carregando ordens…</p></div>';

    const totalRes = await rpcProvider.call({ to: ESCROW_FACTORY, data: "0x" + S.Factory.totalOrdens });
    const total = Number(decUint(totalRes.slice(2)));
    if (counter) counter.textContent = `${total} ordem${total !== 1 ? "ens" : ""}`;

    if (total === 0) {
      container.innerHTML = '<div class="empty"><div class="big">📋</div><p>Nenhuma ordem encontrada.</p></div>';
      ordersCache = [];
      return;
    }

    const indices = Array.from({ length: total }, (_, i) => i);
    const ordens = [];

    await Promise.all(indices.map(async i => {
      try {
        const enderecoRes = await rpcProvider.call({
          to: ESCROW_FACTORY,
          data: "0x" + S.Factory.ordem + encUint(i)
        });
        const endereco = ethers.utils.getAddress("0x" + enderecoRes.slice(-40));

        const dadosRes = await rpcProvider.call({
          to: endereco,
          data: "0x" + S.Escrow.obterDados
        });

        const decoded = decodificarOrdem(dadosRes);

        ordens.push({
          indice: i,
          endereco,
          criador: decoded.criador,
          tokenOferecido: decoded.tokenOferecido,
          valorOferecido: decoded.valorOferecido,
          tokenDesejado: decoded.tokenDesejado,
          valorDesejado: decoded.valorDesejado,
          executado: decoded.executado,
          cancelado: decoded.cancelado,
        });
      } catch (e) {
        console.warn(`Erro ao carregar ordem ${i}:`, e.message);
      }
    }));

    ordersCache = ordens;
    aplicarFiltros();
    const info = $("muralInfo");
    if (info) info.textContent = `Exibindo ${ordens.length} de ${total} ordens`;
  } catch (e) {
    if (container) container.innerHTML = `<div class="empty">❌ Erro: ${e.message}</div>`;
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
  if (!container) return;
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

    const oferNome = nomeComRede(ofer);
    const pedNome = nomeComRede(ped);
    const oferQtd = ofer ? fmt(o.valorOferecido, ofer.decimals) : "—";
    const pedQtd = ped ? fmt(o.valorDesejado, ped.decimals) : "—";

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
          <div class="swap-amt">${oferQtd} ${oferNome}</div>
        </div>
        <div class="swap-icon">⇄</div>
        <div class="swap-side">
          <div class="swap-lbl">Pede</div>
          <div class="swap-amt">${pedQtd} ${pedNome}</div>
        </div>
      </div>
      <div class="swap-escrow ok">Criador: ${short(o.criador)} ${minha ? "(você)" : ""}</div>
      <div class="order-foot">
        <span class="order-meta">${minha ? "Sua ordem" : "Ordem externa"}</span>
        <div class="order-actions">
          ${ativa && !minha ? `<button class="btn btn-sm btn-primary" data-action="executar" data-escrow="${o.endereco}">Executar</button>` : ""}
          ${ativa && minha ? `<button class="btn btn-sm" data-action="cancelar" data-escrow="${o.endereco}">Cancelar</button>` : ""}
        </div>
      </div>
    `;
    container.appendChild(div);
  }

  container.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const escrow = btn.getAttribute("data-escrow");
      const action = btn.getAttribute("data-action");
      if (action === "executar") executarOrdem(escrow);
      if (action === "cancelar") cancelarOrdem(escrow);
    });
  });
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

    const ofStr = $("valorOferece").value.trim().replace(",", ".");
    const deStr = $("valorDeseja").value.trim().replace(",", ".");
    if (!ofStr || isNaN(Number(ofStr)) || Number(ofStr) <= 0) throw new Error("Valor oferecido inválido");
    if (!deStr || isNaN(Number(deStr)) || Number(deStr) <= 0) throw new Error("Valor desejado inválido");

    const ofVal = ethers.utils.parseUnits(ofStr, ofToken.decimals);
    const deVal = ethers.utils.parseUnits(deStr, deToken.decimals);

    const saldo = decUint((await rpcProvider.call({
      to: ofAddr, data: "0x" + S.ERC20.balanceOf + encAddr(userAddress)
    })).slice(2));
    if (saldo < ofVal) throw new Error(`Saldo insuficiente de ${ofToken.symbol}`);

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

    toast("⏳ Criando ordem…", "info");
    // ✅ ORDEM CORRETA: (tokenOferecido, tokenDesejado, valorOferecido, valorDesejado)
    const data = "0x" + S.Factory.criarOrdem
      + encAddr(ofAddr)
      + encAddr(deAddr)
      + encUint(ofVal)
      + encUint(deVal);

    const tx = await signer.sendTransaction({
      to: ESCROW_FACTORY,
      data,
      gasLimit: 900000
    });
    toastTx("📤 Ordem criada:", tx.hash, "ok");
    await tx.wait();
    toast("✅ Ordem criada com sucesso!", "ok");

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

// ================= EXECUTAR / CANCELAR =================
async function executarOrdem(escrowAddr) {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;
  try {
    const dadosRes = await rpcProvider.call({ to: escrowAddr, data: "0x" + S.Escrow.obterDados });
    const decoded = decodificarOrdem(dadosRes);
    const tokenDesejado = decoded.tokenDesejado;
    const valorDesejado = decoded.valorDesejado;

    const allowance = decUint((await rpcProvider.call({
      to: tokenDesejado,
      data: "0x" + S.ERC20.allowance + encAddr(userAddress) + encAddr(escrowAddr)
    })).slice(2));

    if (allowance < valorDesejado) {
      const tok = tokenPorEndereco(tokenDesejado);
      toast(`⏳ Aprovando ${tok?.symbol || "token"}…`, "info");
      const txA = await signer.sendTransaction({
        to: tokenDesejado,
        data: "0x" + S.ERC20.approve + encAddr(escrowAddr) + encUint(valorDesejado),
        gasLimit: 100000
      });
      toastTx("📤 Aprovação:", txA.hash);
      await txA.wait();
      toast("✅ Aprovado!", "ok");
    }

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
    toast("❌ " + (e.message || "Erro"), "err");
    console.error(e);
  } finally {
    isTxBusy = false;
  }
}

async function cancelarOrdem(escrowAddr) {
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
}

// ================= ENVIAR TOKENS =================
async function enviarToken() {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;
  try {
    const tokenAddr = $("selTokenEnvio").value;
    const destino = $("destinoEnvio").value.trim();
    const valorStr = $("valorEnvio").value.trim().replace(",", ".");
    const token = tokenPorEndereco(tokenAddr);

    if (!token) throw new Error("Selecione um token");
    if (!isAddr(destino)) throw new Error("Endereço inválido");
    if (mesmoAddr(destino, userAddress)) throw new Error("Não pode enviar para você mesmo");
    if (!valorStr || isNaN(Number(valorStr)) || Number(valorStr) <= 0) throw new Error("Valor inválido");

    const valor = ethers.utils.parseUnits(valorStr, token.decimals);
    toast(`⏳ Enviando ${fmt(valor, token.decimals, 4)} ${token.symbol}…`, "info");

    const tx = await signer.sendTransaction({
      to: token.address,
      data: "0x" + S.ERC20.transfer + encAddr(destino) + encUint(valor),
      gasLimit: 100000
    });
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

// ================= POL ↔ WPOL =================
async function wrapPOL() {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;
  try {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    const valorStr = $("valorWPOL").value.trim().replace(",", ".");
    if (!valorStr || isNaN(Number(valorStr)) || Number(valorStr) <= 0) throw new Error("Valor inválido");
    const valor = ethers.utils.parseUnits(valorStr, 18);

    if (valor > saldos.POL) throw new Error("Saldo insuficiente de POL");

    toast(`⏳ Convertendo ${fmt(valor, 18, 4)} POL → WPOL…`, "info");
    const tx = await signer.sendTransaction({
      to: wpol.address,
      data: "0x" + S.WPOL.deposit,
      value: valor,
      gasLimit: 80000
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
    const valorStr = $("valorPOL").value.trim().replace(",", ".");
    if (!valorStr || isNaN(Number(valorStr)) || Number(valorStr) <= 0) throw new Error("Valor inválido");
    const valor = ethers.utils.parseUnits(valorStr, 18);

    const saldoWPOL = saldos[wpol.address] || 0n;
    if (valor > saldoWPOL) throw new Error("Saldo insuficiente de WPOL");

    toast(`⏳ Convertendo ${fmt(valor, 18, 4)} WPOL → POL…`, "info");
    const tx = await signer.sendTransaction({
      to: wpol.address,
      data: "0x" + S.WPOL.withdraw + encUint(valor),
      gasLimit: 80000
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

// ================= ABAS =================
function configurarAbas() {
  document.querySelectorAll(".tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      const aba = btn.dataset.tab;
      document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".panel").forEach(p => p.hidden = true);
      const alvo = $(`panel-${aba}`);
      if (alvo) alvo.hidden = false;
      setTimeout(renderizarSaldos, 50);
    });
  });
}

// ================= FILTROS =================
function configurarFiltros() {
  const fs = $("filtroStatus");
  if (fs) fs.addEventListener("change", e => { filtroAtivo.status = e.target.value; aplicarFiltros(); });

  const fo = $("filtroOferece");
  if (fo) fo.addEventListener("change", e => { filtroAtivo.oferece = e.target.value; aplicarFiltros(); });

  const fp = $("filtroPede");
  if (fp) fp.addEventListener("change", e => { filtroAtivo.pede = e.target.value; aplicarFiltros(); });

  const fm = $("filtroMinhas");
  if (fm) fm.addEventListener("change", e => { filtroAtivo.minhas = e.target.checked; aplicarFiltros(); });

  const bl = $("btnLimparFiltros");
  if (bl) bl.addEventListener("click", () => {
    filtroAtivo = { status: "ativas", oferece: "", pede: "", minhas: false };
    if (fs) fs.value = "ativas";
    if (fo) fo.value = "";
    if (fp) fp.value = "";
    if (fm) fm.checked = false;
    aplicarFiltros();
  });
}

// ================= BOTÕES MAX =================
function configurarMax() {
  const m1 = $("btnMaxOf");
  if (m1) m1.addEventListener("click", () => {
    const sel = $("selOferece");
    if (!sel || !sel.value) return;
    const tok = tokenPorEndereco(sel.value);
    const saldo = saldos[tok.address] || 0n;
    if (saldo > 0n) $("valorOferece").value = ethers.utils.formatUnits(saldo, tok.decimals);
  });

  const m2 = $("btnMaxSend");
  if (m2) m2.addEventListener("click", () => {
    const sel = $("selTokenEnvio");
    if (!sel || !sel.value) return;
    const tok = tokenPorEndereco(sel.value);
    const saldo = saldos[tok.address] || 0n;
    if (saldo > 0n) $("valorEnvio").value = ethers.utils.formatUnits(saldo, tok.decimals);
  });

  const m3 = $("btnMaxWrap");
  if (m3) m3.addEventListener("click", () => {
    // reserva 0.01 POL para gas
    const reserva = ethers.utils.parseUnits("0.01", 18);
    const disponivel = saldos.POL > reserva ? saldos.POL - reserva : 0n;
    if (disponivel > 0n) $("valorWPOL").value = ethers.utils.formatUnits(disponivel, 18);
  });

  const m4 = $("btnMaxUnwrap");
  if (m4) m4.addEventListener("click", () => {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    const saldo = saldos[wpol.address] || 0n;
    if (saldo > 0n) $("valorPOL").value = ethers.utils.formatUnits(saldo, 18);
  });
}

// ================= LISTENERS GERAIS =================
function configurarBotoes() {
  const c = $("btnConnect");         if (c) c.addEventListener("click", conectarCarteira);
  const d = $("btnDisconnect");      if (d) d.addEventListener("click", desconectarCarteira);
  const sa = $("btnShareAddr");      if (sa) sa.addEventListener("click", abrirPainelCompartilhar);
  const cs = $("btnCloseShare");     if (cs) cs.addEventListener("click", fecharPainelCompartilhar);
  const cp = $("btnCopyAddr");       if (cp) cp.addEventListener("click", copiarEndereco);
  const co = $("btnCriarOrdem");     if (co) co.addEventListener("click", criarOrdem);
  const en = $("btnEnviar");         if (en) en.addEventListener("click", enviarToken);
  const cw = $("btnConverterWPOL");  if (cw) cw.addEventListener("click", wrapPOL);
  const cu = $("btnConverterPOL");   if (cu) cu.addEventListener("click", unwrapWPOL);
  const cb = $("btnConsultarBTC");   if (cb) cb.addEventListener("click", consultarSaldoBTC);
  const rf = $("btnRefresh");        if (rf) rf.addEventListener("click", () => carregarOrdens());

  // Atualiza hint de saldo ao trocar token
  ["selOferece", "selDeseja", "selTokenEnvio"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("change", renderizarSaldos);
  });

  // Enter nos inputs BTC para consultar
  const btcIn = $("btcAddressInput");
  if (btcIn) btcIn.addEventListener("keydown", e => { if (e.key === "Enter") consultarSaldoBTC(); });
}

// ================= AUTO-REFRESH + EVENTOS WALLET =================
function iniciarAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!loading) carregarOrdens();
    if (userAddress) carregarSaldos();
  }, REFRESH_MS);
}

function configurarEventosWallet() {
  if (!window.ethereum) return;

  window.ethereum.on("accountsChanged", (contas) => {
    if (!contas || !contas.length) {
      desconectarCarteira();
    } else {
      userAddress = ethers.utils.getAddress(contas[0]);
      const a = $("addr"); if (a) a.textContent = short(userAddress);
      carregarSaldos();
      carregarOrdens();
    }
  });

  window.ethereum.on("chainChanged", () => {
    window.location.reload();
  });
}

// ================= INICIALIZAÇÃO =================
async function init() {
  console.log("🚀 BRN Exchange — inicializando…");
  preencherSeletores();
  configurarAbas();
  configurarFiltros();
  configurarMax();
  configurarBotoes();
  configurarEventosWallet();

  // Conecta RPC Polygon + verifica BTC em paralelo
  const [okPoly] = await Promise.all([
    atualizarStatusRede(),
    verificarStatusRedeBitcoin()
  ]);

  // Se carteira já estiver autorizada, reconecta silenciosamente
  if (okPoly && window.ethereum) {
    try {
      const contas = await window.ethereum.request({ method: "eth_accounts" });
      if (contas && contas.length) {
        // NÃO chamamos conectarCarteira() para não abrir popup
        provider = new ethers.providers.Web3Provider(window.ethereum);
        userAddress = ethers.utils.getAddress(contas[0]);
        signer = provider.getSigner();
        const rede = await provider.getNetwork();
        if (rede.chainId === POLYGON_CHAIN_ID) {
          const bc = $("btnConnect"); if (bc) bc.style.display = "none";
          const wi = $("walletInfo"); if (wi) wi.style.display = "flex";
          const a = $("addr"); if (a) a.textContent = short(userAddress);
          await carregarSaldos();
        } else {
          // se não estiver na Polygon, espera o usuário clicar
          const bc = $("btnConnect"); if (bc) bc.style.display = "block";
        }
      }
    } catch (e) { console.warn("Reconexão silenciosa falhou:", e.message); }
  }

  // Carrega mural (mesmo sem carteira conectada)
  if (okPoly) await carregarOrdens();

  iniciarAutoRefresh();
  console.log("✅ Pronto.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}