// ============================================================
// APP.JS — Carteira BRN P2P (versão revisada)
// Compatível com o EscrowFactory JÁ DEPLOYADO (sem alterar .sol)
//
// Correções desta versão:
//  1. Sem scripts de terceiros (ver index.html)
//  2. Só permite executar ordens BRN/USDC (tokens falsos bloqueados)
//  3. Verifica se a ordem é realmente executável:
//     ativa, escrow com saldo, comprador com saldo, simulação (eth_call)
//  4. Bloqueia qualquer transação fora da Polygon (chainId 137)
//  5. Valida todas as respostas de RPC e elimina innerHTML/onclick
//     com dados externos (XSS); valores críticos são relidos pelo
//     RPC da própria carteira antes de assinar
//
// IMPORTANTE: o contrato NÃO está verificado no PolygonScan.
// Os selectors vêm do bytecode. Teste com valores pequenos.
// ============================================================

// --- CONFIGURACOES (POLYGON MAINNET) ---
const ESCROW_FACTORY_ADDRESS = "0x5C305aCFF5cDFAee90276c2acEA4Aa841f7062d8";
const TOKEN_BRN_ADDRESS      = "0xdBc1c747B1D4c27113F65A4620b8fEaC74e2A210";
const TOKEN_USDC_ADDRESS     = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const BRN_DECIMALS   = 18;
const USDC_DECIMALS  = 6;
const POLYGON_CHAIN_ID = 137;

// RPCs públicos com fallback
const RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://polygon-rpc.com",
  "https://rpc.ankr.com/polygon",
];
const RPC_TIMEOUT_MS = 8000;
const MAX_ORDENS = 1000;   // limite de segurança para a lista do factory
const CONCORRENCIA = 5;    // chamadas paralelas máximas aos RPCs públicos

// --- SELECTORS (extraídos do bytecode) ---
// FACTORY
const SEL_FACTORY = {
  criarOrdem:   "ceff4da6", // ordem dos argumentos NÃO confirmada (contrato não verificado)
  ordensDe:     "0dc80995",
  ordem:        "72c453b8",
  totalOrdens:  "8275d6fa",
  todasOrdens:  "e9b1e327",
};
// ESCROW
const SEL_ESCROW = {
  criador:        "041c797c",
  tokenDesejado:  "0cd59b77",
  executado:      "2a3a5716",
  obterDados:     "32c9e06c", // -> (address,address,address,uint256,uint256,bool,bool)
  valorDesejado:  "651cc708",
  cancelado:      "7766a742",
  tokenOferecido: "8a337bdc",
  cancelar:       "8ffb1ccf", // cancelar()
  executar:       "b2d44d08", // na verdade é executarTroca() (verificado com keccak256)
  factory:        "c45a0155",
  valorOferecido: "f6c467b7",
};
// ERC-20
const SEL_ERC20 = {
  balanceOf: "70a08231",
  allowance: "dd62ed3e",
  approve:   "095ea7b3",
};

// --- ESTADO GLOBAL ---
let walletProvider = null;   // Web3Provider (RPC da própria carteira)
let signer = null;
let userAddress = null;
let currentRpc = null;
let rpcIdx = 0;
const providersOk = {};      // RPCs públicos já validados (chainId 137)
let ordersCache = [];
let carregando = false;
let emTransacao = false;
let listenersRegistrados = false;

