// ============================================================
// APP.JS — BRN Exchange | Versão 3.3 (Com Compartilhar Endereço)
// ✅ Fallback de token desconhecido
// ✅ Debug no console para ordens
// ✅ RPCs reordenados (publicnode primeiro)
// ✅ Compartilhar endereço BRN (nativo + WhatsApp + Telegram)
// ============================================================

// ================= CONFIGURAÇÕES =================
const ESCROW_FACTORY = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;

const TOKENS = [
  { symbol: "BRN",     name: "BRN Token",           address: "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210", decimals: 18 },
  { symbol: "USDC",    name: "USD Coin (nativo)",   address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
  { symbol: "USDC.e",  name: "USD Coin (bridged)",  address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6 },
  { symbol: "USDT",    name: "Tether USD",          address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8a", decimals: 6 },
  { symbol: "USDT.e",  name: "Tether USD (bridged)",address: "0x9417669fBF23357D2774e9D4234219952D36A1e5", decimals: 6 },
  { symbol: "WPOL",    name: "Wrapped POL",         address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
  { symbol: "WBTC",    name: "Wrapped BTC",         address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
  { symbol: "WETH",    name: "Wrapped Ether",       address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
];

// RPCs reordenados — publicnode primeiro (mais estável)
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

function trimZeros(str) {
  return str.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
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
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
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
  try { return ethers.utils.getAddress("0x" + palavra.slice(-40)); }
  catch { return "0x0000000000000000000000000000000000000000"; }
}
function decUint(palavra) {
  if (!palavra) return 0n;
  try { return BigInt("0x" + palavra); }
  catch { return 0n; }
}
function decBool(palavra) {
  try { return decUint(palavra) === 1n; }
  catch { return false; }
}
function splitResposta(hex) {
  const semPrefixo = hex.slice(2);
  const partes = [];
  for (let i = 0; i < semPrefixo.length; i += 64) {
    partes.push(semPrefixo.slice(i, i + 64));
  }
  return partes;
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
  const dot = $("btcDot");
  const txt = $("btcText");
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
    console.warn("⚠️ Bitcoin API indisponível:", e.message);
  }
}

async function consultarSaldoBTC() {
  const input = $("btcAddressInput");
  const card = $("btcResult");
  const valEl = $("btcBalanceValue");
  if (!input || !valEl) return;

  const endereco = input.value.trim();
  if (!endereco) { toast("Digite um endereço Bitcoin.", "warn"); return; }

  valEl.textContent = "Consultando…";
  card?.classList.add("show");

  try {
    const r = await fetchTimeout(
      `https://blockstream.info/api/address/${encodeURIComponent(endereco)}`, 10000
    );
    if (!r.ok) throw new Error("Endereço inválido ou não encontrado");
    const dados = await r.json();

    const chain = dados.chain_stats || {};
    const mem = dados.mempool_stats || {};
    const satsConfirmado = (chain.funded_txo_sum || 0) - (chain.spent_txo_sum || 0);
    const satsPendente   = (mem.funded_txo_sum || 0) - (mem.spent_txo_sum || 0);
    const totalSats = satsConfirmado + satsPendente;

    const btc = (totalSats / 1e8).toFixed(8);
    valEl.textContent = `${btc} BTC`;
    if (satsPendente !== 0) {
      valEl.textContent += ` (${(satsPendente / 1e8).toFixed(8)} pendente)`;
    }
  } catch (e) {
    valEl.textContent = "— BTC";
    toast("❌ " + e.message, "err");
  }
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

function preencherSeletores() {
  const opts = TOKENS.map(t => `<option value="${t.address}">${t.symbol} — ${t.name}</option>`).join("");
  ["selOferece", "selDeseja", "selTokenEnvio"].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = opts;
  });

  const filtroOpts = TOKENS.map(t => `<option value="${t.address}">${t.symbol}</option>`).join("");
  const fo = $("filtroOferece");
  if (fo) fo.innerHTML = '<option value="">Oferece: Todos</option>' + filtroOpts;
  const fp = $("filtroPede");
  if (fp) fp.innerHTML = '<option value="">Pede: Todos</option>' + filtroOpts;
}

// ================= SALDOS =================
async function carregarSaldos() {
  if (!rpcProvider || !userAddress) return;

  try {
    saldos.POL = BigInt((await rpcProvider.getBalance(userAddress)).toString());

    for (const t of TOKENS) {
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
    div.innerHTML = `<span class="t">${simbolo}</span><span class="v">${fmt(valor, decimais)}</span>`;
    container.appendChild(div);
  };

  add("POL", saldos.POL, 18);
  TOKENS.forEach(t => add(t.symbol, saldos[t.address] || 0n, t.decimals));

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
  $("btnConnect").style.display = "block";
  $("walletInfo").style.display = "none";
  fecharPainelCompartilhar();
  renderizarSaldos();
  aplicarFiltros();
  toast("Desconectado", "info");
}

// ================= COMPARTILHAR ENDEREÇO =================
function abrirPainelCompartilhar() {
  if (!userAddress) {
    toast("Conecte a carteira primeiro.", "warn");
    return;
  }

  const painel = $("sharePanel");
  const addrFull = $("shareAddrFull");
  if (!painel || !addrFull) return;

  // Preenche endereço
  addrFull.textContent = userAddress;

  // Preenche links de compartilhamento
  const texto = `Meu endereço BRN na Polygon: ${userAddress}`;
  const textoEnc = encodeURIComponent(texto);

  const wa = $("btnShareWhatsApp");
  if (wa) wa.href = `https://wa.me/?text=${textoEnc}`;

  const tg = $("btnShareTelegram");
  if (tg) tg.href = `https://t.me/share/url?url=${encodeURIComponent(userAddress)}&text=${encodeURIComponent("Meu endereço BRN:")}`;

  const ps = $("btnSharePolygonScan");
  if (ps) ps.href = `https://polygonscan.com/address/${userAddress}`;

  // Compartilhamento nativo (Web Share API) se disponível
  const nat = $("btnShareNative");
  if (nat) {
    if (navigator.share) {
      // Remover listener antigo antes de adicionar (evita duplicação)
      const novo = nat.cloneNode(true);
      nat.parentNode.replaceChild(novo, nat);
      novo.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await navigator.share({
            title: "Meu Endereço BRN",
            text: texto
          });
        } catch (err) {
          if (err.name !== "AbortError") {
            console.warn("Erro ao compartilhar:", err.message);
          }
        }
      });
      novo.style.display = "";
    } else {
      nat.style.display = "none"; // Navegador sem suporte
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
    // Fallback para navegadores antigos
    const ta = document.createElement("textarea");
    ta.value = userAddress;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast("✅ Endereço copiado!", "ok");
    } catch {
      toast("❌ Não foi possível copiar. Selecione manualmente.", "err");
    }
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
    counter.textContent = "⏳ Consultando…";
    container.innerHTML = '<div class="state"><div class="spinner"></div><p>Carregando ordens…</p></div>';

    const totalRes = await rpcProvider.call({ to: ESCROW_FACTORY, data: "0x" + S.Factory.totalOrdens });
    const total = Number(decUint(totalRes.slice(2)));
    counter.textContent = `${total} ordem${total !== 1 ? "ens" : ""}`;

    if (total === 0) {
      container.innerHTML = '<div class="empty"><div class="big">📋</div><p>Nenhuma ordem encontrada. Seja o primeiro a criar uma!</p></div>';
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
        const endereco = decAddr(enderecoRes.slice(2));

        const dadosRes = await rpcProvider.call({
          to: endereco,
          data: "0x" + S.Escrow.obterDados
        });
        const p = splitResposta(dadosRes.slice(2));

        // Debug no console — mostra o que o contrato retornou
        console.log(`[Ordem #${i}]`, {
          endereco,
          campos: p.length,
          criador: decAddr(p[0]),
          tokenOferecido: decAddr(p[1]),
          valorOferecido: decUint(p[2]).toString(),
          tokenDesejado: decAddr(p[3]),
          valorDesejado: decUint(p[4]).toString(),
          executado: p[5] ? decBool(p[5]) : null,
          cancelado: p[6] ? decBool(p[6]) : null
        });

        ordens.push({
          indice: i,
          endereco,
          criador: decAddr(p[0]),
          tokenOferecido: decAddr(p[1]),
          valorOferecido: decUint(p[2]),
          tokenDesejado: decAddr(p[3]),
          valorDesejado: decUint(p[4]),
          executado: p[5] ? decBool(p[5]) : false,
          cancelado: p[6] ? decBool(p[6]) : false,
        });
      } catch (e) {
        console.warn(`Erro ao carregar ordem ${i}:`, e.message);
      }
    }));

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

    const oferTexto = ofer ? `${fmt(o.valorOferecido, ofer.decimals)} ${ofer.symbol}` : "Token desconhecido";
    const pedTexto = ped ? `${fmt(o.valorDesejado, ped.decimals)} ${ped.symbol}` : "Token desconhecido";
    const oferAviso = ofer?.desconhecido ? ` <small class="dim">(token não cadastrado)</small>` : "";
    const pedAviso = ped?.desconhecido ? ` <small class="dim">(token não cadastrado)</small>` : "";

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
          <div class="swap-amt">${oferTexto}</div>
          ${oferAviso}
        </div>
        <div class="swap-icon">⇄</div>
        <div class="swap-side">
          <div class="swap-lbl">Pede</div>
          <div class="swap-amt">${pedTexto}</div>
          ${pedAviso}
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
    const tx = await signer.sendTransaction({
      to: ESCROW_FACTORY,
      data: "0x" + S.Factory.criarOrdem + encAddr(ofAddr) + encUint(ofVal) + encAddr(deAddr) + encUint(deVal),
      gasLimit: 500000
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
    const p = splitResposta(dadosRes.slice(2));
    const tokenDesejado = decAddr(p[3]);
    const valorDesejado = decUint(p[4]);

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
    const valorStr = $("valorPOL").value.trim().replace(",", ".");
    if (!valorStr || isNaN(Number(valorStr)) || Number(valorStr) <= 0) throw new Error("Valor inválido");
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
    $("filtroStatus").value = "ativas";
    $("filtroOferece").value = "";
    $("filtroPede").value = "";
    $("filtroMinhas").checked = false;
    aplicarFiltros();
  });
}

