// ============================================================
// APP.JS — BRN Carteira & Trocas — Multi-token
// ============================================================
const ESCROW_FACTORY_ADDRESS = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;

// ⬇️ ADICIONAR NOVA MOEDA = ADICIONAR LINHA AQUI (contrato não muda)
const TOKENS = {
  BRN:  { address: "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210", decimals: 18, color: "brn",  nome: "BRN"  },
  USDC: { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6,  color: "usdc", nome: "USDC" },
  USDT: { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6,  color: "usdt", nome: "USDT" },
  DAI:  { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18, color: "dai",  nome: "DAI"  },
  WETH: { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18, color: "weth", nome: "WETH" },
  WBTC: { address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8,  color: "wbtc", nome: "WBTC" },
  LINK: { address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", decimals: 18, color: "link", nome: "LINK" },
  MATIC: { address: "0x0000000000000000000000000000000000001010", decimals: 18, color: "matic", nome: "MATIC" },
  AAVE:  { address: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", decimals: 18, color: "aave",  nome: "AAVE" },
  UNI:   { address: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f", decimals: 18, color: "uni",   nome: "UNI" },
  CRV:   { address: "0x172370d5Cd63279eFa6d502DAB29171933a610AF", decimals: 18, color: "crv",   nome: "CRV" },
  SUSHI: { address: "0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a", decimals: 18, color: "sushi", nome: "SUSHI" },
  GRT:   { address: "0x5fe2B58c013d7601147DcdD68C143A77499f5531", decimals: 18, color: "grt",   nome: "GRT" },
  BAL:   { address: "0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3", decimals: 18, color: "bal",   nome: "BAL" },
  COMP:  { address: "0x8505b9d2254A7Ae468c0E9dd10Ccea3A837aef5c", decimals: 18, color: "comp",  nome: "COMP" },
  MKR:   { address: "0x6f7C932e7684666C9fd1d44527765433e01fF61d", decimals: 18, color: "mkr",   nome: "MKR" },
  SAND:  { address: "0xBbba073C31bF03b8ACf7c28EF0738DeCF3695683", decimals: 18, color: "sand",  nome: "SAND" },
  MANA:  { address: "0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4", decimals: 18, color: "mana",  nome: "MANA" },
};

const FILTRO_TOKENS = ["todas", "BRN", "USDC", "USDT", "DAI", "WETH", "WBTC", "LINK", "MATIC", "AAVE", "UNI", "CRV", "SUSHI", "GRT", "BAL", "COMP", "MKR", "SAND", "MANA"];

const RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://1rpc.io/matic",
];
const RPC_TIMEOUT_MS = 15000;

const SEL_FACTORY = {
  criarOrdem:  "ceff4da6",
  totalOrdens: "8275d6fa",
  ordem:       "72c453b8",
  todasOrdens: "e9b1e327",
};
const SEL_ESCROW = {
  executado:      "2a3a5716",
  obterDados:     "32c9e06c",
  cancelado:      "7766a742",
  cancelar:       "8ffb1ccf",
  executar:       "b2d44d08",
};
const SEL_ERC20 = {
  transfer:  "a9059cbb",
  balanceOf: "70a08231",
  allowance: "dd62ed3e",
  approve:   "095ea7b3",
};

let provider = null, signer = null, userAddress = null;
let ordersCache = [];
let filtroAtual = "todas";

function $(id) { return document.getElementById(id); }
function short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—"; }
function fmt(v, dec, maxFrac) {
  try {
    if (!v) return "0";
    maxFrac = maxFrac || 6;
    const s = ethers.utils.formatUnits(v, dec);
    const n = Number(s);
    if (!isFinite(n)) return s;
    return n.toLocaleString("pt-BR", { maximumFractionDigits: maxFrac });
  } catch (e) { return String(v || "0"); }
}
function toast(msg, type, ms) {
  type = type || "info"; ms = ms || 5000;
  const box = $("toasts"); if (!box) return;
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.innerHTML = msg;
  box.appendChild(el);
  setTimeout(function(){ el.style.opacity = "0"; setTimeout(function(){ el.remove(); }, 300); }, ms);
}
function setNet(state, text) {
  const d = $("netDot"), t = $("netText");
  if (d) d.className = "dot " + (state === "ok" ? "" : state);
  if (t) t.textContent = text;
}
function isValidAddress(a) { return /^0x[a-fA-F0-9]{40}$/.test(a); }

function pad32(h) { return h.padStart(64, "0"); }
function encAddress(a) { return pad32(a.toLowerCase().replace(/^0x/, "")); }
function encUint(n) { return pad32(BigInt(n).toString(16)); }
function decAddress(w) { return "0x" + w.slice(24); }
function decUint(w) { return BigInt("0x" + w); }
function decBool(w) { return BigInt("0x" + w) !== 0n; }
function splitWords(hex) { const b = hex.replace(/^0x/, ""); const out = []; for (let i = 0; i < b.length; i += 64) out.push(b.slice(i, i + 64)); return out; }
function decAddressArray(hex) {
  const w = splitWords(hex); if (!w.length) return [];
  const off = Number(BigInt("0x" + w[0])); if (off >= w.length * 32) return [];
  const len = Number(BigInt("0x" + w[off / 32])); const arr = [];
  for (let i = 0; i < len; i++) { const idx = off / 32 + 1 + i; if (idx < w.length) arr.push(decAddress(w[idx])); }
  return arr;
}

async function withTimeout(p, ms, msg) {
  let t;
  const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg || "timeout")), ms); });
  try { return await Promise.race([p, to]); } finally { clearTimeout(t); }
}
async function pickProvider() {
  for (const url of RPCS) {
    try {
      const p = new ethers.providers.JsonRpcProvider(url);
      const net = await withTimeout(p.getNetwork(), 5000);
      if (net && Number(net.chainId) === POLYGON_CHAIN_ID) {
        try { await withTimeout(p.getBlockNumber(), 3000); return p; } catch (e) {}
      }
    } catch (e) {}
  }
  throw new Error("Nenhum RPC disponível. Recarregue.");
}
async function getProvider() { if (provider) return provider; provider = await pickProvider(); return provider; }
async function rawCall(to, data) { const p = await getProvider(); return await withTimeout(p.call({ to: to, data: data }), RPC_TIMEOUT_MS); }

