// ============================================================
// APP.JS — BRN Carteira & Trocas — 2 MURAIS (BRN/USDC + USDT/BRN)
// ============================================================

// --- CONFIGURAÇÕES ---
const ESCROW_FACTORY_ADDRESS = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const TOKEN_BRN_ADDRESS      = "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210";
const TOKEN_USDC_ADDRESS     = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const TOKEN_USDT_ADDRESS     = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

const BRN_DECIMALS   = 18;
const USDC_DECIMALS  = 6;
const USDT_DECIMALS  = 6;
const POLYGON_CHAIN_ID = 137;

const RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://1rpc.io/matic",
];
const RPC_TIMEOUT_MS = 15000;

// --- SELECTORS ---
const SEL_FACTORY = {
  criarOrdem:   "ceff4da6",
  totalOrdens:  "8275d6fa",
  ordem:        "72c453b8",
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
  valorOferecido: "f6c467b7",
};
const SEL_ERC20 = {
  transfer:  "a9059cbb",
  balanceOf: "70a08231",
  allowance: "dd62ed3e",
  approve:   "095ea7b3",
};

// --- ESTADO GLOBAL ---
let provider = null;
let signer = null;
let userAddress = null;
let ordersCache = [];

// ============================================================
// UTILITÁRIOS
// ============================================================
function $(id) { return document.getElementById(id); }
function short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—"; }

function fmt(value, decimals, maxFrac = 4) {
  try {
    if (!value) return "0";
    const s = ethers.utils.formatUnits(value, decimals);
    const n = Number(s);
    if (!isFinite(n)) return s;
    return n.toLocaleString("pt-BR", { maximumFractionDigits: maxFrac });
  } catch (e) { return String(value || "0"); }
}

function toast(msg, type = "info", ms = 5000) {
  const box = $("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.innerHTML = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateX(100%)"; setTimeout(() => el.remove(), 300); }, ms);
}

function setNet(state, text) {
  const dot = $("netDot"), txt = $("netText");
  if (dot) dot.className = "dot " + (state === "ok" ? "" : state);
  if (txt) txt.textContent = text;
}

function isValidAddress(a) { return /^0x[a-fA-F0-9]{40}$/.test(a); }

// --- Codificação ABI ---
function pad32(hexNo0x) { return hexNo0x.padStart(64, "0"); }
function encAddress(addr) { return pad32(addr.toLowerCase().replace(/^0x/, "")); }
function encUint(n) { return pad32(BigInt(n).toString(16)); }
function decAddress(word) { return "0x" + word.slice(24); }
function decUint(word) { return BigInt("0x" + word); }
function decBool(word) { return BigInt("0x" + word) !== 0n; }
function splitWords(hex) { const b = hex.replace(/^0x/, ""); const out = []; for (let i = 0; i < b.length; i += 64) out.push(b.slice(i, i + 64)); return out; }
function decAddressArray(hex) {
  const w = splitWords(hex);
  if (w.length === 0) return [];
  const off = Number(BigInt("0x" + w[0]));
  if (off >= w.length * 32) return [];
  const len = Number(BigInt("0x" + w[off / 32]));
  const arr = [];
  for (let i = 0; i < len; i++) { const idx = off / 32 + 1 + i; if (idx < w.length) arr.push(decAddress(w[idx])); }
  return arr;
}

// ============================================================
// PROVIDER
// ============================================================
async function withTimeout(promise, ms, msg = "Tempo esgotado") {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(t); }
}

async function pickProvider() {
  for (const url of RPCS) {
    try {
      console.log(`🔄 Testando RPC: ${url}`);
      const p = new ethers.providers.JsonRpcProvider(url);
      const net = await withTimeout(p.getNetwork(), 5000);
      if (net && Number(net.chainId) === POLYGON_CHAIN_ID) {
        try {
          await withTimeout(p.getBlockNumber(), 3000);
          console.log(`✅ RPC conectado: ${url}`);
          return p;
        } catch (e2) { console.warn(`⚠️ RPC ${url} sem blocos`); }
      }
    } catch (e) { console.warn(`❌ ${url}: ${e.message}`); }
  }
  throw new Error("Nenhum RPC disponível. Recarregue a página.");
}