// ============================================================
// UTILITÁRIOS
// ============================================================
function $(id) { return document.getElementById(id); }
function isAddr(a) { return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a); }
function short(a) { return isAddr(a) ? a.slice(0, 6) + "…" + a.slice(-4) : "—"; }
function mesmoEndereco(a, b) { return !!a && !!b && a.toLowerCase() === b.toLowerCase(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// escapa qualquer texto antes de entrar em innerHTML
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// formata inteiro (BigInt) com decimais, sem perder precisão
function fmt(value, decimals, maxFrac = 6) {
  try {
    const s = ethers.utils.formatUnits(value.toString(), decimals); // ex.: "1234.5"
    const partes = s.split(".");
    const inteiro = BigInt(partes[0]).toLocaleString("pt-BR");
    const frac = (partes[1] || "").slice(0, maxFrac).replace(/0+$/, "");
    if (BigInt(value) > 0n && inteiro === "0" && !frac) {
      return "< 0," + "0".repeat(maxFrac - 1) + "1";
    }
    return frac ? inteiro + "," + frac : inteiro;
  } catch (e) { return String(value); }
}

// mostra o valor com o token certo; tokens desconhecidos ficam em unidades brutas
function fmtToken(valor, tokenAddr) {
  if (mesmoEndereco(tokenAddr, TOKEN_BRN_ADDRESS))  return fmt(valor, BRN_DECIMALS) + " BRN";
  if (mesmoEndereco(tokenAddr, TOKEN_USDC_ADDRESS)) return fmt(valor, USDC_DECIMALS) + " USDC";
  return valor.toString() + " unid. de " + short(tokenAddr);
}

function toast(msg, type = "info", ms = 5000) {
  const box = $("toasts");
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;               // textContent: nunca interpreta HTML
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, ms);
}

function setNet(state, text) {
  $("netDot").className = "dot " + (state === "ok" ? "" : state);
  $("netText").textContent = text;
}

function erroLegivel(e) {
  if (!e) return "Erro desconhecido.";
  if (e.code === 4001 || e.code === "ACTION_REJECTED") return "Transação recusada na carteira.";
  const m = e.reason || (e.data && e.data.message) || (e.error && e.error.message) || e.message || String(e);
  return String(m).slice(0, 220);
}

// --- helpers de codificação/decodificação manual (ABI) com validação ---
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

// decodifica um retorno address[] (offset + length + itens) com checagem de limites
function decAddressArray(hex) {
  const w = splitWords(hex);
  if (w.length < 2) throw new Error("Lista de ordens inválida.");
  const off = Number(decUint(w[0]));
  if (off % 32 !== 0) throw new Error("Lista de ordens inválida.");
  const start = off / 32;
  if (start >= w.length) throw new Error("Lista de ordens inválida.");
  const len = Number(decUint(w[start]));
  if (!Number.isSafeInteger(len) || len > MAX_ORDENS || start + 1 + len > w.length) {
    throw new Error("Lista de ordens inválida ou grande demais.");
  }
  const arr = [];
  for (let i = 0; i < len; i++) arr.push(decAddress(w[start + 1 + i]));
  return arr;
}

// lê "1,5" ou "1.5" e devolve BigInt em unidades mínimas
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
// RPCs PÚBLICOS (fallback por chamada + checagem de chainId)
// ============================================================
async function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(t); }
}

async function getProviderFor(url) {
  if (providersOk[url]) return providersOk[url];
  const p = new ethers.providers.StaticJsonRpcProvider(url, POLYGON_CHAIN_ID);
  const hex = await withTimeout(p.send("eth_chainId", []), RPC_TIMEOUT_MS);
  if (parseInt(hex, 16) !== POLYGON_CHAIN_ID) throw new Error("RPC em rede errada: " + url);
  providersOk[url] = p;
  return p;
}

// eth_call cru via RPC público, com fallback entre os RPCs
async function rawCall(to, data) {
  let ultimoErro;
  for (let k = 0; k < RPCS.length; k++) {
    const idx = (rpcIdx + k) % RPCS.length;
    try {
      const p = await getProviderFor(RPCS[idx]);
      const r = await withTimeout(p.call({ to, data }), RPC_TIMEOUT_MS);
      rpcIdx = idx; currentRpc = RPCS[idx];
      return r;
    } catch (e) {
      if (e && e.code === "CALL_EXCEPTION") throw e; // revert real, não é falha de RPC
      ultimoErro = e;
    }
  }
  throw ultimoErro || new Error("Nenhum RPC respondeu");
}

// eth_call pelo RPC da própria carteira (fonte mais confiável antes de assinar)
async function callWallet(to, data) {
  if (!walletProvider) throw new Error("Carteira não conectada.");
  return await withTimeout(walletProvider.call({ to, data }), RPC_TIMEOUT_MS * 2);
}

