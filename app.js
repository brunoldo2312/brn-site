// ============================================================
// APP.JS — BRN Carteira & Trocas — Multi-token (v4)
// Simulação prévia (callStatic) + gas manual de fallback
// ============================================================
const ESCROW_FACTORY_ADDRESS = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const POLYGON_CHAIN_ID = 137;
const POLYGON_CHAIN_HEX = "0x89";

const POL_NATIVO = { symbol: "POL", nome: "POL", decimals: 18, native: true };

const TOKENS = {
  BRN:  { address: "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210", decimals: 18, color: "brn",  nome: "BRN"  },
  USDC: { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6,  color: "usdc", nome: "USDC" },
  USDT: { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6,  color: "usdt", nome: "USDT" },
  DAI:  { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18, color: "dai",  nome: "DAI"  },
  WETH: { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18, color: "weth", nome: "WETH" },
  WBTC: { address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8,  color: "wbtc", nome: "WBTC" },
  LINK: { address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", decimals: 18, color: "link", nome: "LINK" },
  MATIC:{ address: "0x0000000000000000000000000000000000001010", decimals: 18, color: "matic",nome: "MATIC"},
  AAVE: { address: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", decimals: 18, color: "aave", nome: "AAVE" },
  UNI:  { address: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f", decimals: 18, color: "uni",  nome: "UNI"  },
  CRV:  { address: "0x172370d5Cd63279eFa6d502DAB29171933a610AF", decimals: 18, color: "crv",  nome: "CRV"  },
  SUSHI:{ address: "0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a", decimals: 18, color: "sushi",nome: "SUSHI"},
  GRT:  { address: "0x5fe2B58c013d7601147DcdD68C143A77499f5531", decimals: 18, color: "grt",  nome: "GRT"  },
  BAL:  { address: "0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3", decimals: 18, color: "bal",  nome: "BAL"  },
  COMP: { address: "0x8505b9d2254A7Ae468c0E9dd10Ccea3A837aef5c", decimals: 18, color: "comp", nome: "COMP" },
  MKR:  { address: "0x6f7C932e7684666C9fd1d44527765433e01fF61d", decimals: 18, color: "mkr",  nome: "MKR"  },
  SAND: { address: "0xBbba073C31bF03b8ACf7c28EF0738DeCF3695683", decimals: 18, color: "sand", nome: "SAND" },
  MANA: { address: "0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4", decimals: 18, color: "mana", nome: "MANA" },
};

const FILTRO_TOKENS = ["todas", ...Object.keys(TOKENS)];

const RPCS = [
  "https://polygon-rpc.com",
  "https://polygon.llamarpc.com",
  "https://rpc.ankr.com/polygon",
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
];
const RPC_TIMEOUT_MS = 20000;

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
let providerDescricao = "";

/* ============ HELPERS ============ */
function $(id) { return document.getElementById(id); }
function short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—"; }

function fmt(v, dec, maxFrac) {
  try {
    if (v === undefined || v === null) return "0";
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
  setTimeout(function () {
    el.style.opacity = "0";
    setTimeout(function () { el.remove(); }, 300);
  }, ms);
}

function setNet(state, text) {
  const d = $("netDot"), t = $("netText");
  if (d) d.className = "dot " + (state === "ok" ? "on" : state);
  if (t) t.textContent = text;
}

function isValidAddress(a) { return /^0x[a-fA-F0-9]{40}$/.test(a); }

/* ============ ABI ENCODE (RAW) ============ */
function pad32(h) { return h.padStart(64, "0"); }
function encAddress(a) { return pad32(a.toLowerCase().replace(/^0x/, "")); }
function encUint(n) { return pad32(BigInt(n).toString(16)); }
function decAddress(w) { return "0x" + w.slice(24); }
function decUint(w) { return BigInt("0x" + w); }
function decBool(w) { return BigInt("0x" + w) !== 0n; }

function splitWords(hex) {
  const b = hex.replace(/^0x/, ""); const out = [];
  for (let i = 0; i < b.length; i += 64) out.push(b.slice(i, i + 64));
  return out;
}

function decAddressArray(hex) {
  const w = splitWords(hex); if (!w.length) return [];
  const off = Number(BigInt("0x" + w[0])); if (off >= w.length * 32) return [];
  const len = Number(BigInt("0x" + w[off / 32])); const arr = [];
  for (let i = 0; i < len; i++) {
    const idx = off / 32 + 1 + i;
    if (idx < w.length) arr.push(decAddress(w[idx]));
  }
  return arr;
}

/* ============================================================
   PROVIDER
   ============================================================ */
async function withTimeout(p, ms, msg) {
  let t;
  const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg || "timeout")), ms); });
  try { return await Promise.race([p, to]); } finally { clearTimeout(t); }
}