async function getProvider() { if (provider) return provider; provider = await pickProvider(); return provider; }
async function rawCall(to, data) { const p = await getProvider(); return await withTimeout(p.call({ to, data }), RPC_TIMEOUT_MS); }

// ============================================================
// CLASSIFICAR ORDEM POR PAR
// ============================================================
function classificarPar(o) {
  const BRN = TOKEN_BRN_ADDRESS.toLowerCase();
  const USDC = TOKEN_USDC_ADDRESS.toLowerCase();
  const USDT = TOKEN_USDT_ADDRESS.toLowerCase();
  const of = o.tokenOferecido.toLowerCase();
  const de = o.tokenDesejado.toLowerCase();
  if (of === BRN && de === USDC) return "brn-usdc";
  if (of === BRN && de === USDT) return "brn-usdt";
  if (of === USDT && de === BRN) return "usdt-brn";
  if (of === USDC && de === BRN) return "usdc-brn";
  return "outros";
}

// ============================================================
// LEITURA DO MURAL (todas as ordens)
// ============================================================
async function carregarMural() {
  const box1 = $("orders1"), box2 = $("orders2");
  const c1 = $("counter1"), c2 = $("counter2");
  if (box1) box1.innerHTML = `<div class="state"><div class="spinner"></div>Consultando…</div>`;
  if (box2) box2.innerHTML = `<div class="state"><div class="spinner"></div>Consultando…</div>`;
  if (c1) c1.textContent = "⏳ Consultando…";
  if (c2) c2.textContent = "⏳ Consultando…";
  setNet("load", "Consultando…");

  try {
    let addrs = [];
    try {
      const r = await rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.todasOrdens);
      addrs = decAddressArray(r);
    } catch (e) {
      const rTotal = await rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.totalOrdens);
      const n = Number(decUint(splitWords(rTotal)[0]));
      if (n > 0 && n < 100) {
        const rs = await Promise.all(Array.from({ length: n }, (_, i) => rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.ordem + encUint(i))));
        addrs = rs.map(r => decAddress(splitWords(r)[0]));
      }
    }

    const detalhes = await Promise.all(addrs.map(async (addr) => {
      try {
        const r = await rawCall(addr, "0x" + SEL_ESCROW.obterDados);
        const w = splitWords(r);
        return {
          endereco: addr,
          criador: decAddress(w[0]),
          tokenOferecido: decAddress(w[1]),
          tokenDesejado: decAddress(w[2]),
          valorOferecido: decUint(w[3]),
          valorDesejado: decUint(w[4]),
          executado: decBool(w[5]),
          cancelado: decBool(w[6]),
        };
      } catch (e) { return { endereco: addr, erro: true }; }
    }));

    ordersCache = detalhes;
    renderMurais(detalhes);

    const ativas = detalhes.filter(o => !o.erro && !o.executado && !o.cancelado).length;
    setNet("ok", "Polygon · online");
    console.log(`✅ ${ativas} ordem(ns) ativa(s) de ${detalhes.length}`);
  } catch (e) {
    console.error(e);
    if (box1) box1.innerHTML = `<div class="empty"><div class="big">⚠️</div>Não foi possível consultar.<br><small>${e.message}</small></div>`;
    if (box2) box2.innerHTML = `<div class="empty"><div class="big">⚠️</div>Não foi possível consultar.<br><small>${e.message}</small></div>`;
    if (c1) c1.textContent = "❌ Falha";
    if (c2) c2.textContent = "❌ Falha";
    setNet("off", "Offline");
  }
}

// ============================================================
// RENDER — divide ordens entre os 2 murais
// ============================================================
function renderMurais(orders) {
  const validas = orders.filter(o => !o.erro);
  const doMural1 = validas.filter(o => classificarPar(o) === "brn-usdc");
  const doMural2 = validas.filter(o => classificarPar(o) === "usdt-brn" || classificarPar(o) === "brn-usdt");
  renderLista("orders1", "counter1", doMural1);
  renderLista("orders2", "counter2", doMural2);
}