async function lerSaldo(token, addr, caller = rawCall) {
  const r = await caller(token, "0x" + SEL_ERC20.balanceOf + encAddress(addr));
  return decUint(splitWords(r)[0]);
}
async function lerAllowance(token, owner, spender, caller = rawCall) {
  const r = await caller(token, "0x" + SEL_ERC20.allowance + encAddress(owner) + encAddress(spender));
  return decUint(splitWords(r)[0]);
}

// lê e valida os dados de um escrow
async function lerOrdem(addr, caller = rawCall) {
  const r = await caller(addr, "0x" + SEL_ESCROW.obterDados);
  const w = splitWords(r);
  if (w.length < 7) throw new Error("Resposta inválida do escrow.");
  return {
    endereco: addr,
    criador: decAddress(w[0]),
    tokenOferecido: decAddress(w[1]),
    tokenDesejado: decAddress(w[2]),
    valorOferecido: decUint(w[3]),
    valorDesejado: decUint(w[4]),
    executado: decBool(w[5]),
    cancelado: decBool(w[6]),
    saldoEscrow: null,
  };
}

// avalia se a ordem é segura/executável (regras do app)
function avaliar(o) {
  const suportada = mesmoEndereco(o.tokenOferecido, TOKEN_BRN_ADDRESS) &&
                    mesmoEndereco(o.tokenDesejado, TOKEN_USDC_ADDRESS);
  const ativa = !o.executado && !o.cancelado;
  // true/false se soubermos o saldo do escrow; null se não foi possível ler
  const financiada = o.saldoEscrow === null || o.saldoEscrow === undefined
    ? null : o.saldoEscrow >= o.valorOferecido;
  const executavel = ativa && suportada && financiada !== false;
  return { suportada, ativa, financiada, executavel };
}

// ============================================================
// LEITURA DO MURAL (sem carteira)
// ============================================================
function mostrarErroMural(msg) {
  const box = $("orders");
  box.innerHTML = `<div class="empty"><div class="big">⚠️</div>Não foi possível consultar a blockchain.<br><small></small></div>`;
  box.querySelector("small").textContent = msg;
}

async function carregarMural(silencioso = false) {
  if (carregando) return;
  carregando = true;
  const box = $("orders");

  if (!silencioso || !ordersCache.length) {
    box.innerHTML = `<div class="state"><div class="spinner"></div>Consultando a blockchain…</div>`;
    $("counter").textContent = "⏳ Consultando…";
    setNet("load", "Consultando…");
  }

  try {
    // 1) lista de escrows
    let addrs = [];
    try {
      const r = await rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.todasOrdens);
      addrs = decAddressArray(r);
    } catch (e) {
      const rTotal = await rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.totalOrdens);
      const n = Number(decUint(splitWords(rTotal)[0]));
      if (!Number.isSafeInteger(n) || n > MAX_ORDENS) throw new Error("Quantidade de ordens inválida ou grande demais.");
      const rs = await mapLimit(Array.from({ length: n }, (_, i) => i), CONCORRENCIA, (i) =>
        rawCall(ESCROW_FACTORY_ADDRESS, "0x" + SEL_FACTORY.ordem + encUint(i)));
      addrs = rs.map(r => decAddress(splitWords(r)[0]));
    }

    // 2) detalhes (paralelo limitado) + saldo do escrow das ordens ativas
    const detalhes = await mapLimit(addrs, CONCORRENCIA, async (addr, indice) => {
      try {
        const o = await lerOrdem(addr);
        o.indice = indice;
        if (!o.executado && !o.cancelado) {
          try { o.saldoEscrow = await lerSaldo(o.tokenOferecido, addr); }
          catch (e) { o.saldoEscrow = null; }
        }
        return o;
      } catch (e) { return { endereco: addr, indice, erro: true }; }
    });

    ordersCache = detalhes;
    renderMural(detalhes);

    const ok = detalhes.filter(o => !o.erro);
    const ativas = ok.filter(o => !o.executado && !o.cancelado).length;
    const executaveis = ok.filter(o => avaliar(o).executavel).length;
    $("counter").textContent =
      `📋 ${ativas} ativa(s) · ${executaveis} executável(is) · ${detalhes.length} no total`;
    setNet("ok", "Polygon · online");
  } catch (e) {
    console.error(e);
    if (!silencioso || !ordersCache.length) {
      mostrarErroMural(e.message);
      $("counter").textContent = "❌ Falha na consulta";
      setNet("off", "Offline");
    } else {
      $("counter").textContent += " · ⚠️ falha ao atualizar";
    }
  } finally {
    carregando = false;
  }
}