async function pickProvider() {
  const erros = [];

  // 1) MetaMask
  if (window.ethereum) {
    try {
      const mmProvider = new ethers.providers.Web3Provider(window.ethereum);
      const net = await withTimeout(mmProvider.getNetwork(), 5000);
      if (Number(net.chainId) === POLYGON_CHAIN_ID) {
        const bn = await withTimeout(mmProvider.getBlockNumber(), 5000);
        if (bn > 0) {
          providerDescricao = "MetaMask";
          console.log("✅ Provider: MetaMask | bloco:", bn);
          return mmProvider;
        }
      } else {
        erros.push("MetaMask (chainId " + Number(net.chainId) + ")");
      }
    } catch (e) { erros.push("MetaMask"); }
  }

  // 2) RPCs públicos
  for (const url of RPCS) {
    const curto = url.replace(/^https?:\/\//, "").split("/")[0];
    try {
      const p = new ethers.providers.JsonRpcProvider({ url: url, timeout: 8000 }, POLYGON_CHAIN_ID);
      const bn = await withTimeout(p.getBlockNumber(), 9000);
      if (bn > 0) {
        providerDescricao = curto;
        console.log("✅ Provider: RPC " + curto);
        return p;
      }
    } catch (e) { erros.push(curto); }
  }

  throw new Error("Nenhum provider disponível: " + erros.join(", "));
}

async function getProvider() {
  if (provider) return provider;
  setNet("load", "Conectando…");
  provider = await pickProvider();
  setNet("ok", "Polygon · " + providerDescricao);
  return provider;
}

function resetProvider() { provider = null; providerDescricao = ""; }

async function rawCall(to, data) {
  const p = await getProvider();
  return await withTimeout(p.call({ to: to, data: data }), RPC_TIMEOUT_MS, "eth_call");
}

function acharTokenPorEndereco(addr) {
  const a = addr.toLowerCase();
  for (const k in TOKENS) if (TOKENS[k].address.toLowerCase() === a) return { key: k, meta: TOKENS[k] };
  return null;
}

/* ============================================================
   SIMULAÇÃO PRÉVIA + ENVIO COM GAS RESERVA
   ============================================================
   O erro "UNPREDICTABLE_GAS_LIMIT" acontece quando o contrato
   reverte silenciosamente. Aqui simulamos com callStatic e, se
   passar, mandamos com gas fixo para não depender da MetaMask.
   ============================================================ */
async function simular(to, data, value) {
  const p = await getProvider();
  try {
    await p.call({ to: to, data: data, value: value || 0 });
    return { ok: true };
  } catch (e) {
    // Tenta extrair motivo do revert
    const msg =
      (e.data && e.data.message) ||
      (e.error && e.error.message) ||
      e.reason ||
      e.message ||
      "revert sem mensagem";
    return { ok: false, motivo: String(msg) };
  }
}

async function enviarTx(to, data, value, gasEstimado) {
  // 1) Simula primeiro para pegar revert
  const sim = await simular(to, data, value);
  if (!sim.ok) {
    throw new Error("A transação vai reverter: " + sim.motivo);
  }

  // 2) Envia com gas fixo (evita UNPREDICTABLE_GAS_LIMIT)
  const gas = gasEstimado || 500000;
  const tx = await signer.sendTransaction({ to: to, data: data, value: value || 0, gasLimit: gas });
  return tx;
}

/* ============================================================
   MURAL
   ============================================================ */
async function carregarMural() {
  const box = $("orders"), counter = $("counter");
  if (box) box.innerHTML = '<div class="state"><div class="spinner"></div>Consultando…</div>';
  if (counter) counter.textContent = "⏳ Consultando…";
  setNet("load", "Consultando…");

  try {
    await getProvider();
    let addrs = [];
    try {
      const r = await rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.todasOrdens);
      addrs = decAddressArray(r);
    } catch (e) {
      const rT = await rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.totalOrdens);
      const n = Number(decUint(splitWords(rT)[0]));
      if (n > 0 && n < 200) {
        const rs = await Promise.all(Array.from({ length: n }, (_, i) =>
          rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.ordem + encUint(i))
        ));
        addrs = rs.map(r => decAddress(splitWords(r)[0]));
      }
    }

    const det = await Promise.all(addrs.map(async function (addr) {
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
    setNet("ok", "Polygon · " + providerDescricao);
  } catch (e) {
    console.error("Mural falhou:", e);
    resetProvider();
    if (box) box.innerHTML =
      '<div class="empty"><div class="big">⚠️</div>Não foi possível consultar.<br>' +
      '<small>' + e.message + '</small><br>' +
      '<button class="btn-warn btn-sm" style="margin-top:16px;" onclick="resetProvider();carregarMural();">🔄 Tentar novamente</button></div>';
    if (counter) counter.textContent = "❌ Offline";
    setNet("off", "Offline");
  }
}

function renderFiltros() {
  const el = $("filtros"); if (!el) return;
  const ativos = ordersCache.filter(o => !o.erro && !o.executado && !o.cancelado);
  el.innerHTML = FILTRO_TOKENS.map(function (k) {
    let count = 0;
    if (k === "todas") count = ativos.length;
    else {
      const addr = TOKENS[k] && TOKENS[k].address.toLowerCase();
      if (addr) count = ativos.filter(o =>
        o.tokenOferecido.toLowerCase() === addr || o.tokenDesejado.toLowerCase() === addr
      ).length;
    }
    return '<button class="filtro ' + (filtroAtual === k ? "active" : "") +
      '" data-filtro="' + k + '">' + (k === "todas" ? "🌐 Todas" : k) + ' (' + count + ')</button>';
  }).join("");
  el.querySelectorAll(".filtro").forEach(b => b.addEventListener("click", function () {
    filtroAtual = b.dataset.filtro; renderFiltros(); renderMural();
  }));
}

function renderMural() {
  renderFiltros();
  const box = $("orders"), counter = $("counter");
  if (!box) return;
  const validas = ordersCache.filter(o => !o.erro);
  let filtradas = validas;
  if (filtroAtual !== "todas") {
    const addr = TOKENS[filtroAtual] && TOKENS[filtroAtual].address.toLowerCase();
    if (addr) filtradas = validas.filter(o =>
      o.tokenOferecido.toLowerCase() === addr || o.tokenDesejado.toLowerCase() === addr
    );
  }
  if (!filtradas.length) {
    box.innerHTML = '<div class="empty"><div class="big">📭</div>Nenhuma ordem neste par.</div>';
    if (counter) counter.textContent = "📋 0 ordens";
    return;
  }
  const rank = o => o.cancelado ? 2 : o.executado ? 1 : 0;
  const sorted = filtradas.slice().sort((a, b) => rank(a) - rank(b));
  const ativas = sorted.filter(o => !o.executado && !o.cancelado).length;
  if (counter) counter.textContent = "📋 " + ativas + " ativa(s) · " + sorted.length + " total";
  box.innerHTML = sorted.map((o, i) => renderOrder(o, i)).join("");
}

function renderOrder(o, i) {
  const mOf = acharTokenPorEndereco(o.tokenOferecido);
  const mDe = acharTokenPorEndereco(o.tokenDesejado);
  const nomeOf = mOf ? mOf.meta.nome : short(o.tokenOferecido);
  const nomeDe = mDe ? mDe.meta.nome : short(o.tokenDesejado);
  const decOf  = mOf ? mOf.meta.decimals : 18;
  const decDe  = mDe ? mDe.meta.decimals : 18;
  const clsOf  = mOf ? mOf.meta.color : "";
  const clsDe  = mDe ? mDe.meta.color : "";
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
      (podeExec ? '<button class="btn-ok btn-sm" onclick="executarOrdem(\'' + o.endereco + '\')">⚡ Executar (' + fmt(o.valorDesejado, decDe) + ' ' + nomeDe + ')</button>' : '') +
      (podeCanc ? '<button class="btn-err btn-sm" onclick="cancelarOrdem(\'' + o.endereco + '\')">✖ Cancelar</button>' : '') +
      ((!podeExec && !podeCanc && !o.executado && !o.cancelado) ? '<span class="order-id">🔌 Conecte a carteira para interagir</span>' : '') +
    '</div>' +
  '</div>';
}

/* ============================================================
   CONEXÃO
   ============================================================ */
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
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: POLYGON_CHAIN_HEX }] });
      } catch (e) {
        if (e.code === 4902) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: POLYGON_CHAIN_HEX,
                chainName: "Polygon Mainnet",
                nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
                rpcUrls: ["https://polygon-rpc.com"],
                blockExplorerUrls: ["https://polygonscan.com"],
              }],
            });
          } catch (e2) { toast("Adicione Polygon manualmente", "err", 8000); return; }
        } else throw e;
      }
    }

    signer = new ethers.providers.Web3Provider(window.ethereum).getSigner();
    resetProvider();

    if ($("walletInfo")) $("walletInfo").style.display = "block";
    if ($("addr")) $("addr").textContent = userAddress;
    if ($("receiveAddr")) $("receiveAddr").value = userAddress;
    if ($("btnConnect")) { $("btnConnect").textContent = "✅ Conectado"; $("btnConnect").disabled = true; }
    if ($("btnDisconnect")) $("btnDisconnect").style.display = "inline-block";
    ["btnApprove", "btnCreate", "btnSendBRN"].forEach(id => { if ($(id)) $(id).disabled = false; });

    await carregarMural();
    await carregarSaldos();
    await atualizarApproveStatus();
    toast("✅ Conectado: " + short(userAddress), "ok");

    window.ethereum.on("accountsChanged", () => location.reload());
    window.ethereum.on("chainChanged",   () => location.reload());
  } catch (e) {
    console.error(e);
    toast("Falha: " + (e.message || "erro"), "err", 8000);
  }
}