function renderLista(boxId, counterId, orders) {
  const box = $(boxId), counter = $(counterId);
  if (!box) return;
  if (!orders.length) {
    box.innerHTML = '<div class="empty"><div class="big">📭</div>Nenhuma ordem ativa no momento.</div>';
    if (counter) counter.textContent = "📋 0 ordens";
    return;
  }
  const rank = o => o.cancelado ? 2 : o.executado ? 1 : 0;
  const sorted = [...orders].sort((a, b) => rank(a) - rank(b));
  const ativas = sorted.filter(o => !o.executado && !o.cancelado).length;
  if (counter) counter.textContent = "📋 " + ativas + " ativa(s) · " + sorted.length + " no total";
  box.innerHTML = sorted.map((o, i) => renderOrder(o, i)).join("");
}

function renderOrder(o, i) {
  const BRN = TOKEN_BRN_ADDRESS.toLowerCase();
  const USDC = TOKEN_USDC_ADDRESS.toLowerCase();
  const USDT = TOKEN_USDT_ADDRESS.toLowerCase();
  const of = o.tokenOferecido.toLowerCase();
  const de = o.tokenDesejado.toLowerCase();
  let decOf = 18, decDe = 18, symOf = short(o.tokenOferecido), symDe = short(o.tokenDesejado);
  let clsOf = "", clsDe = "";
  if (of === BRN)  { decOf = BRN_DECIMALS;  symOf = "BRN";  clsOf = "brn"; }
  if (of === USDC) { decOf = USDC_DECIMALS; symOf = "USDC"; clsOf = "usdc"; }
  if (of === USDT) { decOf = USDT_DECIMALS; symOf = "USDT"; clsOf = "usdt"; }
  if (de === BRN)  { decDe = BRN_DECIMALS;  symDe = "BRN";  clsDe = "brn"; }
  if (de === USDC) { decDe = USDC_DECIMALS; symDe = "USDC"; clsDe = "usdc"; }
  if (de === USDT) { decDe = USDT_DECIMALS; symDe = "USDT"; clsDe = "usdt"; }
  const status = o.cancelado ? "cancelled" : o.executado ? "done" : "active";
  const tagTxt = o.cancelado ? "Cancelada" : o.executado ? "Executada" : "Ativa";
  const podeExecutar = !o.executado && !o.cancelado && userAddress && userAddress.toLowerCase() !== o.criador.toLowerCase();
  const podeCancelar = !o.executado && !o.cancelado && userAddress && userAddress.toLowerCase() === o.criador.toLowerCase();
  return '<div class="order ' + status + '">' +
    '<div class="order-top"><span class="order-id">#' + (i + 1) + ' · ' + short(o.endereco) + '</span><span class="tag ' + status + '">' + tagTxt + '</span></div>' +
    '<div class="swap">' +
      '<div class="side"><div class="lbl">Oferece</div><div class="amt ' + clsOf + '">' + fmt(o.valorOferecido, decOf) + ' ' + symOf + '</div></div>' +
      '<div class="arrow">⇄</div>' +
      '<div class="side"><div class="lbl">Pede</div><div class="amt ' + clsDe + '">' + fmt(o.valorDesejado, decDe) + ' ' + symDe + '</div></div>' +
    '</div>' +
    '<div class="order-meta"><span>Criador: <b>' + short(o.criador) + '</b></span><span>Escrow: <b>' + short(o.endereco) + '</b></span></div>' +
    '<div class="order-actions">' +
      (podeExecutar ? '<button class="btn-ok btn-sm" onclick="executarOrdem(\'' + o.endereco + '\')">⚡ Executar (pagar ' + fmt(o.valorDesejado, decDe) + ' ' + symDe + ')</button>' : '') +
      (podeCancelar ? '<button class="btn-err btn-sm" onclick="cancelarOrdem(\'' + o.endereco + '\')">✖ Cancelar</button>' : '') +
      ((!podeExecutar && !podeCancelar && !o.executado && !o.cancelado) ? '<span class="order-id">🔌 Conecte a carteira para interagir</span>' : '') +
    '</div>' +
  '</div>';
}