function renderMural(orders) {
  const box = $("orders");
  if (!orders.length) {
    box.innerHTML = `<div class="empty"><div class="big">📭</div>Nenhuma ordem no mural ainda.<br>Crie a primeira ordem de venda acima.</div>`;
    return;
  }
  const rank = o => o.erro ? 3 : o.cancelado ? 2 : o.executado ? 1 : 0;
  const sorted = [...orders].sort((a, b) => rank(a) - rank(b) || a.indice - b.indice);

  box.innerHTML = sorted.map(o => {
    if (o.erro) {
      return `<div class="order"><div class="order-id">${esc(o.endereco)}</div>
        <div class="state" style="padding:10px">⚠️ Não foi possível ler esta ordem.</div></div>`;
    }
    const av = avaliar(o);
    const eDono = mesmoEndereco(userAddress, o.criador);

    let classe, tagTxt;
    if (o.cancelado)      { classe = "cancelled"; tagTxt = "Cancelada"; }
    else if (o.executado) { classe = "done";      tagTxt = "Executada"; }
    else if (!av.suportada)          { classe = "blocked"; tagTxt = "Token não suportado"; }
    else if (av.financiada === false) { classe = "blocked"; tagTxt = "Sem fundos"; }
    else                  { classe = "active";    tagTxt = "Ativa"; }

    const podeExecutar = av.executavel && !!userAddress && !eDono;
    const podeCancelar = av.ativa && !!userAddress && eDono;

    let aviso = "";
    if (av.ativa && !av.suportada) {
      aviso = `<div class="note">⚠️ Esta ordem usa tokens diferentes de BRN/USDC (possível token falso). O app não permite executá-la.</div>`;
    } else if (av.ativa && av.financiada === false) {
      aviso = `<div class="note">⚠️ O escrow não possui os tokens da ordem — ela não pode ser executada.</div>`;
    }

    const addr = esc(o.endereco); // já validado como endereço, escapado por garantia
    return `
      <div class="order ${classe}">
        <div class="order-top">
          <span class="order-id">#${o.indice + 1} · ${esc(short(o.endereco))}</span>
          <span class="tag ${classe}">${esc(tagTxt)}</span>
        </div>
        <div class="swap">
          <div class="side">
            <div class="lbl">Oferece</div>
            <div class="amt ${mesmoEndereco(o.tokenOferecido, TOKEN_BRN_ADDRESS) ? "brn" : ""}">${esc(fmtToken(o.valorOferecido, o.tokenOferecido))}</div>
          </div>
          <div class="arrow">⇄</div>
          <div class="side">
            <div class="lbl">Pede</div>
            <div class="amt ${mesmoEndereco(o.tokenDesejado, TOKEN_USDC_ADDRESS) ? "usdc" : ""}">${esc(fmtToken(o.valorDesejado, o.tokenDesejado))}</div>
          </div>
        </div>
        <div class="order-meta">
          <span>Criador: <b>${esc(short(o.criador))}</b></span>
          <span>Escrow: <b>${esc(short(o.endereco))}</b></span>
        </div>
        ${aviso}
        <div class="order-actions">
          ${podeExecutar ? `<button class="btn-ok btn-sm" data-action="executar" data-addr="${addr}">⚡ Executar (pagar ${esc(fmtToken(o.valorDesejado, o.tokenDesejado))})</button>` : ""}
          ${podeCancelar ? `<button class="btn-err btn-sm" data-action="cancelar" data-addr="${addr}">✖ Cancelar</button>` : ""}
          ${(!userAddress && av.executavel) ? `<span class="order-id">Conecte a carteira para interagir</span>` : ""}
        </div>
      </div>`;
  }).join("");
}