function desconectar() {
  userAddress = null; signer = null;
  if ($("walletInfo")) $("walletInfo").style.display = "none";
  if ($("btnConnect")) { $("btnConnect").textContent = "🔌 Conectar carteira"; $("btnConnect").disabled = false; }
  if ($("btnDisconnect")) $("btnDisconnect").style.display = "none";
  if ($("receiveAddr")) $("receiveAddr").value = "";
  ["btnApprove", "btnCreate", "btnSendBRN"].forEach(id => { if ($(id)) $(id).disabled = true; });
  if ($("balances")) $("balances").innerHTML = '<div class="empty">🔌 Conecte a carteira para ver os saldos.</div>';
  renderMural();
  toast("Desconectado", "info");
}

/* ============================================================
   SALDOS + ATIVAR
   ============================================================ */
async function lerSaldo(token, addr) {
  const r = await rawCall(token, "0x" + SEL_ERC20.balanceOf + encAddress(addr));
  return decUint(splitWords(r)[0]);
}
async function lerAllowance(token, owner, spender) {
  const r = await rawCall(token, "0x" + SEL_ERC20.allowance + encAddress(owner) + encAddress(spender));
  return decUint(splitWords(r)[0]);
}
async function lerSaldoPOL(addr) {
  const p = await getProvider();
  return await p.getBalance(addr);
}