// ============================================================
// CARTEIRA
// ============================================================
async function conectarCarteira() {
  if (!window.ethereum) { toast("MetaMask nao encontrada.", "err", 8000); return; }
  try {
    toast("Solicitando conexao...", "info");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts.length) throw new Error("Nenhuma conta");
    userAddress = accounts[0];
    const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    if (parseInt(chainIdHex, 16) !== POLYGON_CHAIN_ID) {
      toast("Troque para Polygon...", "warn");
      try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x89" }] }); }
      catch (e) { if (e.code === 4902) { toast("Adicione Polygon manualmente", "err", 8000); return; } throw e; }
    }
    signer = new ethers.providers.Web3Provider(window.ethereum).getSigner();
    if ($("walletInfo")) $("walletInfo").style.display = "block";
    if ($("addr")) $("addr").textContent = userAddress;
    if ($("btnConnect")) { $("btnConnect").textContent = "Conectado"; $("btnConnect").disabled = true; }
    if ($("btnDisconnect")) $("btnDisconnect").style.display = "inline-block";
    ["btnApprove1","btnCreate1","btnApprove2","btnCreate2","btnSendBRN"].forEach(id => { if ($(id)) $(id).disabled = false; });
    await carregarSaldos();
    renderMurais(ordersCache);
    toast("Conectado: " + short(userAddress), "ok");
    window.ethereum.on("accountsChanged", () => location.reload());
    window.ethereum.on("chainChanged", () => location.reload());
  } catch (e) { console.error(e); toast("Falha: " + (e.message || "erro"), "err", 8000); }
}

function desconectar() {
  userAddress = null; signer = null;
  if ($("walletInfo")) $("walletInfo").style.display = "none";
  if ($("btnConnect")) { $("btnConnect").textContent = "Conectar carteira"; $("btnConnect").disabled = false; }
  if ($("btnDisconnect")) $("btnDisconnect").style.display = "none";
  ["btnApprove1","btnCreate1","btnApprove2","btnCreate2","btnSendBRN"].forEach(id => { if ($(id)) $(id).disabled = true; });
  renderMurais(ordersCache);
  toast("Desconectado", "info");
}

async function lerSaldo(token, addr) {
  const r = await rawCall(token, "0x" + SEL_ERC20.balanceOf + encAddress(addr));
  return decUint(splitWords(r)[0]);
}
async function lerAllowance(token, owner, spender) {
  const r = await rawCall(token, "0x" + SEL_ERC20.allowance + encAddress(owner) + encAddress(spender));
  return decUint(splitWords(r)[0]);
}
async function carregarSaldos() {
  try {
    const res = await Promise.all([
      lerSaldo(TOKEN_BRN_ADDRESS, userAddress),
      lerSaldo(TOKEN_USDC_ADDRESS, userAddress),
      lerSaldo(TOKEN_USDT_ADDRESS, userAddress),
    ]);
    if ($("balBRN"))  $("balBRN").textContent  = fmt(res[0], BRN_DECIMALS);
    if ($("balUSDC")) $("balUSDC").textContent = fmt(res[1], USDC_DECIMALS);
    if ($("balUSDT")) $("balUSDT").textContent = fmt(res[2], USDT_DECIMALS);
  } catch (e) { console.error("saldos:", e); }
}

async function aprovarToken(token, spender, valor) {
  const data = "0x" + SEL_ERC20.approve + encAddress(spender) + encUint(valor);
  toast("Aprovando... confirme na MetaMask", "info");
  const tx = await signer.sendTransaction({ to: token, data });
  await tx.wait();
  toast("Aprovado!", "ok");
}