// ============================================================
// CARTEIRA (MetaMask)
// ============================================================
async function garantirPolygon() {
  if (!window.ethereum) throw new Error("MetaMask não encontrada.");
  const msg = "Troque a MetaMask para a rede Polygon (chainId 137) e tente de novo.";
  const atual = await window.ethereum.request({ method: "eth_chainId" });
  if (parseInt(atual, 16) === POLYGON_CHAIN_ID) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + POLYGON_CHAIN_ID.toString(16) }],
    });
  } catch (e) { throw new Error(msg); }
  const depois = await window.ethereum.request({ method: "eth_chainId" });
  if (parseInt(depois, 16) !== POLYGON_CHAIN_ID) throw new Error(msg);
}

function setBotoes(habilitar) {
  const ok = habilitar && !!signer;
  $("btnCreate").disabled = !ok;
  $("btnApproveBRN").disabled = !ok;
}

async function conectarCarteira() {
  if (!window.ethereum) { toast("MetaMask não encontrada. Instale a extensão.", "err"); return; }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts.length) throw new Error("Nenhuma conta disponível.");

    await garantirPolygon(); // sem Polygon, a conexão é recusada

    userAddress = ethers.utils.getAddress(accounts[0]);
    walletProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
    signer = walletProvider.getSigner();

    $("walletInfo").style.display = "block";
    $("addr").textContent = userAddress;
    $("btnConnect").textContent = "🔌 Conectado";
    $("btnConnect").disabled = true;
    setBotoes(true);

    await carregarSaldos();
    renderMural(ordersCache);
    toast("Carteira conectada: " + short(userAddress), "ok");

    if (!listenersRegistrados) {
      listenersRegistrados = true;
      window.ethereum.on("accountsChanged", () => location.reload());
      window.ethereum.on("chainChanged", (hex) => {
        if (parseInt(hex, 16) === POLYGON_CHAIN_ID) { toast("Rede Polygon ativa.", "ok"); carregarSaldos(); }
        else toast("Você saiu da Polygon. Transações ficam bloqueadas até voltar.", "warn", 8000);
      });
    }
  } catch (e) {
    console.error(e);
    userAddress = null; signer = null; walletProvider = null;
    setBotoes(false);
    toast("Falha ao conectar: " + erroLegivel(e), "err", 8000);
  }
}

function desconectar() {
  userAddress = null; signer = null; walletProvider = null;
  $("walletInfo").style.display = "none";
  $("btnConnect").textContent = "🔌 Conectar carteira";
  $("btnConnect").disabled = false;
  setBotoes(false);
  renderMural(ordersCache);
  toast("Carteira desconectada.", "info");
}

async function carregarSaldos() {
  if (!userAddress) return;
  const caller = walletProvider ? callWallet : rawCall;
  try {
    const [b, u] = await Promise.all([
      lerSaldo(TOKEN_BRN_ADDRESS, userAddress, caller),
      lerSaldo(TOKEN_USDC_ADDRESS, userAddress, caller),
    ]);
    $("balBRN").textContent = fmt(b, BRN_DECIMALS);
    $("balUSDC").textContent = fmt(u, USDC_DECIMALS);
  } catch (e) {
    console.error(e);
    $("balBRN").textContent = "—";
    $("balUSDC").textContent = "—";
  }
}

// ============================================================
// TRANSAÇÕES (guarda de concorrência + rede + simulação)
// ============================================================
async function comTransacao(fn) {
  if (emTransacao) { toast("Aguarde a transação atual terminar.", "warn"); return; }
  if (!signer || !userAddress) { toast("Conecte a carteira primeiro.", "warn"); return; }
  emTransacao = true; setBotoes(false);
  try { await fn(); }
  catch (e) { console.error(e); toast(erroLegivel(e), "err", 8000); }
  finally { emTransacao = false; setBotoes(true); }
}

// simula (eth_call pela carteira), envia e espera a confirmação
async function enviarTx(to, data, rotulo) {
  await garantirPolygon();
  try {
    await withTimeout(walletProvider.call({ from: userAddress, to, data }), RPC_TIMEOUT_MS * 2);
  } catch (e) {
    throw new Error("A simulação falhou (" + rotulo + "): " + erroLegivel(e) + " — nada foi enviado.");
  }
  const tx = await signer.sendTransaction({ to, data });
  toast("Transação enviada: " + short(tx.hash) + " — aguardando…", "info");
  const rc = await tx.wait();
  if (!rc || rc.status !== 1) throw new Error("A transação foi revertida on-chain (" + rotulo + ").");
  return rc;
}

