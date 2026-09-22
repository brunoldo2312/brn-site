// ============================================================
// APP.JS — BRN Exchange | Versão 2.0 (Corrigida)
// ✅ Conexão Polygon | ✅ Mural de Ordens | ✅ Criar Ordem
// ✅ Enviar Tokens | ✅ POL ↔ WPOL | ✅ Consulta BTC
// ✅ FIX: toasts, RPCs, Bitcoin API, approve no executar,
//         regex MAX, filtros dinâmicos, desconexão limpa
// ============================================================

// ================= CONFIGURAÇÕES =================
const ESCROW_FACTORY = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;

const TOKENS = [
  { symbol: "BRN",  name: "BRN Token",   address: "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210", decimals: 18 },
  { symbol: "USDC", name: "USD Coin",    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
  { symbol: "USDT", name: "Tether USD",  address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8a", decimals: 6 },
  { symbol: "WPOL", name: "Wrapped POL", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
  { symbol: "WBTC", name: "Wrapped BTC", address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
];

// FIX: endpoints JSON-RPC válidos (antes eram raízes de sites)
const RPC_LIST = [
  "https://polygon-rpc.com",
  "https://rpc.ankr.com/polygon",
  "https://polygon-bor.publicnode.com",
  "https://polygon.drpc.org",
  "https://1rpc.io/matic",
];

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
    deposit: "d0e30db0",
    withdraw: "2e1a7d4d",
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
let btcIntervalId = null; // FIX: guardar referência para limpar

// ================= UTILITÁRIOS =================
// FIX: remoção dos escapes \$ \( \vert{} — agora JS válido
const $ = id => document.getElementById(id);
const isAddr = a => /^0x[a-fA-F0-9]{40}$/.test(a || "");
const short = a => isAddr(a) ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
const mesmoAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function fmt(bigInt, decimals, maxFrac = 6) {
  try {
    const str = ethers.utils.formatUnits(bigInt.toString(), decimals);
    const [inteiro, fracao = ""] = str.split(".");
    // FIX: regex correta para remover zeros finais
    const limpo = fracao.slice(0, maxFrac).replace(/0+$/, "");
    return limpo ? `${inteiro},${limpo}` : inteiro;
  } catch { return "0"; }
}

// FIX: função utilitária para limpar zeros de string formatada
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

// FIX: link correto do PolygonScan com /tx/ e interpolação
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

// FIX: fetch com timeout real via AbortController
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
  // FIX: try/catch defensivo — endereço inválido não derruba o loop
  try { return ethers.utils.getAddress("0x" + palavra.slice(-40)); }
  catch { return "0x0000000000000000000000000000000000000000"; }
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
    toast("❌ Não foi possível conectar à rede Polygon. Verifique sua internet.", "err", 10000);
  }
  return ok;
}

// ================= REDE REMOTA BITCOIN =================
// FIX: endpoint correto da API (antes pegava HTML da home)
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
    // valida que é um número
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

// FIX: consulta de saldo de endereço BTC — handler que faltava
async function consultarSaldoBTC() {
  const input = $("btcAddressInput");
  const card = $("btcResultCard");
  const valEl = $("btcBalanceValue");
  if (!input || !valEl) return;

  const endereco = input.value.trim();
  if (!endereco) { toast("Digite um endereço Bitcoin.", "warn"); return; }

  valEl.textContent = "Consultando…";
  card?.classList.add("show");

  try {
    // API blockstream: /api/address/:addr retorna chain_stats + mempool_stats em sats
    const r = await fetchTimeout(`https://blockstream.info/api/address/${encodeURIComponent(endereco)}`, 10000);
    if (!r.ok) throw new Error("Endereço inválido ou não encontrado");
    const dados = await r.json();

    const chain = dados.chain_stats || {};
    const mem = dados.mempool_stats || {};
    const satsConfirmado = (chain.funded_txo_sum || 0) - (chain.spent_txo_sum || 0);
    const satsPendente   = (mem.funded_txo_sum || 0) - (mem.spent_txo_sum || 0);
    const totalSats = satsConfirmado + satsPendente;

    // formata: 8 casas decimais = sats
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
  return TOKENS.find(t => mesmoAddr(t.address, endereco));
}

function preencherSeletores() {
  const opts = TOKENS.map(t => `<option value="${t.address}">${t.symbol} — ${t.name}</option>`).join("");
  ["selOferece", "selDeseja", "selTokenEnvio"].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = opts;
  });

  // FIX: popular dinamicamente os filtros de Oferece/Pede
  const filtros = ["filtroOferece", "filtroPede"];
  filtros.forEach(id => {
    const el = $(id);
    if (!el) return;
    const placeholder = id === "filtroOferece"
      ? "Todos os ativos oferecidos"
      : "Todos os ativos desejados";
    el.innerHTML = `<option value="">${placeholder}</option>` +
      TOKENS.map(t => `<option value="${t.address}">${t.symbol}</option>`).join("");
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

    // Verificar rede
    let rede = await provider.getNetwork();
    if (rede.chainId !== POLYGON_CHAIN_ID) {
      toast("⚠️ Mudando para Polygon Mainnet…", "warn");
      try {
        await provider.send("wallet_switchEthereumChain", [{ chainId: "0x89" }]);
        // FIX: revalida a rede após a troca (algumas carteiras retornam sem trocar)
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

// FIX: limpa estado completo ao desconectar
function desconectarCarteira() {
  provider = null;
  signer = null;
  userAddress = null;
  saldos = { POL: 0n };
  ordersCache = [];
  $("btnConnect").style.display = "block";
  $("walletInfo").style.display = "none";
  renderizarSaldos();
  // re-renderiza ordens sem destacar "minhas"
  if (ordersCache.length === 0) {
    const container = $("orders");
    if (container) container.innerHTML = '<div class="empty">Conecte a carteira para ver ordens.</div>';
  } else {
    aplicarFiltros();
  }
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

    // FIX: paraleliza as chamadas em vez de N+1 sequencial
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

        ordens.push({
          indice: i,
          endereco,
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

    const div = document.createElement("div");
    div.className = `order ${ativa ? "active" : ""} ${o.executado ? "done" : ""} ${o.cancelado ? "cancelled" : ""}`;
    // FIX: template literals corretos — sem escapes
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
          ${ativa && !minha ? `<button class="btn btn-sm btn-primary" data-action="executar" data-escrow="${o.endereco}">Executar</button>` : ""}
          ${ativa && minha ? `<button class="btn btn-sm" data-action="cancelar" data-escrow="${o.endereco}">Cancelar</button>` : ""}
        </div>
      </div>
    `;
    container.appendChild(div);
  }

  // FIX: eventos delegados em vez de onclick inline (evita quebra de aspas)
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

    // FIX: validação de inputs vazios antes de parseUnits
    const ofStr = $("valorOferece").value.trim().replace(",", ".");
    const deStr = $("valorDeseja").value.trim().replace(",", ".");
    if (!ofStr || isNaN(Number(ofStr)) || Number(ofStr) <= 0) throw new Error("Valor oferecido inválido");
    if (!deStr || isNaN(Number(deStr)) || Number(deStr) <= 0) throw new Error("Valor desejado inválido");

    const ofVal = ethers.utils.parseUnits(ofStr, ofToken.decimals);
    const deVal = ethers.utils.parseUnits(deStr, deToken.decimals);

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
          gasLimit: 100000
        });
        toastTx("📤 Aprovação:", tx.hash);
        await tx.wait();
        toast("✅ Aprovado!", "ok");
      }
    }

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
// FIX: executarOrdem faz approve do token desejado antes do executar
async function executarOrdem(escrowAddr) {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;

  try {
    // 1) ler dados do escrow para saber qual token/valor precisamos aprovar
    const dadosRes = await rpcProvider.call({
      to: escrowAddr,
      data: "0x" + S.Escrow.obterDados
    });
    const p = splitResposta(dadosRes.slice(2));
    const tokenDesejado = decAddr(p[3]);
    const valorDesejado = decUint(p[4]);

    // 2) checar allowance e, se necessário, aprovar
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

    // 3) executar a troca
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

// ================= NAVEGAÇÃO DE ABAS =================
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

  if (typeof ethers === "undefined") {
    console.error("❌ Ethers.js não carregado! Verifique a ordem dos scripts no HTML.");
    alert("ERRO: Ethers.js não foi carregado. Verifique a ordem dos scripts.");
    return;
  }
  console.log("✅ Ethers.js carregado");

  // Disparo paralelo
  atualizarStatusRede().then(ok => {
    if (ok && rpcProvider) {
      carregarOrdens();
    } else {
      // FIX: mensagem explícita se RPC falhar
      const container = $("orders");
      if (container) container.innerHTML = '<div class="empty">❌ Sem conexão com a rede Polygon. Recarregue a página.</div>';
    }
  });

  // Bitcoin API — status + consultas
  verificarStatusRedeBitcoin();
  btcIntervalId = setInterval(verificarStatusRedeBitcoin, 60000);

  preencherSeletores();
  configurarAbas();
  configurarFiltros();

  // Botões principais
  $("btnConnect").addEventListener("click", conectarCarteira);
  $("btnDisconnect").addEventListener("click", desconectarCarteira);
  $("btnRefresh").addEventListener("click", carregarOrdens);
  $("btnCriarOrdem").addEventListener("click", criarOrdem);
  $("btnEnviar").addEventListener("click", enviarToken);
  $("btnConverterWPOL").addEventListener("click", wrapPOL);
  $("btnConverterPOL").addEventListener("click", unwrapWPOL);

  // FIX: handler do botão de consulta BTC que estava faltando
  $("btnConsultarBtc")?.addEventListener("click", consultarSaldoBTC);
  $("btcAddressInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") consultarSaldoBTC();
  });

  // Botões MAX — FIX: regex correta e sintaxe limpa
  $("btnMaxOf")?.addEventListener("click", () => {
    const sel = $("selOferece");
    const tok = tokenPorEndereco(sel.value);
    if (!tok) return;
    const val = tok.symbol === "POL" ? saldos.POL : (saldos[tok.address] || 0n);
    $("valorOferece").value = trimZeros(ethers.utils.formatUnits(val.toString(), tok.decimals));
  });
  $("btnMaxSend")?.addEventListener("click", () => {
    const sel = $("selTokenEnvio");
    const tok = tokenPorEndereco(sel.value);
    if (!tok) return;
    const val = tok.symbol === "POL" ? saldos.POL : (saldos[tok.address] || 0n);
    $("valorEnvio").value = trimZeros(ethers.utils.formatUnits(val.toString(), tok.decimals));
  });
  $("btnMaxWrap")?.addEventListener("click", () => {
    $("valorWPOL").value = trimZeros(ethers.utils.formatUnits(saldos.POL.toString(), 18));
  });
  $("btnMaxUnwrap")?.addEventListener("click", () => {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    // FIX: || no lugar de \vert{}\vert{}
    const saldo = saldos[wpol.address] || 0n;
    $("valorPOL").value = trimZeros(ethers.utils.formatUnits(saldo.toString(), 18));
  });

  ["selOferece", "selTokenEnvio"].forEach(id => {
    $(id)?.addEventListener("change", renderizarSaldos);
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