async function criarOrdem(tokenOf, tokenDe, vOf, vDe, nome) {
  try {
    const allow = await lerAllowance(tokenOf, userAddress, ESCROW_FACTORY_ADDRESS);
    if (allow < vOf) { toast("Aprove " + nome + " primeiro", "warn", 6000); return; }
    const data = "0x" + SEL_FACTORY.criarOrdem + encAddress(tokenOf) + encAddress(tokenDe) + encUint(vOf) + encUint(vDe);
    toast("Criando ordem... confirme na MetaMask", "info");
    const tx = await signer.sendTransaction({ to: ESCROW_FACTORY_ADDRESS, data });
    toast("TX: " + short(tx.hash), "info");
    await tx.wait();
    toast("Ordem criada!", "ok");
    await carregarSaldos();
    await carregarMural();
  } catch (e) { console.error(e); toast("Falha: " + (e.data && e.data.message || e.message), "err", 8000); }
}

async function aprovar1() {
  const v = $("inBRN1") && $("inBRN1").value;
  if (!v || Number(v) <= 0) { toast("Informe quanto BRN", "warn"); return; }
  try { await aprovarToken(TOKEN_BRN_ADDRESS, ESCROW_FACTORY_ADDRESS, ethers.utils.parseUnits(v, BRN_DECIMALS)); }
  catch (e) { toast("Falha: " + (e.data && e.data.message || e.message), "err"); }
}
async function criar1() {
  const b = $("inBRN1") && $("inBRN1").value;
  const u = $("inUSDC1") && $("inUSDC1").value;
  if (!b || Number(b) <= 0) { toast("Informe BRN", "warn"); return; }
  if (!u || Number(u) <= 0) { toast("Informe USDC", "warn"); return; }
  await criarOrdem(TOKEN_BRN_ADDRESS, TOKEN_USDC_ADDRESS, ethers.utils.parseUnits(b, BRN_DECIMALS), ethers.utils.parseUnits(u, USDC_DECIMALS), "BRN");
  $("inBRN1").value = ""; $("inUSDC1").value = "";
}
async function aprovar2() {
  const v = $("inUSDT2") && $("inUSDT2").value;
  if (!v || Number(v) <= 0) { toast("Informe quanto USDT", "warn"); return; }
  try { await aprovarToken(TOKEN_USDT_ADDRESS, ESCROW_FACTORY_ADDRESS, ethers.utils.parseUnits(v, USDT_DECIMALS)); }
  catch (e) { toast("Falha: " + (e.data && e.data.message || e.message), "err"); }
}
async function criar2() {
  const t = $("inUSDT2") && $("inUSDT2").value;
  const b = $("inBRN2") && $("inBRN2").value;
  if (!t || Number(t) <= 0) { toast("Informe USDT", "warn"); return; }
  if (!b || Number(b) <= 0) { toast("Informe BRN", "warn"); return; }
  await criarOrdem(TOKEN_USDT_ADDRESS, TOKEN_BRN_ADDRESS, ethers.utils.parseUnits(t, USDT_DECIMALS), ethers.utils.parseUnits(b, BRN_DECIMALS), "USDT");
  $("inUSDT2").value = ""; $("inBRN2").value = "";
}

async function executarOrdem(escrowAddr) {
  try {
    const o = ordersCache.find(x => x.endereco.toLowerCase() === escrowAddr.toLowerCase());
    if (!o) { toast("Ordem nao encontrada", "err"); return; }
    const allow = await lerAllowance(o.tokenDesejado, userAddress, escrowAddr);
    if (allow < o.valorDesejado) {
      toast("Aprovando token...", "info");
      const dataA = "0x" + SEL_ERC20.approve + encAddress(escrowAddr) + encUint(o.valorDesejado);
      const txA = await signer.sendTransaction({ to: o.tokenDesejado, data: dataA });
      await txA.wait();
    }
    toast("Executando...", "info");
    const tx = await signer.sendTransaction({ to: escrowAddr, data: "0x" + SEL_ESCROW.executar });
    await tx.wait();
    toast("Troca concluida!", "ok", 8000);
    await carregarSaldos();
    await carregarMural();
  } catch (e) { console.error(e); toast("Falha: " + (e.data && e.data.message || e.message), "err", 8000); }
}