async function recarregarApos() {
  await sleep(2500); // dá tempo dos RPCs públicos alcançarem o bloco novo
  await carregarSaldos();
  await carregarMural(false);
}

// ---------------- CRIAR ORDEM (approve BRN + criarOrdem) ----------------
async function aprovarBRN() {
  await comTransacao(async () => {
    const vOf = lerValor($("inBRN").value, BRN_DECIMALS, "BRN");
    await garantirPolygon();
    const saldo = await lerSaldo(TOKEN_BRN_ADDRESS, userAddress, callWallet);
    if (saldo < vOf) throw new Error("Saldo de BRN insuficiente para esse valor.");

    toast("Aprovando BRN… confirme na MetaMask.", "info");
    const data = "0x" + SEL_ERC20.approve + encAddress(ESCROW_FACTORY_ADDRESS) + encUint(vOf);
    await enviarTx(TOKEN_BRN_ADDRESS, data, "approve BRN");
    toast("✅ BRN aprovado!", "ok");
  });
}

async function criarOrdem() {
  await comTransacao(async () => {
    const vOf = lerValor($("inBRN").value, BRN_DECIMALS, "BRN");
    const vDe = lerValor($("inUSDC").value, USDC_DECIMALS, "USDC");
    await garantirPolygon();

    const [saldo, allow] = await Promise.all([
      lerSaldo(TOKEN_BRN_ADDRESS, userAddress, callWallet),
      lerAllowance(TOKEN_BRN_ADDRESS, userAddress, ESCROW_FACTORY_ADDRESS, callWallet),
    ]);
    if (saldo < vOf) throw new Error("Saldo de BRN insuficiente.");
    if (allow < vOf) throw new Error("Aprove o BRN primeiro (botão 'Aprovar BRN').");

    const ok = window.confirm(
      "Criar ordem de venda?\n\n" +
      "Você trava " + fmt(vOf, BRN_DECIMALS) + " BRN e pede " + fmt(vDe, USDC_DECIMALS) + " USDC.\n\n" +
      "O contrato não é verificado: use valores pequenos.");
    if (!ok) return;

    const data = "0x" + SEL_FACTORY.criarOrdem +
      encAddress(TOKEN_BRN_ADDRESS) + encAddress(TOKEN_USDC_ADDRESS) +
      encUint(vOf) + encUint(vDe);

    toast("Criando ordem… confirme na MetaMask.", "info");
    await enviarTx(ESCROW_FACTORY_ADDRESS, data, "criar ordem");
    toast("✅ Ordem criada on-chain!", "ok");
    $("inBRN").value = ""; $("inUSDC").value = "";
    atualizarCotacao();
    await recarregarApos();
  });
}