async function carregarSaldos() {
  const box = $("balances"); if (!box || !userAddress) return;
  box.innerHTML = '<div class="state"><div class="spinner"></div>Carregando saldos…</div>';
  try {
    const keys = Object.keys(TOKENS);
    const [polBal, saldos, allowances] = await Promise.all([
      lerSaldoPOL(userAddress).catch(() => 0n),
      Promise.all(keys.map(k => lerSaldo(TOKENS[k].address, userAddress).catch(() => 0n))),
      Promise.all(keys.map(k => lerAllowance(TOKENS[k].address, userAddress, ESCROW_FACTORY_ADDRESS).catch(() => 0n))),
    ]);
    let html = `
      <div class="balance-card">
        <div class="balance-head">
          <span class="coin pol">POL</span>
          <span class="badge ok">nativo</span>
        </div>
        <div class="balance-value">${fmt(polBal, 18, 6)}</div>
        <div class="balance-addr">Polygon (nativo) · não precisa ativar</div>
      </div>`;
    html += keys.map((k, i) => {
      const t = TOKENS[k];
      const ativado = allowances[i] > 0n;
      return `
        <div class="balance-card">
          <div class="balance-head">
            <span class="coin ${t.color}">${k}</span>
            <span class="badge ${ativado ? 'ok' : 'off'}">${ativado ? 'ativado' : 'inativo'}</span>
          </div>
          <div class="balance-value">${fmt(saldos[i], t.decimals, 6)}</div>
          <div class="balance-addr">${t.address}</div>
          ${!ativado ? `<button class="btn-warn btn-xs" onclick="ativarToken('${k}')">Ativar ${k}</button>` : ''}
        </div>`;
    }).join("");
    box.innerHTML = html;
  } catch (e) { console.error("saldos:", e); }
}