async function cancelarOrdem(escrowAddr) {
  try {
    toast("Cancelando...", "info");
    const tx = await signer.sendTransaction({ to: escrowAddr, data: "0x" + SEL_ESCROW.cancelar });
    await tx.wait();
    toast("Cancelada.", "ok");
    await carregarSaldos();
    await carregarMural();
  } catch (e) { console.error(e); toast("Falha: " + (e.data && e.data.message || e.message), "err", 8000); }
}

async function enviarBRN() {
  if (!signer) { toast("Conecte a carteira", "warn"); return; }
  const dest = $("destAddress") && $("destAddress").value && $("destAddress").value.trim();
  const val = $("sendAmount") && $("sendAmount").value;
  if (!isValidAddress(dest)) { toast("Endereco invalido", "err"); return; }
  if (dest.toLowerCase() === userAddress.toLowerCase()) { toast("Destino igual a voce", "warn"); return; }
  if (!val || Number(val) <= 0) { toast("Valor invalido", "warn"); return; }
  try {
    const valor = ethers.utils.parseUnits(val, BRN_DECIMALS);
    const data = "0x" + SEL_ERC20.transfer + encAddress(dest) + encUint(valor);
    toast("Enviando " + val + " BRN...", "info");
    const tx = await signer.sendTransaction({ to: TOKEN_BRN_ADDRESS, data });
    await tx.wait();
    toast(val + " BRN enviado!", "ok", 8000);
    $("destAddress").value = ""; $("sendAmount").value = "";
    await carregarSaldos();
  } catch (e) { console.error(e); toast("Falha: " + (e.data && e.data.message || e.message), "err", 8000); }
}

function init() {
  if ($("btnConnect")) $("btnConnect").addEventListener("click", conectarCarteira);
  if ($("btnDisconnect")) $("btnDisconnect").addEventListener("click", desconectar);
  if ($("btnSendBRN")) $("btnSendBRN").addEventListener("click", enviarBRN);
  if ($("btnApprove1")) $("btnApprove1").addEventListener("click", aprovar1);
  if ($("btnCreate1")) $("btnCreate1").addEventListener("click", criar1);
  if ($("btnApprove2")) $("btnApprove2").addEventListener("click", aprovar2);
  if ($("btnCreate2")) $("btnCreate2").addEventListener("click", criar2);
  if ($("btnRefresh1")) $("btnRefresh1").addEventListener("click", carregarMural);
  if ($("btnRefresh2")) $("btnRefresh2").addEventListener("click", carregarMural);
  ["inBRN1","inUSDC1"].forEach(function(id) {
    if ($(id)) $(id).addEventListener("input", function() {
      const b = Number($("inBRN1").value || 0), u = Number($("inUSDC1").value || 0);
      const box = $("rate1");
      if (b > 0 && u > 0) { box.style.display = "block"; box.textContent = "1 BRN = " + (u/b).toLocaleString("pt-BR", { maximumFractionDigits: 6 }) + " USDC"; }
      else { box.style.display = "none"; }
    });
  });
  ["inUSDT2","inBRN2"].forEach(function(id) {
    if ($(id)) $(id).addEventListener("input", function() {
      const t = Number($("inUSDT2").value || 0), b = Number($("inBRN2").value || 0);
      const box = $("rate2");
      if (t > 0 && b > 0) { box.style.display = "block"; box.textContent = "1 USDT = " + (b/t).toLocaleString("pt-BR", { maximumFractionDigits: 6 }) + " BRN"; }
      else { box.style.display = "none"; }
    });
  });
  document.querySelectorAll(".tab").forEach(function(tab) {
    tab.addEventListener("click", function() {
      document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
      document.querySelectorAll(".tab-content").forEach(function(c) { c.classList.remove("active"); });
      tab.classList.add("active");
      const el = $("tab-" + tab.dataset.tab);
      if (el) el.classList.add("active");
    });
  });
  if (window.ethereum) {
    window.ethereum.request({ method: "eth_accounts" })
      .then(function(accs) { if (accs && accs.length) conectarCarteira(); })
      .catch(function() {});
  }
  carregarMural();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