function acharTokenPorEndereco(addr) {
  const a = addr.toLowerCase();
  for (const k in TOKENS) { if (TOKENS[k].address.toLowerCase() === a) return { key: k, meta: TOKENS[k] }; }
  return null;
}

async function carregarMural() {
  const box = $("orders"), counter = $("counter");
  if (box) box.innerHTML = '<div class="state"><div class="spinner"></div>Consultando…</div>';
  if (counter) counter.textContent = "⏳ Consultando…";
  setNet("load", "Consultando…");
  try {
    let addrs = [];
    try {
      const r = await rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.todasOrdens);
      addrs = decAddressArray(r);
    } catch (e) {
      const rT = await rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.totalOrdens);
      const n = Number(decUint(splitWords(rT)[0]));
      if (n > 0 && n < 200) {
        const rs = await Promise.all(Array.from({ length: n }, function(_, i) {
          return rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.ordem + encUint(i));
        }));
        addrs = rs.map(function(r) { return decAddress(splitWords(r)[0]); });
      }
    }
    const det = await Promise.all(addrs.map(async function(addr) {
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
    ordersCache = det;
    renderMural();
    setNet("ok", "Polygon · online");
  } catch (e) {
    console.error(e);
    if (box) box.innerHTML = '<div class="empty"><div class="big">⚠️</div>Não foi possível consultar.<br><small>' + e.message + '</small></div>';
    if (counter) counter.textContent = "❌ Falha";
    setNet("off", "Offline");
  }
}

function renderFiltros() {
  const el = $("filtros"); if (!el) return;
  const ativos = ordersCache.filter(function(o) { return !o.erro && !o.executado && !o.cancelado; });
  el.innerHTML = FILTRO_TOKENS.map(function(k) {
    let label = k === "todas" ? "🌐 Todas" : k;
    let count = 0;
    if (k !== "todas") {
      const addr = TOKENS[k] && TOKENS[k].address.toLowerCase();
      if (addr) count = ativos.filter(function(o) {
        return o.tokenOferecido.toLowerCase() === addr || o.tokenDesejado.toLowerCase() === addr;
      }).length;
    } else {
      count = ativos.length;
    }
    if (k !== "todas" && count === 0) return "";
    return '<button class="filtro ' + (filtroAtual === k ? "active" : "") + '" data-filtro="' + k + '">' + label + ' (' + count + ')</button>';
  }).join("");
  el.querySelectorAll(".filtro").forEach(function(b) {
    b.addEventListener("click", function() {
      filtroAtual = b.dataset.filtro;
      renderFiltros();
      renderMural();
    });
  });
}

function renderMural() {
  const box = $("orders"), counter = $("counter");
  if (!box) return;
  const validas = ordersCache.filter(function(o) { return !o.erro; });
    let filtradas = validas;
  if (filtroAtual !== "todas") {
    const addr = TOKENS[filtroAtual] && TOKENS[filtroAtual].address.toLowerCase();
    if (addr) filtradas = validas.filter(function(o) {
      return o.tokenOferecido.toLowerCase() === addr || o.tokenDesejado.toLowerCase() === addr;
    });
  }
  if (!filtradas.length) {
    box.innerHTML = '<div class="empty"><div class="big">📭</div>Nenhuma ordem neste par.</div>';
    if (counter) counter.textContent = "📋 0 ordens";
    return;
  }
  const rank = function(o) { return o.cancelado ? 2 : o.executado ? 1 : 0; };
  const sorted = filtradas.slice().sort(function(a, b) { return rank(a) - rank(b); });
  const ativas = sorted.filter(function(o) { return !o.executado && !o.cancelado; }).length;
  if (counter) counter.textContent = "📋 " + ativas + " ativa(s) · " + sorted.length + " no total";
  box.innerHTML = sorted.map(function(o, i) { return renderOrder(o, i); }).join("");
}

function renderOrder(o, i) {
  const mOf = acharTokenPorEndereco(o.tokenOferecido);
  const mDe = acharTokenPorEndereco(o.tokenDesejado);
  const nomeOf = mOf ? mOf.meta.nome : short(o.tokenOferecido);
  const nomeDe = mDe ? mDe.meta.nome : short(o.tokenDesejado);
  const decOf = mOf ? mOf.meta.decimals : 18;
  const decDe = mDe ? mDe.meta.decimals : 18;
  const clsOf = mOf ? mOf.meta.color : "";
  const clsDe = mDe ? mDe.meta.color : "";
  const status = o.cancelado ? "cancelled" : o.executado ? "done" : "active";
  const tagTxt = o.cancelado ? "Cancelada" : o.executado ? "Executada" : "Ativa";
  const podeExec = !o.executado && !o.cancelado && userAddress && userAddress.toLowerCase() !== o.criador.toLowerCase();
  const podeCanc = !o.executado && !o.cancelado && userAddress && userAddress.toLowerCase() === o.criador.toLowerCase();
  return '<div class="order ' + status + '">' +
    '<div class="order-top"><span class="order-id">#' + (i + 1) + ' · ' + short(o.endereco) + '</span><span class="tag ' + status + '">' + tagTxt + '</span></div>' +
    '<div class="swap">' +
      '<div class="side"><div class="lbl">Oferece</div><div class="amt ' + clsOf + '">' + fmt(o.valorOferecido, decOf) + ' ' + nomeOf + '</div></div>' +
      '<div class="arrow">⇄</div>' +
      '<div class="side"><div class="lbl">Pede</div><div class="amt ' + clsDe + '">' + fmt(o.valorDesejado, decDe) + ' ' + nomeDe + '</div></div>' +
    '</div>' +
    '<div class="order-meta"><span>Criador: <b>' + short(o.criador) + '</b></span><span>Escrow: <b>' + short(o.endereco) + '</b></span></div>' +
    '<div class="order-actions">' +
      (podeExec ? '<button class="btn-ok btn-sm" onclick="executarOrdem(\'' + o.endereco + '\')">⚡ Executar (pagar ' + fmt(o.valorDesejado, decDe) + ' ' + nomeDe + ')</button>' : '') +
      (podeCanc ? '<button class="btn-err btn-sm" onclick="cancelarOrdem(\'' + o.endereco + '\')">✖ Cancelar</button>' : '') +
      ((!podeExec && !podeCanc && !o.executado && !o.cancelado) ? '<span class="order-id">🔌 Conecte a carteira para interagir</span>' : '') +
    '</div>' +
  '</div>';
}

async function conectarCarteira() {
  if (!window.ethereum) { toast("MetaMask não encontrada.", "err", 8000); return; }
  try {
    toast("Solicitando conexão…", "info");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts.length) throw new Error("Nenhuma conta");
    userAddress = accounts[0];
    const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    if (parseInt(chainIdHex, 16) !== POLYGON_CHAIN_ID) {
      toast("Troque para Polygon…", "warn");
      try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x89" }] }); }
      catch (e) { if (e.code === 4902) { toast("Adicione Polygon manualmente", "err", 8000); return; } throw e; }
    }
    signer = new ethers.providers.Web3Provider(window.ethereum).getSigner();
    if ($("walletInfo")) $("walletInfo").style.display = "block";
    if ($("addr")) $("addr").textContent = userAddress;
    if ($("btnConnect")) { $("btnConnect").textContent = "✅ Conectado"; $("btnConnect").disabled = true; }
    if ($("btnDisconnect")) $("btnDisconnect").style.display = "inline-block";
    ["btnApprove","btnCreate","btnSendBRN"].forEach(function(id) { if ($(id)) $(id).disabled = false; });
    await carregarSaldos();
    renderMural();
    toast("✅ Conectado: " + short(userAddress), "ok");
    window.ethereum.on("accountsChanged", function() { location.reload(); });
    window.ethereum.on("chainChanged", function() { location.reload(); });
  } catch (e) { console.error(e); toast("Falha: " + (e.message || "erro"), "err", 8000); }
}