async function ativarToken(k) {
  if (!signer) { toast("Conecte a carteira", "warn"); return; }
  const meta = TOKENS[k]; if (!meta) return;
  const max = ethers.constants.MaxUint256;
  const data = "0x" + SEL_ERC20.approve + encAddress(ESCROW_FACTORY_ADDRESS) + encUint(max);
  try {
    toast("⏳ Ativando " + k + "…", "info");
    const tx = await enviarTx(meta.address, data, 0, 100000);
    await tx.wait();
    toast("✅ " + k + " ativado!", "ok");
    await carregarSaldos();
    await atualizarApproveStatus();
  } catch (e) {
    console.error(e);
    toast("Falha: " + (e.data && e.data.message || e.message), "err", 9000);
  }
}

/* ============================================================
   ENVIAR
   ============================================================ */
async function enviarToken() {
  if (!signer) { toast("Conecte a carteira", "warn"); return; }
  const kSimbolo = $("selTokenSend") ? $("selTokenSend").value : "BRN";
  const dest = $("destAddress").value.trim();
  const val  = $("sendAmount").value;
  if (!isValidAddress(dest)) { toast("Endereço inválido", "err"); return; }
  if (dest.toLowerCase() === userAddress.toLowerCase()) { toast("Destino = você mesmo", "warn"); return; }
  if (!val || Number(val) <= 0) { toast("Valor inválido", "warn"); return; }

  try {
    if (kSimbolo === "POL") {
      toast("⏳ Enviando POL…", "info");
      const tx = await signer.sendTransaction({
        to: dest,
        value: ethers.utils.parseUnits(val, 18),
        gasLimit: 30000,
      });
      await tx.wait();
      toast("✅ " + val + " POL enviado!", "ok", 8000);
    } else {
      const meta = TOKENS[kSimbolo];
      const valor = ethers.utils.parseUnits(val, meta.decimals);
      const data = "0x" + SEL_ERC20.transfer + encAddress(dest) + encUint(valor);
      toast("⏳ Enviando " + val + " " + kSimbolo + "…", "info");
      const tx = await enviarTx(meta.address, data, 0, 100000);
      await tx.wait();
      toast("✅ " + val + " " + kSimbolo + " enviado!", "ok", 8000);
    }
    $("destAddress").value = "";
    $("sendAmount").value = "";
    if ($("sendInfo")) $("sendInfo").style.display = "none";
    await carregarSaldos();
  } catch (e) {
    console.error(e);
    toast("Falha: " + (e.data && e.data.message || e.message), "err", 9000);
  }
}
async function enviarBRN() { return enviarToken(); }