// ================= INIT =================
async function init() {
  console.log("🚀 BRN Exchange — Iniciando…");

  // Aguarda ethers.js carregar (fallback do HTML) até 10s
  let aguardou = 0;
  while (typeof ethers === "undefined" && aguardou < 100) {
    await new Promise(r => setTimeout(r, 100));
    aguardou++;
  }

  if (typeof ethers === "undefined") {
    console.error("❌ Ethers.js não carregado após 10s!");
    alert("ERRO: Ethers.js não foi carregado. Verifique sua conexão.");
    return;
  }
  console.log("✅ Ethers.js carregado");

  Promise.allSettled([
    atualizarStatusRede(),
    verificarStatusRedeBitcoin()
  ]).then(([polygonResult]) => {
    if (polygonResult.status === "fulfilled" && polygonResult.value) {
      carregarOrdens();
    } else {
      const container = $("orders");
      if (container) container.innerHTML = '<div class="empty">❌ Sem conexão com a rede Polygon. Verifique sua internet.</div>';
    }
  });

  setInterval(verificarStatusRedeBitcoin, 60000);

  preencherSeletores();
  configurarAbas();
  configurarFiltros();

  // Botões principais (com verificação de existência)
  const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
  bind("btnConnect", conectarCarteira);
  bind("btnDisconnect", desconectarCarteira);
  bind("btnRefresh", carregarOrdens);
  bind("btnCriarOrdem", criarOrdem);
  bind("btnEnviar", enviarToken);
  bind("btnConverterWPOL", wrapPOL);
  bind("btnConverterPOL", unwrapWPOL);
  bind("btnConsultarBTC", consultarSaldoBTC);

  // ✅ Botões de compartilhar endereço
  bind("btnShareAddr", abrirPainelCompartilhar);
  bind("btnCloseShare", fecharPainelCompartilhar);
  bind("btnCopyAddr", copiarEndereco);

  const btcInput = $("btcAddressInput");
  if (btcInput) btcInput.addEventListener("keydown", e => { if (e.key === "Enter") consultarSaldoBTC(); });

  // Botões MAX
  bind("btnMaxOf", () => {
    const sel = $("selOferece");
    const tok = tokenPorEndereco(sel.value);
    if (!tok) return;
    const val = saldos[tok.address] || 0n;
    $("valorOferece").value = trimZeros(ethers.utils.formatUnits(val.toString(), tok.decimals));
  });
  bind("btnMaxSend", () => {
    const sel = $("selTokenEnvio");
    const tok = tokenPorEndereco(sel.value);
    if (!tok) return;
    const val = saldos[tok.address] || 0n;
    $("valorEnvio").value = trimZeros(ethers.utils.formatUnits(val.toString(), tok.decimals));
  });
  bind("btnMaxWrap", () => {
    $("valorWPOL").value = trimZeros(ethers.utils.formatUnits(saldos.POL.toString(), 18));
  });
  bind("btnMaxUnwrap", () => {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    const saldo = saldos[wpol.address] || 0n;
    $("valorPOL").value = trimZeros(ethers.utils.formatUnits(saldo.toString(), 18));
  });

  ["selOferece", "selTokenEnvio"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("change", renderizarSaldos);
  });

  console.log("✅ Inicialização concluída!");
}

window.addEventListener("load", init);

if (window.ethereum) {
  window.ethereum.on("accountsChanged", contas => {
    if (contas.length === 0) desconectarCarteira();
    else window.location.reload();
  });
  window.ethereum.on("chainChanged", () => window.location.reload());
}