function desconectar() {
  userAddress = null; signer = null;
  if ($("walletInfo")) $("walletInfo").style.display = "none";
  if ($("btnConnect")) { $("btnConnect").textContent = "🔌 Conectar carteira"; $("btnConnect").disabled = false; }
  if ($("btnDisconnect")) $("btnDisconnect").style.display = "none";
  ["btnApprove","btnCreate","btnSendBRN"].forEach(function(id) { if ($(id)) $(id).disabled = true; });
  renderMural();
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
  const box = $("balances"); if (!box) return;
  try {
    const keys = Object.keys(TOKENS);
    const res = await Promise.all(keys.map(function(k) {
      return lerSaldo(TOKENS[k].address, userAddress).catch(function() { return 0n; });
    }));
    box.innerHTML = keys.map(function(k, i) {
      return '<span class="balance ' + TOKENS[k].color + '"><span>' + fmt(res[i], TOKENS[k].decimals, 4) + '</span> ' + k + '</span>';
    }).join("");
  } catch (e) { console.error("saldos:", e); }
}

function montarSelects() {
  const selOf = $("selOferece"), selQ = $("selQuero");
  if (!selOf || !selQ) return;
  const keys = Object.keys(TOKENS);
  const opts = keys.map(function(k) { return '<option value="' + k + '">' + TOKENS[k].nome + '</option>'; }).join("");
  selOf.innerHTML = opts;
  selQ.innerHTML = opts;
  selOf.value = "BRN";
  selQ.value = "USDC";
}