function atualizarSendInfo() {
  const box = $("sendInfo"); if (!box) return;
  const k = $("selTokenSend").value;
  const v = Number($("sendAmount").value || 0);
  const d = $("destAddress").value.trim();
  if (v > 0 && d) {
    box.style.display = "block";
    box.innerHTML = `Enviando <b>${v} ${k}</b> para <b>${short(d)}</b>`;
  } else box.style.display = "none";
}

/* ============================================================
   SELECTS
   ============================================================ */
function montarSelects() {
  const keys = Object.keys(TOKENS);
  const optsErc = keys.map(k => '<option value="' + k + '">' + TOKENS[k].nome + '</option>').join("");
  const selOf = $("selOferece"), selQ = $("selQuero");
  if (selOf && selQ) {
    selOf.innerHTML = optsErc;
    selQ.innerHTML  = optsErc;
    selOf.value = "BRN";
    selQ.value  = "USDC";
  }
  const selSend = $("selTokenSend");
  if (selSend) selSend.innerHTML = '<option value="POL">POL (nativo)</option>' + optsErc;
}

/* ============================================================
   APROVAR + CRIAR ORDEM
   ============================================================ */
async function aprovar() {
  if (!signer) { toast("Conecte a carteira", "warn"); return; }
  const kOf = $("selOferece").value;
  const v   = $("inOferece").value;
  if (!v || Number(v) <= 0) { toast("Informe a quantidade a oferecer", "warn"); return; }
  const meta = TOKENS[kOf];
  const valor = ethers.utils.parseUnits(v, meta.decimals);
  const data = "0x" + SEL_ERC20.approve + encAddress(ESCROW_FACTORY_ADDRESS) + encUint(valor);
  try {
    toast("⏳ Aprovando " + kOf + "…", "info");
    const tx = await enviarTx(meta.address, data, 0, 100000);
    await tx.wait();
    toast("✅ " + kOf + " aprovado!", "ok");
    await carregarSaldos();
    await atualizarApproveStatus();
  } catch (e) {
    console.error(e);
    toast("Falha: " + (e.data && e.data.message || e.message), "err", 9000);
  }
}