// ---------------- EXECUTAR ORDEM ----------------
async function executarOrdem(escrowAddr) {
  await comTransacao(async () => {
    const conhecida = ordersCache.find(x => mesmoEndereco(x.endereco, escrowAddr));
    if (!conhecida) throw new Error("Ordem não encontrada no mural.");
    await garantirPolygon();

    // relê TUDO pela carteira (não confia só no RPC público / cache)
    const o = await lerOrdem(escrowAddr, callWallet);
    if (o.executado || o.cancelado) { await carregarMural(false); throw new Error("Essa ordem não está mais ativa."); }
    if (mesmoEndereco(o.criador, userAddress)) throw new Error("Você não pode executar a sua própria ordem.");

    const av = avaliar(o);
    if (!av.suportada) throw new Error("Ordem bloqueada: os tokens não são BRN/USDC.");

    if (!conhecida.erro &&
        (conhecida.valorOferecido !== o.valorOferecido || conhecida.valorDesejado !== o.valorDesejado)) {
      await carregarMural(false);
      throw new Error("Os valores da ordem mudaram. Confira o mural atualizado.");
    }

    // 1) o escrow realmente tem os BRN?
    const saldoEscrow = await lerSaldo(o.tokenOferecido, escrowAddr, callWallet);
    if (saldoEscrow < o.valorOferecido) throw new Error("O escrow não tem os BRN da ordem — não é executável.");

    // 2) o comprador tem USDC?
    const saldoUSDC = await lerSaldo(TOKEN_USDC_ADDRESS, userAddress, callWallet);
    if (saldoUSDC < o.valorDesejado) throw new Error("Saldo de USDC insuficiente.");

    // 3) confirmação explícita com os valores relidos
    const ok = window.confirm(
      "Executar ordem " + short(escrowAddr) + "?\n\n" +
      "Você paga: " + fmt(o.valorDesejado, USDC_DECIMALS) + " USDC\n" +
      "Você recebe: " + fmt(o.valorOferecido, BRN_DECIMALS) + " BRN");
    if (!ok) return;

    // 4) approve EXATO do valor relido (só se necessário)
    const allow = await lerAllowance(TOKEN_USDC_ADDRESS, userAddress, escrowAddr, callWallet);
    if (allow < o.valorDesejado) {
      toast("Aprovando USDC para o escrow… confirme na MetaMask.", "info");
      const dataA = "0x" + SEL_ERC20.approve + encAddress(escrowAddr) + encUint(o.valorDesejado);
      await enviarTx(TOKEN_USDC_ADDRESS, dataA, "approve USDC");
      toast("✅ USDC aprovado!", "ok");
      await sleep(1500);
    }

    // 5) executarTroca() — simulado antes de enviar
    toast("Executando ordem… confirme na MetaMask.", "info");
    await enviarTx(escrowAddr, "0x" + SEL_ESCROW.executar, "executar");
    toast("✅ Ordem executada! Troca concluída.", "ok");
    await recarregarApos();
  });
}

// ---------------- CANCELAR ORDEM ----------------
async function cancelarOrdem(escrowAddr) {
  await comTransacao(async () => {
    const conhecida = ordersCache.find(x => mesmoEndereco(x.endereco, escrowAddr));
    if (!conhecida) throw new Error("Ordem não encontrada no mural.");
    await garantirPolygon();

    const o = await lerOrdem(escrowAddr, callWallet);
    if (o.executado || o.cancelado) { await carregarMural(false); throw new Error("Essa ordem não está mais ativa."); }
    if (!mesmoEndereco(o.criador, userAddress)) throw new Error("Só o criador pode cancelar esta ordem.");

    const ok = window.confirm("Cancelar a ordem " + short(escrowAddr) + " e receber os tokens de volta?");
    if (!ok) return;

    toast("Cancelando ordem… confirme na MetaMask.", "info");
    await enviarTx(escrowAddr, "0x" + SEL_ESCROW.cancelar, "cancelar");
    toast("✅ Ordem cancelada. Tokens devolvidos.", "ok");
    await recarregarApos();
  });
}

// ============================================================
// COTAÇÃO (informativo)
// ============================================================
function atualizarCotacao() {
  const b = Number($("inBRN").value);
  const u = Number($("inUSDC").value);
  const info = $("rateInfo");
  if (b > 0 && u > 0) {
    const preco = u / b;
    info.style.display = "block";
    info.textContent = "💱 Preço: 1 BRN = " + preco.toLocaleString("pt-BR", { maximumFractionDigits: 8 }) + " USDC";
  } else {
    info.style.display = "none";
  }
}

// ============================================================
// INIT
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  $("btnConnect").addEventListener("click", conectarCarteira);
  $("btnDisconnect").addEventListener("click", desconectar);
  $("btnRefresh").addEventListener("click", () => carregarMural(false));
  $("btnApproveBRN").addEventListener("click", aprovarBRN);
  $("btnCreate").addEventListener("click", criarOrdem);
  $("inBRN").addEventListener("input", atualizarCotacao);
  $("inUSDC").addEventListener("input", atualizarCotacao);

  // delegação de eventos: sem onclick inline montado com dados externos
  $("orders").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-action]");
    if (!btn) return;
    const addr = btn.dataset.addr;
    if (!isAddr(addr)) return;
    if (btn.dataset.action === "executar") executarOrdem(addr);
    else if (btn.dataset.action === "cancelar") cancelarOrdem(addr);
  });

  carregarMural(false);
  // atualização automática silenciosa (sem piscar o spinner)
  setInterval(() => { if (!emTransacao && !document.hidden) carregarMural(true); }, 60000);
});