async function aprovar() {
  const kOf = $("selOferece").value;
  const v = $("inOferece").value;
  if (!v || Number(v) <= 0) { toast("Informe a quantidade a oferecer", "warn"); return; }
  const meta = TOKENS[kOf];
  const valor = ethers.utils.parseUnits(v, meta.decimals);
  const data = "0x" + SEL_ERC20.approve + encAddress(ESCROW_FACTORY_ADDRESS) + encUint(valor);
  toast("⏳ Aprovando " + kOf + "…", "info");
  try {
    const tx = await signer.sendTransaction({ to: meta.address, data: data });
    await tx.wait();
    toast("✅ " + kOf + " aprovado!", "ok");
  } catch (e) { console.error(e); toast("Falha: " + (e.data && e.data.message || e.message), "err", 8000); }
}

async function criarOrdem() {
  const kOf = $("selOferece").value, kQ = $("selQuero").value;
  const vOf = $("inOferece").value, vQ = $("inQuero").value;
  if (kOf === kQ) { toast("Escolha tokens diferentes", "warn"); return; }
  if (!vOf || Number(vOf) <= 0) { toast("Informe a quantidade oferecida", "warn"); return; }
  if (!vQ || Number(vQ) <= 0) { toast("Informe a quantidade desejada", "warn"); return; }
  const tOf = TOKENS[kOf], tQ = TOKENS[kQ];
  const valorOf = ethers.utils.parseUnits(vOf, tOf.decimals);
  const valorQ = ethers.utils.parseUnits(vQ, tQ.decimals);
  try {
    const allow = await lerAllowance(tOf.address, userAddress, ESCROW_FACTORY_ADDRESS);
    if (allow < valorOf) { toast("Aprove " + kOf + " primeiro", "warn", 6000); return; }
    const data = "0x" + SEL_FACTORY.criarOrdem + encAddress(tOf.address) + encAddress(tQ.address) + encUint(valorOf) + encUint(valorQ);
    toast("⏳ Criando ordem… confirme na MetaMask", "info");
    const tx = await signer.sendTransaction({ to: ESCROW_FACTORY_ADDRESS, data: data });
    toast("📤 TX: " + short(tx.hash), "info");
    await tx.wait();
    toast("✅ Ordem criada!", "ok");
    $("inOferece").value = ""; $("inQuero").value = "";
    await carregarSaldos();
    await carregarMural();
  } catch (e) { console.error(e); toast("Falha: " + (e.data && e.data.message || e.message), "err", 8000); }
}