async function criarOrdem() {
  if (!signer) { toast("Conecte a carteira", "warn"); return; }

  const kOf = $("selOferece").value, kQ = $("selQuero").value;
  const vOf = $("inOferece").value, vQ = $("inQuero").value;

  if (kOf === kQ) { toast("Escolha tokens diferentes", "warn"); return; }
  if (!vOf || Number(vOf) <= 0) { toast("Informe a quantidade oferecida", "warn"); return; }
  if (!vQ  || Number(vQ)  <= 0) { toast("Informe a quantidade desejada", "warn"); return; }

  const tOf = TOKENS[kOf], tQ = TOKENS[kQ];
  const valorOf = ethers.utils.parseUnits(vOf, tOf.decimals);
  const valorQ  = ethers.utils.parseUnits(vQ,  tQ.decimals);

  try {
    // 1) Checa saldo
    const saldoOf = await lerSaldo(tOf.address, userAddress);
    if (saldoOf < valorOf) {
      toast("❌ Saldo insuficiente de " + kOf + " (tem " + fmt(saldoOf, tOf.decimals) + ")", "err", 8000);
      return;
    }

    // 2) Checa allowance
    const allow = await lerAllowance(tOf.address, userAddress, ESCROW_FACTORY_ADDRESS);
    if (allow < valorOf) {
      toast("⚠️ Aprove " + kOf + " primeiro (allowance insuficiente)", "warn", 7000);
      return;
    }

    // 3) Monta calldata
    const data = "0x" + SEL_FACTORY.criarOrdem
      + encAddress(tOf.address) + encAddress(tQ.address)
      + encUint(valorOf) + encUint(valorQ);

    // 4) Simula + envia (com gas manual)
    toast("⏳ Simulando transação…", "info");
    const tx = await enviarTx(ESCROW_FACTORY_ADDRESS, data, 0, 800000);
    toast("📤 TX: " + short(tx.hash), "info");
    await tx.wait();
    toast("✅ Ordem criada!", "ok");

    $("inOferece").value = "";
    $("inQuero").value = "";
    if ($("rateInfo")) $("rateInfo").style.display = "none";
    await carregarSaldos();
    await carregarMural();
  } catch (e) {
    console.error(e);
    const motivo = (e.data && e.data.message) || e.reason || e.message;
    toast("❌ " + motivo, "err", 10000);
  }
}

async function atualizarApproveStatus() {
  const el = $("approveStatus"); if (!el || !userAddress) return;
  const kOf = $("selOferece") ? $("selOferece").value : "BRN";
  const meta = TOKENS[kOf]; if (!meta) { el.style.display = "none"; return; }
  try {
    const allow = await lerAllowance(meta.address, userAddress, ESCROW_FACTORY_ADDRESS);
    el.style.display = "block";
    if (allow > 0n) {
      el.className = "approve-status ok";
      el.innerHTML = `✅ <b>${kOf}</b> já está ativado para o contrato de ordens.`;
    } else {
      el.className = "approve-status off";
      el.innerHTML = `⚠️ <b>${kOf}</b> ainda não foi ativado. Clique em <b>Ativar token</b>.`;
    }
  } catch { el.style.display = "none"; }
}

/* ============================================================
   EXECUTAR / CANCELAR
   ============================================================ */
async function executarOrdem(escrowAddr) {
  if (!signer) { toast("Conecte a carteira", "warn"); return; }
  try {
    const o = ordersCache.find(x => x.endereco.toLowerCase() === escrowAddr.toLowerCase());
    if (!o) { toast("Ordem não encontrada", "err"); return; }

    // 1) Saldo do token desejado
    const saldo = await lerSaldo(o.tokenDesejado, userAddress);
    if (saldo < o.valorDesejado) {
      toast("❌ Você não tem saldo suficiente do token desejado", "err", 8000);
      return;
    }

    // 2) Allowance para o escrow
    const allow = await lerAllowance(o.tokenDesejado, userAddress, escrowAddr);
    if (allow < o.valorDesejado) {
      toast("⏳ Aprovando token desejado para o escrow…", "info");
      const dataA = "0x" + SEL_ERC20.approve + encAddress(escrowAddr) + encUint(o.valorDesejado);
      const txA = await enviarTx(o.tokenDesejado, dataA, 0, 100000);
      await txA.wait();
    }

    // 3) Executa
    toast("⏳ Executando troca…", "info");
    const tx = await enviarTx(escrowAddr, "0x" + SEL_ESCROW.executar, 0, 400000);
    await tx.wait();
    toast("✅ Troca concluída!", "ok", 8000);
    await carregarSaldos();
    await carregarMural();
  } catch (e) {
    console.error(e);
    const motivo = (e.data && e.data.message) || e.reason || e.message;
    toast("❌ " + motivo, "err", 10000);
  }
}

async function cancelarOrdem(escrowAddr) {
  if (!signer) { toast("Conecte a carteira", "warn"); return; }
  try {
    toast("⏳ Cancelando…", "info");
    const tx = await enviarTx(escrowAddr, "0x" + SEL_ESCROW.cancelar, 0, 200000);
    await tx.wait();
    toast("✅ Cancelada.", "ok");
    await carregarSaldos();
    await carregarMural();
  } catch (e) {
    console.error(e);
    const motivo = (e.data && e.data.message) || e.reason || e.message;
    toast("❌ " + motivo, "err", 10000);
  }
}

/* ============================================================
   COTAÇÃO
   ============================================================ */
function atualizarCotacao() {
  const kOf = $("selOferece").value, kQ = $("selQuero").value;
  const vOf = Number($("inOferece").value || 0), vQ = Number($("inQuero").value || 0);
  const box = $("rateInfo");
  if (vOf > 0 && vQ > 0 && kOf !== kQ) {
    const r = vQ / vOf;
    box.style.display = "block";
    box.textContent = "💱 1 " + kOf + " = " + r.toLocaleString("pt-BR", { maximumFractionDigits: 6 }) + " " + kQ;
  } else box.style.display = "none";
  const ok = userAddress && vOf > 0 && vQ > 0 && kOf !== kQ;
  if ($("btnApprove")) $("btnApprove").disabled = !ok;
  if ($("btnCreate"))  $("btnCreate").disabled  = !ok;
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  if ($("btnConnect"))    $("btnConnect").addEventListener("click", conectarCarteira);
  if ($("btnDisconnect")) $("btnDisconnect").addEventListener("click", desconectar);
  if ($("btnSendBRN"))    $("btnSendBRN").addEventListener("click", enviarToken);
  if ($("btnApprove"))    $("btnApprove").addEventListener("click", aprovar);
  if ($("btnCreate"))     $("btnCreate").addEventListener("click", criarOrdem);
  if ($("btnRefresh"))    $("btnRefresh").addEventListener("click", function () { resetProvider(); carregarMural(); });
  if ($("btnRefreshBal")) $("btnRefreshBal").addEventListener("click", carregarSaldos);

  if ($("btnCopyAddr")) $("btnCopyAddr").addEventListener("click", function () {
    const a = $("receiveAddr").value;
    if (!a) { toast("Conecte a carteira", "warn"); return; }
    navigator.clipboard.writeText(a).then(() => toast("Endereço copiado!", "ok"));
  });

  ["selOferece", "selQuero", "inOferece", "inQuero"].forEach(function (id) {
    if ($(id)) {
      $(id).addEventListener("input",  function () { atualizarCotacao(); atualizarApproveStatus(); });
      $(id).addEventListener("change", function () { atualizarCotacao(); atualizarApproveStatus(); });
    }
  });

  ["selTokenSend", "sendAmount", "destAddress"].forEach(function (id) {
    if ($(id)) {
      $(id).addEventListener("input",  atualizarSendInfo);
      $(id).addEventListener("change", atualizarSendInfo);
    }
  });

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      const el = $("tab-" + tab.dataset.tab);
      if (el) el.classList.add("active");
      if (tab.dataset.tab === "saldos" && userAddress) carregarSaldos();
      if (tab.dataset.tab === "mural") carregarMural();
    });
  });

  montarSelects();
  renderFiltros();

  if (window.ethereum) {
    window.ethereum.request({ method: "eth_accounts" })
      .then(accs => { if (accs && accs.length) conectarCarteira(); else carregarMural(); })
      .catch(() => carregarMural());
  } else {
    carregarMural();
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