async function executarOrdem(escrowAddr) {
  try {
    const o = ordersCache.find(function(x) { return x.endereco.toLowerCase() === escrowAddr.toLowerCase(); });
    if (!o) { toast("Ordem não encontrada", "err"); return; }
    const allow = await lerAllowance(o.tokenDesejado, userAddress, escrowAddr);
    if (allow < o.valorDesejado) {
      toast("⏳ Aprovando token desejado…", "info");
      const dataA = "0x" + SEL_ERC20.approve + encAddress(escrowAddr) + encUint(o.valorDesejado);
      const txA = await signer.sendTransaction({ to: o.tokenDesejado, data: dataA });
      await txA.wait();
    }
    toast("⏳ Executando…", "info");
    const tx = await signer.sendTransaction({ to: escrowAddr, data: "0x" + SEL_ESCROW.executar });
    await tx.wait();
    toast("✅ Troca concluída!", "ok", 8000);
    await carregarSaldos();
    await carregarMural();
  } catch (e) { console.error(e); toast("Falha: " + (e.data && e.data.message || e.message), "err", 8000); }
}

async function cancelarOrdem(escrowAddr) {
  try {
    toast("⏳ Cancelando…", "info");
    const tx = await signer.sendTransaction({ to: escrowAddr, data: "0x" + SEL_ESCROW.cancelar });
    await tx.wait();
    toast("✅ Cancelada.", "ok");
    await carregarSaldos();
    await carregarMural();
  } catch (e) { console.error(e); toast("Falha: " + (e.data && e.data.message || e.message), "err", 8000); }
}

async function enviarBRN() {
  if (!signer) { toast("Conecte a carteira", "warn"); return; }
  const dest = $("destAddress").value.trim();
  const val = $("sendAmount").value;
  if (!isValidAddress(dest)) { toast("Endereço inválido", "err"); return; }
  if (dest.toLowerCase() === userAddress.toLowerCase()) { toast("Destino = você mesmo", "warn"); return; }
  if (!val || Number(val) <= 0) { toast("Valor inválido", "warn"); return; }
  try {
    const valor = ethers.utils.parseUnits(val, TOKENS.BRN.decimals);
    const data = "0x" + SEL_ERC20.transfer + encAddress(dest) + encUint(valor);
    toast("⏳ Enviando " + val + " BRN…", "info");
    const tx = await signer.sendTransaction({ to: TOKENS.BRN.address, data: data });
    await tx.wait();
    toast("✅ " + val + " BRN enviado!", "ok", 8000);
    $("destAddress").value = ""; $("sendAmount").value = "";
    await carregarSaldos();
  } catch (e) { console.error(e); toast("Falha: " + (e.data && e.data.message || e.message), "err", 8000); }
}

function atualizarCotacao() {
  const kOf = $("selOferece").value, kQ = $("selQuero").value;
  const vOf = Number($("inOferece").value || 0), vQ = Number($("inQuero").value || 0);
  const box = $("rateInfo");
  if (vOf > 0 && vQ > 0) {
    const r = vQ / vOf;
    box.style.display = "block";
    box.textContent = "💱 1 " + kOf + " = " + r.toLocaleString("pt-BR", { maximumFractionDigits: 6 }) + " " + kQ;
  } else { box.style.display = "none"; }
}

function init() {
  if ($("btnConnect")) $("btnConnect").addEventListener("click", conectarCarteira);
  if ($("btnDisconnect")) $("btnDisconnect").addEventListener("click", desconectar);
  if ($("btnSendBRN")) $("btnSendBRN").addEventListener("click", enviarBRN);
  if ($("btnApprove")) $("btnApprove").addEventListener("click", aprovar);
  if ($("btnCreate")) $("btnCreate").addEventListener("click", criarOrdem);
  if ($("btnRefresh")) $("btnRefresh").addEventListener("click", carregarMural);

  ["selOferece","selQuero","inOferece","inQuero"].forEach(function(id) {
    if ($(id)) $(id).addEventListener("input", atualizarCotacao);
    if ($(id)) $(id).addEventListener("change", atualizarCotacao);
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

  montarSelects();
  renderFiltros();

  if (window.ethereum) {
    window.ethereum.request({ method: "eth_accounts" })
      .then(function(accs) { if (accs && accs.length) conectarCarteira(); })
      .catch(function() {});
  }
  carregarMural();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
