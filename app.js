// ============================================================
// APP.JS — BRN Exchange | Versão 6.14
// ✅ Bridge Cross-Chain SHIB/USDT/USDC Polygon ↔ Ethereum ↔ BSC (SideShift)
// ✅ REMOVIDO: shib-bsc (SideShift não suporta essa rede)
// ✅ Confirmação clara mostrando rede de envio + aviso de gas
// ✅ Hint mostra "Saldo na BSC" / "Saldo na Polygon" / "Saldo na Ethereum" (símbolo limpo)
// ✅ Bloqueia mesma rede na origem e destino
// ✅ Leitura de saldos na BSC/BNB Chain (SHIB-BSC, USDT-BSC, USDC-BSC, BNB)
// ✅ Endereço reduzido no rodapé dos cards + clique copia
// ✅ Endereços em minúsculo (fix "bad address checksum")
// ✅ RPCs Polygon + Ethereum + BSC sem 401/CORS (vivos em 2026-09)
// ✅ Modal "Carteiras Aceitas" com detecção dinâmica (EIP-6963)
// ✅ Multi-carteira via EIP-6963 + Brave + Pelagus
// ✅ Botão 📋 para copiar contrato + rodapé "ENDEREÇO BRN" marrom
// ✅ Bridge WBTC → BTC (SideShift)
// ✅ traduzirErro() PT-BR + tratamento de cancelamento
// ============================================================

const ESCROW_FACTORY = "0x5c305acff5cdfaee90276c2acea4aa841f7062d8";
const POLYGON_CHAIN_ID = 137;
const BSC_CHAIN_ID = 56;
const REFRESH_MS = 30000;
const SIDESHIFT_API_URL = "https://brn-site.vercel.app/api/sideshift";
const BLOCKSTREAM_API = "https://blockstream.info/api";

const RESERVA_GAS_POL = "0.05";
const RESERVA_TAXA_BTC_SATS = 2000;

const TOKENS = [
  // ===== POLYGON =====
  { symbol: "BRN",        name: "BRN Token",             address: "0xdbc1c747b1d4c27113f65a4620b8feac74e2a210", decimals: 18 },
  { symbol: "USDC",       name: "USD Coin (nativo)",     address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6  },
  { symbol: "USDC.e",     name: "USD Coin (bridged)",    address: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", decimals: 6  },
  { symbol: "USDT",       name: "Tether USD (nativo)",   address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8a", decimals: 6  },
  { symbol: "USDT.e",     name: "Tether USD (bridged)",  address: "0x9417669fbf23357d2774e9d4234219952d36a1e5", decimals: 6  },
  { symbol: "SHIB",       name: "Shiba Inu",             address: "0x6f8a06447ff6fcf75d803135a7de15ce88c1d4ec", decimals: 18 },
  { symbol: "WPOL",       name: "Wrapped POL",           address: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", decimals: 18 },
  { symbol: "WBTC",       name: "Wrapped BTC",           address: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", decimals: 8  },
  { symbol: "WETH",       name: "Wrapped Ether",         address: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", decimals: 18 },

  // ===== ETHEREUM (somente leitura) =====
  { symbol: "USDT-ETH",   name: "Tether USD (Ethereum)", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6,  somenteEth: true, rede: "Ethereum" },
  { symbol: "USDC-ETH",   name: "USD Coin (Ethereum)",   address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6,  somenteEth: true, rede: "Ethereum" },
  { symbol: "SHIB-ETH",   name: "Shiba Inu (Ethereum)",  address: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", decimals: 18, somenteEth: true, rede: "Ethereum" },

  // ===== BSC / BNB Chain (somente leitura) =====
  { symbol: "SHIB-BSC",   name: "SHIBA INU (BSC)",       address: "0x2859e4544c4bb03966803b044a93563bd2d0dd4d", decimals: 18, somenteBsc: true, rede: "BSC" },
  { symbol: "USDT-BSC",   name: "Tether USD (BSC)",      address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18, somenteBsc: true, rede: "BSC" },
  { symbol: "USDC-BSC",   name: "USD Coin (BSC)",        address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18, somenteBsc: true, rede: "BSC" }
];

// ⚠️ v6.14: shib-bsc REMOVIDO — a SideShift não suporta SHIB na rede BSC.
// Pares suportados: shib/polygon, shib/ethereum, usdt/{polygon,ethereum,bsc}, usdc/{polygon,ethereum}, wbtc→btc
const SIDESHIFT_MAP = {
  "usdt-polygon":  { coin: "usdt", network: "polygon",  tokenSymbol: "USDT" },
  "usdc-polygon":  { coin: "usdc", network: "polygon",  tokenSymbol: "USDC" },
  "shib-polygon":  { coin: "shib", network: "polygon",  tokenSymbol: "SHIB" },
  "usdt-ethereum": { coin: "usdt", network: "ethereum", tokenSymbol: "USDT-ETH" },
  "usdc-ethereum": { coin: "usdc", network: "ethereum", tokenSymbol: "USDC-ETH" },
  "shib-ethereum": { coin: "shib", network: "ethereum", tokenSymbol: "SHIB-ETH" },
  "usdt-bsc":      { coin: "usdt", network: "bsc",      tokenSymbol: "USDT-BSC" }
};

// ✅ v6.14: RPCs Polygon atualizados (polygon.publicnode.com removido — timeout frequente)
const RPC_LIST = [
  "https://polygon-rpc.com",
  "https://polygon.llamarpc.com",
  "https://polygon.drpc.org",
  "https://1rpc.io/matic",
  "https://polygon-bor-rpc.publicnode.com"
];

// ✅ v6.14: RPCs Ethereum atualizados
const ETH_RPC_LIST = [
  "https://ethereum.publicnode.com",
  "https://eth.llamarpc.com",
  "https://eth.drpc.org",
  "https://1rpc.io/eth"
];

// ✅ v6.14: RPCs BSC atualizados (removidos binance.llamarpc.com morto e bsc.drpc.org com 429)
const BSC_RPC_LIST = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
  "https://bsc.publicnode.com",
  "https://bsc-rpc.publicnode.com"
];

const WALLETS_EVM_CATALOG = [
  { name: "MetaMask",        icon: "🦊", rdns: "io.metamask",          install: "https://metamask.io/download/" },
  { name: "Rabby",           icon: "🐰", rdns: "io.rabby",             install: "https://rabby.io/" },
  { name: "Coinbase Wallet", icon: "🔵", rdns: "com.coinbase.wallet",  install: "https://www.coinbase.com/wallet/downloads" },
  { name: "Trust Wallet",    icon: "🛡️", rdns: "com.trustwallet.app", install: "https://trustwallet.com/browser-extension" },
  { name: "OKX Wallet",      icon: "⬛", rdns: "com.okex.wallet",      install: "https://www.okx.com/web3" },
  { name: "Phantom",         icon: "🦎", rdns: "app.phantom",          install: "https://phantom.app/download" },
  { name: "Brave Wallet",    icon: "🦁", rdns: "com.brave.wallet",     install: "https://brave.com/wallet/" },
  { name: "Pelagus",         icon: "🔶", rdns: "io.pelaguswallet.wallet", install: "https://pelaguswallet.io/" },
  { name: "Bitget Wallet",   icon: "🔷", rdns: "com.bitget.wallet",    install: "https://web3.bitget.com/wallet" },
  { name: "Rainbow",         icon: "🌈", rdns: "me.rainbow",           install: "https://rainbow.me/download" },
  { name: "Ledger",          icon: "🔒", rdns: "com.ledger",           install: "https://www.ledger.com/ledger-live" }
];

const WALLETS_BTC_CATALOG = [
  { name: "UniSat",      icon: "🟠", key: "unisat",    check: () => !!window.unisat,                                 install: "https://unisat.io/download" },
  { name: "OKX Bitcoin", icon: "⬛", key: "okxbtc",    check: () => !!(window.okxwallet?.bitcoin),                   install: "https://www.okx.com/web3" },
  { name: "Leather",     icon: "🧳", key: "leather",   check: () => !!window.LeatherProvider,                        install: "https://leather.io/install-extension" },
  { name: "Xverse",      icon: "✨", key: "xverse",    check: () => !!(window.XverseProviders || window.BitcoinProvider), install: "https://www.xverse.app/download" },
  { name: "Magic Eden",  icon: "🪄", key: "magiceden", check: () => !!(window.magicEden?.bitcoin),                   install: "https://wallet.magiceden.io/" }
];

let S = null;

function construirSeletores() {
  if (typeof ethers === "undefined" || !ethers.utils) {
    throw new Error("ethers.js não carregou — verifique o <script> do CDN");
  }
  const sel = a => ethers.utils.id(a).slice(2, 10);
  S = {
    Factory: {
      criarOrdem:  sel("criarNovoContratoEscrow(address,address,uint256,uint256)"),
      todasOrdens: sel("obterContratosGerados()")
    },
    Escrow: {
      obterDados: sel("obterDados()"),
      executar:   sel("executarTroca()"),
      cancelar:   sel("cancelar()")
    },
    ERC20: {
      balanceOf: sel("balanceOf(address)"),
      allowance: sel("allowance(address,address)"),
      approve:   sel("approve(address,uint256)"),
      transfer:  sel("transfer(address,uint256)")
    },
    WPOL: {
      deposit:  sel("deposit()"),
      withdraw: sel("withdraw(uint256)")
    }
  };
  console.log("✅ Seletores ABI calculados:", S);
}

let provider = null;
let signer = null;
let userAddress = null;
let rpcProvider = null;
let ethProvider = null;
let bscProvider = null;
let ordersCache = [];
let loading = false;
let isTxBusy = false;
let saldos = { POL: 0n };
let filtroAtivo = { status: "ativas", oferece: "", pede: "", minhas: false };
let btcApiSincronizada = false;
let refreshTimer = null;

let btcWallet = null;
let btcSaldoSats = 0;
let walletEscolhidaRdns = null;
let eventosWalletConfigurados = false;

const $ = id => document.getElementById(id);
const isAddr = a => /^0x[a-fA-F0-9]{40}$/i.test(a || "");
const short = a => isAddr(a) ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
const mesmoAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function parseUnits(valor, decimals) {
  return BigInt(ethers.utils.parseUnits(valor, decimals).toString());
}

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

function toastBtcTx(txid) {
  const container = $("toasts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast ok";
  el.innerHTML = `📤 BTC enviado! <a href="https://mempool.space/tx/${txid}" target="_blank" rel="noopener">Ver no mempool.space ↗</a>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); }, 9000);
}

// ============================================================
// Descoberta multi-carteira via EIP-6963
// ============================================================
const announcedProviders = new Map();

function inicializarDescobertaCarteiras() {
  const onAnnounce = (event) => {
    try {
      const { info, provider: prov } = event.detail || {};
      if (!info || !prov) return;
      if (!announcedProviders.has(info.uuid)) {
        announcedProviders.set(info.uuid, { info, provider: prov });
        console.log(`🔍 Carteira detectada: ${info.name} (${info.rdns})`);
      }
    } catch (e) { console.warn("Erro ao processar announce:", e); }
  };
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  setTimeout(() => {
    try {
      if (announcedProviders.size === 0 && window.ethereum) {
        console.log("⚠️ EIP-6963 não respondeu. Usando fallback window.ethereum.");
        announcedProviders.set("fallback", {
          info: { name: "Carteira EVM Detectada", rdns: "fallback", uuid: "fallback" },
          provider: window.ethereum
        });
      }
      atualizarStatusCarteiras();
    } catch (e) {
      console.warn("Falha na descoberta tardia:", e);
    }
  }, 500);
}

function listarCarteirasDisponiveis() {
  return Array.from(announcedProviders.values()).map(e => ({
    name: e.info.name,
    rdns: e.info.rdns,
    uuid: e.info.uuid
  }));
}

function obterProviderPorRdns(rdns) {
  for (const entry of announcedProviders.values()) {
    if (entry.info.rdns === rdns) return entry.provider;
  }
  return null;
}

function carteiraEvmDetectada(rdns) {
  for (const entry of announcedProviders.values()) {
    if (entry.info.rdns === rdns) return true;
  }
  const eth = window.ethereum;
  if (eth) {
    if (rdns === "io.metamask" && eth.isMetaMask && !eth.isBraveWallet) return true;
    if (rdns === "io.rabby" && eth.isRabby) return true;
    if (rdns === "com.coinbase.wallet" && eth.isCoinbaseWallet) return true;
    if (rdns === "com.trustwallet.app" && eth.isTrust) return true;
  }
  if (rdns === "com.okex.wallet" && (window.okxwallet?.ethereum || window.okxwallet?.isOkxWallet)) return true;
  if (rdns === "app.phantom" && window.phantom?.ethereum) return true;
  if (rdns === "com.brave.wallet" && window.ethereum?.isBraveWallet) return true;
  if (rdns === "com.bitget.wallet" && window.bitkeep?.ethereum) return true;
  return false;
}

// ============================================================
// Tradutor de erros → PT-BR
// ============================================================
function traduzirErro(e) {
  if (!e) return { msg: "Erro desconhecido.", tipo: "err" };
  if (e.code === 4001 || e.code === "ACTION_REJECTED") return { msg: "Operação cancelada na carteira.", tipo: "warn" };
  if (e.code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(e.message || "")) return { msg: "Saldo insuficiente para pagar o gas. Adicione POL à sua carteira.", tipo: "err" };
  if (/nonce too low|nonce has already been used/i.test(e.message || "")) return { msg: "Sincronização pendente. Espere a tx anterior confirmar e tente de novo.", tipo: "warn" };
  if (/out of gas|gas required exceeds allowance|intrinsic gas too low/i.test(e.message || "")) return { msg: "Gas insuficiente. Aumente o gasLimit ou tente novamente.", tipo: "err" };
  if (/chainId|network changed|wrong network/i.test(e.message || "")) return { msg: "Rede incorreta. Troque para Polygon Mainnet.", tipo: "err" };
  if (/could not detect network|timeout|failed to fetch|network error/i.test(e.message || "")) return { msg: "Falha de conexão com a rede. Tente novamente.", tipo: "err" };
  if (/execution reverted|revert/i.test(e.message || "")) return { msg: "Contrato recusou a operação. Verifique saldo e allowance.", tipo: "err" };
  const limpa = (e.message || "").replace(/^Error:\s*/i, "").replace(/\(action=.*?\)/i, "").replace(/\(error=.*?\)/i, "").trim();
  return { msg: limpa || "Erro desconhecido.", tipo: "err" };
}

async function fetchTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

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

function extrairEnderecoToken(word) {
  if (!word || word.length < 40) return "0x0000000000000000000000000000000000000000";
  const conhecidos = new Set(TOKENS.map(t => t.address.toLowerCase()));
  for (let off = 0; off <= word.length - 40; off += 2) {
    const cand = word.slice(off, off + 40).toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(cand)) continue;
    if (conhecidos.has(cand)) return cand;
  }
  return "0x" + word.slice(-40).toLowerCase();
}

function extrairEnderecoGenerico(word) {
  if (!word || word.length < 40) return "0x0000000000000000000000000000000000000000";
  return "0x" + word.slice(-40).toLowerCase();
}

function decodificarOrdem(hex) {
  const p = splitResposta(hex);
  if (p.length < 7) throw new Error("Resposta curta: " + p.length + " words");
  return {
    criador:        extrairEnderecoGenerico(p[0]),
    tokenOferecido: extrairEnderecoToken(p[1]),
    tokenDesejado:  extrairEnderecoToken(p[2]),
    valorOferecido: decUint(p[3]),
    valorDesejado:  decUint(p[4]),
    executado:      p[5] ? decBool(p[5]) : false,
    cancelado:      p[6] ? decBool(p[6]) : false
  };
}

function decodificarListaEnderecos(hex) {
  const words = splitResposta(hex);
  if (!words.length) return [];
  const offset = Number(decUint(words[0])) / 32;
  if (offset >= words.length) return [];
  const length = Number(decUint(words[offset]));
  const lista = [];
  for (let i = 0; i < length && (offset + 1 + i) < words.length; i++) {
    try { lista.push("0x" + words[offset + 1 + i].slice(24).toLowerCase()); } catch {}
  }
  return lista;
}

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
  if (tok.desconhecido) return tok.symbol;
  const rede = tok.rede || "Polygon";
  return `${tok.symbol} (${rede})`;
}

function atualizarStatusCarteiras() {
  const ed = $("evmWalletDot");
  const et = $("evmWalletText");
  if (ed && et) {
    if (userAddress) {
      ed.className = "dot";
      const nome = walletEscolhidaRdns
        ? (Array.from(announcedProviders.values()).find(e => e.info.rdns === walletEscolhidaRdns)?.info.name || "Carteira")
        : "Carteira";
      et.textContent = `${nome}: ${short(userAddress)}`;
    } else {
      ed.className = "dot off";
      et.textContent = "Carteira EVM: Desconectada";
    }
  }
  const bd = $("btcWalletDot");
  const bt = $("btcWalletText");
  if (bd && bt) {
    if (btcWallet) {
      bd.className = "dot btc-status";
      const a = btcWallet.address;
      bt.textContent = `${btcWallet.label}: ${a.slice(0, 8)}…${a.slice(-4)}`;
    } else {
      bd.className = "dot btc-status off";
      bt.textContent = "BTC Wallet: Desconectada";
    }
  }
}

async function testarRPC(url) {
  try {
    const p = new ethers.providers.JsonRpcProvider({ url, timeout: 6000 });
    const rede = await p.getNetwork();
    if (rede.chainId === POLYGON_CHAIN_ID) return p;
  } catch {}
  return null;
}

async function conectarRPC() {
  const validos = [];
  for (const url of RPC_LIST) {
    const p = await testarRPC(url);
    if (p) validos.push({ url, p });
  }
  if (validos.length === 0) return false;
  rpcProvider = validos[0].p;
  console.log(`✅ ${validos.length} RPC(s) Polygon conectados. Principal: ${validos[0].url}`);
  return true;
}

async function testarRPCEth(url) {
  try {
    const p = new ethers.providers.JsonRpcProvider({ url, timeout: 6000 });
    const rede = await p.getNetwork();
    if (rede.chainId === 1) return p;
  } catch {}
  return null;
}

async function conectarRPCEth() {
  if (ethProvider) return true;
  const validos = [];
  for (const url of ETH_RPC_LIST) {
    const p = await testarRPCEth(url);
    if (p) validos.push({ url, p });
  }
  if (validos.length === 0) {
    console.warn("⚠️ Nenhum RPC Ethereum disponível");
    return false;
  }
  ethProvider = validos[0].p;
  console.log(`✅ ${validos.length} RPC(s) Ethereum conectados. Principal: ${validos[0].url}`);
  return true;
}

async function testarRPCBSC(url) {
  try {
    const p = new ethers.providers.JsonRpcProvider({ url, timeout: 6000 });
    const rede = await p.getNetwork();
    if (rede.chainId === BSC_CHAIN_ID) return p;
  } catch {}
  return null;
}

async function conectarRPCBSC() {
  if (bscProvider) return true;
  const validos = [];
  for (const url of BSC_RPC_LIST) {
    const p = await testarRPCBSC(url);
    if (p) validos.push({ url, p });
  }
  if (validos.length === 0) {
    console.warn("⚠️ Nenhum RPC BSC disponível");
    return false;
  }
  bscProvider = validos[0].p;
  console.log(`✅ ${validos.length} RPC(s) BSC conectados. Principal: ${validos[0].url}`);
  return true;
}

async function atualizarStatusRede() {
  const dot = $("netDot"), txt = $("netText");
  if (!dot || !txt) return false;
  dot.className = "dot load";
  txt.textContent = "Polygon: Conectando…";
  const ok = await conectarRPC();
  if (ok) { dot.className = "dot"; txt.textContent = "Polygon: Conectado ✅"; }
  else { dot.className = "dot off"; txt.textContent = "Polygon: Sem conexão ❌"; toast("❌ Não foi possível conectar à rede Polygon.", "err", 10000); }
  return ok;
}

async function verificarStatusRedeBitcoin() {
  const dot = $("btcDot"), txt = $("btcText");
  if (!dot || !txt) return;
  dot.className = "dot btc-status load";
  txt.textContent = "Bitcoin API: Sincronizando…";
  try {
    const resposta = await fetchTimeout(`${BLOCKSTREAM_API}/blocks/tip/height`, 8000);
    if (!resposta.ok) throw new Error("HTTP " + resposta.status);
    const blocoAtual = (await resposta.text()).trim();
    if (!/^\d+$/.test(blocoAtual)) throw new Error("Resposta inválida");
    btcApiSincronizada = true;
    dot.className = "dot btc-status";
    txt.textContent = `Bitcoin API: Online (Bloco ${blocoAtual}) 🟠`;
  } catch {
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
  if (card) card.classList.add("show");
  try {
    const r = await fetchTimeout(`${BLOCKSTREAM_API}/address/${encodeURIComponent(endereco)}`, 10000);
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

function isBtcAddress(addr) {
  if (!addr) return false;
  const a = addr.trim();
  if (/^bc1[02-9ac-hj-np-z]{25,87}$/i.test(a)) return true;
  if (/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a)) return true;
  if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a)) return true;
  return false;
}

function atualizarHintWbtc() {
  const hint = $("hintWbtcBridge");
  if (!hint) return;
  const wbtc = TOKENS.find(t => t.symbol === "WBTC");
  if (!wbtc) { hint.textContent = "Saldo: —"; return; }
  const saldo = saldos[wbtc.address] || 0n;
  hint.textContent = `Saldo: ${fmt(saldo, wbtc.decimals)} WBTC`;
}

// ============================================================
// BRIDGE WBTC → BTC (SideShift)
// ============================================================
async function criarOrdemSideShift() {
  if (!userAddress) { toast("Conecte a carteira primeiro.", "warn"); return; }

  const valorStr   = $("valorWbtcBridge").value.trim().replace(",", ".");
  const btcDestino = $("btcDestinoBridge").value.trim();
  const resultBox  = $("bridge-result");

  if (!valorStr || isNaN(Number(valorStr)) || Number(valorStr) <= 0) { toast("Digite uma quantidade válida de WBTC.", "warn"); return; }
  if (Number(valorStr) < 0.0001) { toast("⚠️ Valor abaixo do mínimo da SideShift (~0.0001 WBTC).", "warn", 8000); return; }
  if (!isBtcAddress(btcDestino)) { toast("❌ Endereço Bitcoin inválido. Use bc1..., 1... ou 3...", "err", 8000); return; }

  const wbtc = TOKENS.find(t => t.symbol === "WBTC");
  if (!wbtc) { toast("WBTC não configurado.", "err"); return; }

  const valorWei = parseUnits(valorStr, wbtc.decimals);
  const saldo = saldos[wbtc.address] || 0n;
  if (saldo < valorWei) { toast(`❌ Saldo insuficiente. Você tem ${fmt(saldo, wbtc.decimals)} WBTC.`, "err", 8000); return; }

  const confirmar = window.confirm(
    `Converter ${valorStr} WBTC (Polygon)\n→ BTC nativo para:\n${btcDestino}\n\nConfira o endereço com MUITO cuidado.\nContinuar?`
  );
  if (!confirmar) return;

  toast("⏳ Criando ordem na SideShift…", "info", 6000);
  if (resultBox) resultBox.style.display = "none";

  try {
    const response = await fetch(SIDESHIFT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        depositCoin:    "wbtc",
        depositNetwork: "polygon",
        settleCoin:     "btc",
        settleNetwork:  "bitcoin",
        depositAmount:  valorStr,
        settleAddress:  btcDestino
      })
    });

    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); }
    catch { throw new Error(`Servidor não retornou JSON (HTTP ${response.status}).`); }

    if (!response.ok || !data.success) throw new Error(data.error || `Erro HTTP ${response.status}`);
    if (!data.depositAddress || !data.depositAmount || !data.settleAmount) throw new Error("Resposta incompleta do servidor.");

    $("bridge-deposit-address").textContent = data.depositAddress;
    $("bridge-deposit-amount").textContent  = data.depositAmount;
    $("bridge-settle-amount").textContent   = data.settleAmount;
    $("bridge-expires").textContent = data.expiresAt ? new Date(data.expiresAt).toLocaleTimeString() : "~15 min";

    if (resultBox) { resultBox.style.display = "block"; resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
    toast("✅ Ordem criada! Envie o WBTC para o endereço exibido.", "ok", 12000);
  } catch (e) {
    console.error("SideShift:", e);
    toast("❌ " + e.message, "err", 10000);
  }
}

async function copiarDepositAddress() {
  const el = $("bridge-deposit-address");
  if (!el) return;
  try { await navigator.clipboard.writeText(el.textContent); toast("✅ Endereço copiado!", "ok"); }
  catch { toast("❌ Não foi possível copiar.", "err"); }
}

// ============================================================
// BRIDGE CROSS-CHAIN — SHIB/USDT/USDC entre Polygon, Ethereum, BSC
// ============================================================
async function atualizarHintCC() {
  const sel = $("ccTokenOrigem");
  const hint = $("ccSaldoHint");
  if (!sel || !hint) return;
  const origem = SIDESHIFT_MAP[sel.value];
  if (!origem) { hint.textContent = "Saldo: —"; return; }
  const token = TOKENS.find(t => t.symbol === origem.tokenSymbol);
  if (!token) { hint.textContent = "Saldo: —"; return; }
  const saldo = saldos[token.address] || 0n;
  const nomeRede = { polygon: "Polygon", ethereum: "Ethereum", bsc: "BSC" };
  const redeLabel = nomeRede[origem.network] || origem.network;
  // ✅ v6.14: mostra símbolo limpo (SHIB em vez de SHIB-BSC)
  const simboloLimpo = token.symbol.replace(/-(BSC|ETH)$/, "");
  hint.textContent = `Saldo na ${redeLabel}: ${fmt(saldo, token.decimals)} ${simboloLimpo}`;
}

async function criarOrdemCrossChain() {
  if (!userAddress) { toast("Conecte a carteira primeiro.", "warn"); return; }

  const origemKey = $("ccTokenOrigem").value;
  const destinoKey = $("ccTokenDestino").value;
  const valorStr = $("ccValor").value.trim().replace(",", ".");
  const destinoAddr = $("ccDestino").value.trim();
  const resultBox = $("cc-result");

  if (!valorStr || isNaN(Number(valorStr)) || Number(valorStr) <= 0) { toast("Digite uma quantidade válida.", "warn"); return; }
  if (!isAddr(destinoAddr)) { toast("❌ Endereço de destino inválido. Use um endereço 0x...", "err", 8000); return; }

  const origem = SIDESHIFT_MAP[origemKey];
  const destino = SIDESHIFT_MAP[destinoKey];
  if (!origem || !destino) { toast("❌ Par de tokens não suportado.", "err"); return; }

  // ✅ Valida que é o mesmo tipo de token (SHIB → SHIB, USDT → USDT)
  if (origem.coin !== destino.coin) {
    toast("❌ Tokens de origem e destino devem ser do mesmo tipo (ex: SHIB → SHIB).", "err", 8000);
    return;
  }

  // ✅ Não permite mesma rede na origem e destino
  if (origem.network === destino.network) {
    toast("❌ Origem e destino não podem ser a mesma rede.", "warn", 8000);
    return;
  }

  // ✅ Identifica o token de origem e valida saldo
  const tokenOrigem = TOKENS.find(t => t.symbol === origem.tokenSymbol);
  if (!tokenOrigem) { toast(`❌ Token ${origem.tokenSymbol} não encontrado no catálogo.`, "err"); return; }

  const saldoOrigem = saldos[tokenOrigem.address] || 0n;
  const valorWei = parseUnits(valorStr, tokenOrigem.decimals);
  if (saldoOrigem < valorWei) {
    const nomeRede = { polygon: "Polygon", ethereum: "Ethereum", bsc: "BSC" };
    const redeLabel = nomeRede[origem.network] || origem.network;
    const simboloLimpo = tokenOrigem.symbol.replace(/-(BSC|ETH)$/, "");
    toast(`❌ Saldo insuficiente na ${redeLabel}. Você tem ${fmt(saldoOrigem, tokenOrigem.decimals)} ${simboloLimpo}.`, "err", 9000);
    return;
  }

  const nomeRede = { polygon: "Polygon", ethereum: "Ethereum", bsc: "BSC / BNB Chain" };
  const redeOrigem = nomeRede[origem.network] || origem.network;
  const redeDestino = nomeRede[destino.network] || destino.network;
  const gasNativo = origem.network === "bsc" ? "BNB" : (origem.network === "ethereum" ? "ETH" : "POL");

  const confirmar = window.confirm(
    `🌉 Bridge Cross-Chain\n\n` +
    `De: ${valorStr} ${origem.coin.toUpperCase()} (${redeOrigem})\n` +
    `Para: ${destino.coin.toUpperCase()} (${redeDestino})\n\n` +
    `Endereço de destino (${redeDestino}):\n${destinoAddr}\n\n` +
    `⚠️ IMPORTANTE:\n` +
    `• Após criar a ordem, você precisará enviar o ${origem.coin.toUpperCase()} MANUALMENTE pela rede ${redeOrigem}\n` +
    `• Você vai precisar de ${gasNativo} para pagar o gas\n` +
    `• Ative a rede ${redeOrigem} na sua carteira (MetaMask → Trocar rede)\n\n` +
    `Confira o endereço com MUITO cuidado.\nContinuar?`
  );
  if (!confirmar) return;

  toast("⏳ Criando ordem na SideShift…", "info", 6000);
  if (resultBox) resultBox.style.display = "none";

  try {
    const response = await fetch(SIDESHIFT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        depositCoin:    origem.coin,
        depositNetwork: origem.network,
        settleCoin:     destino.coin,
        settleNetwork:  destino.network,
        depositAmount:  valorStr,
        settleAddress:  destinoAddr
      })
    });

    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); }
    catch { throw new Error(`Servidor não retornou JSON (HTTP ${response.status}).`); }

    if (!response.ok || !data.success) throw new Error(data.error || `Erro HTTP ${response.status}`);
    if (!data.depositAddress || !data.depositAmount || !data.settleAmount) throw new Error("Resposta incompleta do servidor.");

    $("cc-deposit-address").textContent = data.depositAddress;
    $("cc-deposit-amount").textContent = data.depositAmount;
    $("cc-deposit-token").textContent = `${origem.coin.toUpperCase()} (${redeOrigem})`;
    $("cc-settle-amount").textContent = data.settleAmount;
    $("cc-settle-token").textContent = `${destino.coin.toUpperCase()} (${redeDestino})`;
    $("cc-expires").textContent = data.expiresAt ? new Date(data.expiresAt).toLocaleTimeString() : "~15 min";

    if (resultBox) { resultBox.style.display = "block"; resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" }); }

    toast(
      `✅ Ordem criada! Agora:\n` +
      `1) Abra a MetaMask → troque para a rede ${redeOrigem}\n` +
      `2) Envie ${data.depositAmount} ${origem.coin.toUpperCase()} para o endereço exibido\n` +
      `3) Aguarde 5-30 min → você recebe em ${redeDestino}`,
      "ok",
      20000
    );
  } catch (e) {
    console.error("CrossChain SideShift:", e);
    toast("❌ " + e.message, "err", 10000);
  }
}

async function copiarCCDepositAddress() {
  const el = $("cc-deposit-address");
  if (!el) return;
  try { await navigator.clipboard.writeText(el.textContent); toast("✅ Endereço copiado!", "ok"); }
  catch { toast("❌ Não foi possível copiar.", "err"); }
}

// ============================================================
// POL nativo
// ============================================================
function calcularPOLDisponivel() {
  const reserva = parseUnits(RESERVA_GAS_POL, 18);
  return saldos.POL > reserva ? saldos.POL - reserva : 0n;
}

async function enviarPOL() {
  if (!signer || !userAddress || isTxBusy) return;
  isTxBusy = true;
  try {
    const destino = $("destinoPOL").value.trim();
    const valorStr = $("valorPOLEnvio").value.trim().replace(",", ".");

    if (!isAddr(destino)) throw new Error("Endereço de destino inválido");
    if (mesmoAddr(destino, userAddress)) throw new Error("Não pode enviar para você mesmo");
    if (!valorStr || isNaN(Number(valorStr)) || Number(valorStr) <= 0) throw new Error("Valor inválido");

    const valor = parseUnits(valorStr, 18);
    const disponivel = calcularPOLDisponivel();

    if (valor > disponivel) {
      throw new Error(
        `Saldo insuficiente. Você tem ${fmt(saldos.POL, 18)} POL ` +
        `(reservando ${RESERVA_GAS_POL} POL para gas). ` +
        `Disponível: ${fmt(disponivel, 18)} POL.`
      );
    }

    const confirmar = window.confirm(
      `Enviar ${valorStr} POL para:\n${destino}\n\n⚠️ Transação irreversível. Confira o endereço.\nContinuar?`
    );
    if (!confirmar) { isTxBusy = false; return; }

    toast(`⏳ Enviando ${fmt(valor, 18, 6)} POL…`, "info");

    const tx = await signer.sendTransaction({
      to: destino,
      value: valor,
      gasLimit: 21000
    });

    toastTx("📤 POL enviado:", tx.hash, "ok");
    await tx.wait();
    toast(`✅ POL enviado com sucesso!`, "ok", 6000);

    $("destinoPOL").value = "";
    $("valorPOLEnvio").value = "";
    await carregarSaldos();
  } catch (e) {
    console.error("enviarPOL:", e);
    const { msg, tipo } = traduzirErro(e);
    toast(msg, tipo, 8000);
  } finally {
    isTxBusy = false;
  }
}

// ============================================================
// BTC nativo
// ============================================================
function isBtcAddressStrict(a) {
  if (!a) return false;
  const s = a.trim();
  return /^(bc1[a-z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(s);
}

async function detectarCarteiraBTC() {
  if (window.unisat)             return { type: "unisat",  provider: window.unisat, label: "UniSat" };
  if (window.okxwallet?.bitcoin) return { type: "okx",     provider: window.okxwallet.bitcoin, label: "OKX Wallet" };
  if (window.LeatherProvider)    return { type: "leather", provider: window.LeatherProvider, label: "Leather" };
  return null;
}

async function conectarCarteiraBTC() {
  const det = await detectarCarteiraBTC();
  if (!det) {
    toast("❌ Nenhuma carteira Bitcoin detectada. Instale UniSat ou OKX Wallet.", "err", 10000);
    return;
  }

  try {
    let address = null, publicKey = null;

    if (det.type === "unisat") {
      const contas = await det.provider.requestAccounts();
      address = contas[0];
      publicKey = await det.provider.getPublicKey();
    } else if (det.type === "okx") {
      const r = await det.provider.connect();
      address = r.address;
      publicKey = r.publicKey;
    } else if (det.type === "leather") {
      const r = await det.provider.request("getAddresses");
      const lista = r?.result?.addresses || [];
      const pref = lista.find(a => a.type === "p2wpkh" || a.type === "p2tr") || lista[0];
      if (!pref) throw new Error("Nenhum endereço retornado");
      address = pref.address;
      publicKey = pref.publicKey;
    }

    if (!address) throw new Error("Carteira não retornou endereço");

    btcWallet = { ...det, address, publicKey };

    const st = $("btcWalletStatus");
    if (st) st.textContent = `✅ ${det.label}: ${address.slice(0, 10)}…${address.slice(-6)}`;
    const bc = $("btnConectarBTC");   if (bc) bc.style.display = "none";
    const bd = $("btnDesconectarBTC");if (bd) bd.style.display = "";

    toast(`✅ ${det.label} conectada!`, "ok");
    await atualizarSaldoBTCEnvio();
    atualizarStatusCarteiras();
  } catch (e) {
    console.error("Conectar BTC:", e);
    toast("❌ " + (e.message || "Falha ao conectar"), "err");
  }
}

function desconectarCarteiraBTC() {
  btcWallet = null;
  btcSaldoSats = 0;
  const st = $("btcWalletStatus");
  const bc = $("btnConectarBTC");
  const bd = $("btnDesconectarBTC");
  const bs = $("btcSaldoDisponivel");
  if (st) st.textContent = "Não conectada";
  if (bc) bc.style.display = "";
  if (bd) bd.style.display = "none";
  if (bs) bs.textContent = "—";
  toast("Carteira Bitcoin desconectada.", "info");
  atualizarStatusCarteiraBTC();
  atualizarStatusCarteiras();
}

async function atualizarSaldoBTCEnvio() {
  if (!btcWallet) { btcSaldoSats = 0; const el = $("btcSaldoDisponivel"); if (el) el.textContent = "—"; return; }
  try {
    const r = await fetchTimeout(`${BLOCKSTREAM_API}/address/${btcWallet.address}`, 10000);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const chain = d.chain_stats || {};
    const mem   = d.mempool_stats || {};
    btcSaldoSats =
      (chain.funded_txo_sum || 0) - (chain.spent_txo_sum || 0) +
      (mem.funded_txo_sum   || 0) - (mem.spent_txo_sum   || 0);
    const el = $("btcSaldoDisponivel");
    if (el) el.textContent = `${(btcSaldoSats / 1e8).toFixed(8)} BTC`;
  } catch (e) {
    console.warn("Falha ao consultar saldo BTC:", e.message);
    const el = $("btcSaldoDisponivel");
    if (el) el.textContent = "—";
  }
}

async function enviarBTC() {
  if (!btcWallet) { toast("Conecte uma carteira Bitcoin primeiro.", "warn"); return; }
  if (isTxBusy) return;
  isTxBusy = true;

  try {
    const destino   = $("btcDestinoEnvio").value.trim();
    const valorStr  = $("btcValorEnvio").value.trim().replace(",", ".");

    if (!isBtcAddressStrict(destino))
      throw new Error("Endereço Bitcoin inválido (use bc1…, 1… ou 3…)");
    if (!valorStr || isNaN(Number(valorStr)) || Number(valorStr) <= 0)
      throw new Error("Valor inválido");

    const sats = Math.round(Number(valorStr) * 1e8);
    if (sats <= 0) throw new Error("Valor muito pequeno");

    if (btcSaldoSats > 0 && sats > btcSaldoSats - RESERVA_TAXA_BTC_SATS) {
      throw new Error(
        `Saldo insuficiente. Você tem ${(btcSaldoSats / 1e8).toFixed(8)} BTC ` +
        `(reservando ~${RESERVA_TAXA_BTC_SATS} sats para taxa).`
      );
    }

    const ok = window.confirm(
      `Enviar ${valorStr} BTC (${sats} sats) para:\n${destino}\n\n⚠️ Transação irreversível. Continuar?`
    );
    if (!ok) { isTxBusy = false; return; }

    toast(`⏳ Solicitando assinatura na ${btcWallet.label}…`, "info");

    let txid = null;

    if (btcWallet.type === "unisat") {
      txid = await btcWallet.provider.sendBitcoin(destino, sats);
    } else if (btcWallet.type === "okx") {
      const r = await btcWallet.provider.sendBitcoin(destino, sats);
      txid = typeof r === "string" ? r : (r?.txid || r?.txhash);
    } else if (btcWallet.type === "leather") {
      const r = await btcWallet.provider.request("sendTransfer", {
        recipients: [{ address: destino, amount: sats }]
      });
      txid = r?.result?.txid || r?.txid;
    }

    if (!txid) throw new Error("A carteira não retornou o txid");

    toastBtcTx(txid);
    toast("✅ BTC enviado com sucesso!", "ok", 7000);

    $("btcDestinoEnvio").value = "";
    $("btcValorEnvio").value = "";
    setTimeout(atualizarSaldoBTCEnvio, 4000);
  } catch (e) {
    console.error("enviarBTC:", e);
    if (e.code === 4001 || /reject|cancel|denied/i.test(e.message || "")) toast("Envio cancelado.", "warn");
    else toast("❌ " + (e.message || "Erro desconhecido"), "err", 8000);
  } finally {
    isTxBusy = false;
  }
}

async function maxBTCEnvio() {
  if (!btcWallet) { toast("Conecte uma carteira Bitcoin primeiro.", "warn"); return; }
  await atualizarSaldoBTCEnvio();
  const disp = Math.max(0, btcSaldoSats - RESERVA_TAXA_BTC_SATS);
  if (disp <= 0) { toast("Saldo insuficiente (reserva de taxa).", "warn"); return; }
  $("btcValorEnvio").value = (disp / 1e8).toFixed(8);
}

function atualizarStatusCarteiraBTC() {
  const btn = $("btnConectarBTC");
  if (!btn) return;
  const det = !!(window.unisat || window.okxwallet?.bitcoin || window.LeatherProvider);
  if (btcWallet) {
    btn.textContent = "🔌 Reconectar BTC";
  } else if (det) {
    btn.textContent = "🔌 Conectar carteira BTC";
  } else {
    btn.textContent = "🔌 Instalar carteira BTC";
  }
}

// ============================================================
// Saldos e UI
// ============================================================
function preencherSeletores() {
  const tokensPolygon = TOKENS.filter(t => !t.somenteEth && !t.somenteBsc);
  const opts = tokensPolygon.map(t => `<option value="${t.address}">${t.symbol} — ${t.name}</option>`).join("");
  ["selOferece", "selDeseja", "selTokenEnvio"].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = opts;
  });

  const filtroOpts = tokensPolygon.map(t => `<option value="${t.address}">${t.symbol}</option>`).join("");
  const fo = $("filtroOferece");
  if (fo) fo.innerHTML = '<option value="">Oferece: Todos</option>' + filtroOpts;
  const fp = $("filtroPede");
  if (fp) fp.innerHTML = '<option value="">Pede: Todos</option>' + filtroOpts;
}

async function carregarSaldos() {
  if (!rpcProvider || !userAddress || !S) return;
  const t0 = Date.now();
  const falhas = [];
  try {
    saldos.POL = BigInt((await rpcProvider.getBalance(userAddress)).toString());
    for (const t of TOKENS) {
      if (t.somenteEth || t.somenteBsc) { saldos[t.address] = 0n; continue; }
      try {
        const res = await rpcProvider.call({ to: t.address, data: "0x" + S.ERC20.balanceOf + encAddr(userAddress) });
        saldos[t.address] = decUint(res.slice(2));
      } catch (e) {
        falhas.push(t.symbol);
        saldos[t.address] = 0n;
        console.warn(`⚠️ Falha ao ler ${t.symbol}:`, e.message);
      }
    }

    await Promise.all([
      carregarSaldosEthereum(),
      carregarSaldosBSC()
    ]);

    renderizarSaldos();
    atualizarHintCC();
    const dt = ((Date.now() - t0) / 1000).toFixed(2);
    if (falhas.length) console.warn(`⚠️ Saldos lidos em ${dt}s. Falhas: ${falhas.join(", ")}`);
    else console.log(`✅ Saldos lidos em ${dt}s`);
  } catch (e) { console.error("Erro ao carregar saldos:", e); }
}

async function carregarSaldosEthereum() {
  const tokensEth = TOKENS.filter(t => t.somenteEth);
  if (tokensEth.length === 0) return;

  if (!ethProvider) {
    const ok = await conectarRPCEth();
    if (!ok) {
      console.warn("⚠️ Não foi possível conectar à rede Ethereum — pulando saldos ETH");
      return;
    }
  }

  try {
    saldos["ETH_NATIVO"] = BigInt((await ethProvider.getBalance(userAddress)).toString());
  } catch (e) {
    console.warn("Falha ao ler ETH nativo:", e.message);
    saldos["ETH_NATIVO"] = 0n;
  }

  for (const t of tokensEth) {
    try {
      const res = await ethProvider.call({
        to: t.address,
        data: "0x" + S.ERC20.balanceOf + encAddr(userAddress)
      });
      saldos[t.address] = decUint(res.slice(2));
    } catch (e) {
      console.warn(`Falha ao ler ${t.symbol} na Ethereum:`, e.message);
      saldos[t.address] = 0n;
    }
  }
}

async function carregarSaldosBSC() {
  const tokensBsc = TOKENS.filter(t => t.somenteBsc);
  if (tokensBsc.length === 0) return;

  if (!bscProvider) {
    const ok = await conectarRPCBSC();
    if (!ok) {
      console.warn("⚠️ Não foi possível conectar à BSC — pulando saldos BSC");
      return;
    }
  }

  try {
    saldos["BNB_NATIVO"] = BigInt((await bscProvider.getBalance(userAddress)).toString());
  } catch (e) {
    console.warn("Falha ao ler BNB nativo:", e.message);
    saldos["BNB_NATIVO"] = 0n;
  }

  for (const t of tokensBsc) {
    try {
      const res = await bscProvider.call({
        to: t.address,
        data: "0x" + S.ERC20.balanceOf + encAddr(userAddress)
      });
      saldos[t.address] = decUint(res.slice(2));
    } catch (e) {
      console.warn(`Falha ao ler ${t.symbol} na BSC:`, e.message);
      saldos[t.address] = 0n;
    }
  }
}

// ============================================================
// CARD DE SALDO COM RODAPÉ "ENDEREÇO BRN" (MARROM)
// ============================================================
function renderizarSaldos() {
  const container = $("balances");
  if (!container) return;
  container.innerHTML = "";

  const add = (simbolo, valor, decimais, opts = {}) => {
    const { aviso = null, tokenAddr = null } = opts;
    const div = document.createElement("div");
    div.className = "bal";
    const classe = valor === 0n ? "v dim" : "v";

    const copyBtn = tokenAddr
      ? `<button class="btn-copy-token" data-copy="${tokenAddr}" data-symbol="${simbolo}" title="Copiar endereço do contrato">📋</button>`
      : "";

    const enderecoCompleto = userAddress || "— Não conectada —";
    const enderecoCurto = userAddress ? short(userAddress) : "— Não conectada —";

    const rodape = `
      <div class="bal-endereco" data-copy="${enderecoCompleto}" title="Clique para copiar: ${enderecoCompleto}">
        <span class="bal-endereco-label">ENDEREÇO BRN:</span>
        <span class="bal-endereco-valor">${enderecoCurto}</span>
      </div>
    `;

    div.innerHTML = `
      <span class="t">${simbolo}${aviso ? " ⚠️" : ""}${copyBtn}</span>
      <span class="${classe}">${fmt(valor, decimais)}</span>
      ${aviso ? `<span class="bal-sub">${aviso}</span>` : ""}
      ${rodape}
    `;
    container.appendChild(div);
  };

  // ---------- POLYGON ----------
  add("POL (Polygon)", saldos.POL, 18);
  TOKENS.forEach(t => {
    if (t.somenteEth || t.somenteBsc) return;
    const valor = saldos[t.address] || 0n;
    const rede = t.rede || "Polygon";
    add(`${t.symbol} (${rede})`, valor, t.decimals, { tokenAddr: t.address });
  });

  // ---------- ETHEREUM ----------
  const tokensEth = TOKENS.filter(t => t.somenteEth);
  if (tokensEth.length > 0) {
    const sep = document.createElement("div");
    sep.style.cssText = "grid-column: 1 / -1; height: 1px; background: var(--border); margin: 10px 0 6px 0;";
    container.appendChild(sep);

    const header = document.createElement("div");
    header.style.cssText = "grid-column: 1 / -1; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px; font-weight: 600;";
    header.textContent = "⛓️ Saldos na rede Ethereum (somente leitura)";
    container.appendChild(header);

    if (saldos.ETH_NATIVO !== undefined) {
      add("ETH (Ethereum)", saldos.ETH_NATIVO, 18);
    }

    tokensEth.forEach(t => {
      const valor = saldos[t.address] || 0n;
      add(`${t.symbol} (Ethereum)`, valor, t.decimals, { tokenAddr: t.address });
    });
  }

  // ---------- BSC / BNB CHAIN ----------
  const tokensBsc = TOKENS.filter(t => t.somenteBsc);
  if (tokensBsc.length > 0) {
    const sep = document.createElement("div");
    sep.style.cssText = "grid-column: 1 / -1; height: 1px; background: var(--border); margin: 10px 0 6px 0;";
    container.appendChild(sep);

    const header = document.createElement("div");
    header.style.cssText = "grid-column: 1 / -1; font-size: 0.85rem; color: #f0b90b; margin-bottom: 4px; font-weight: 600;";
    header.textContent = "🟡 Saldos na BSC / BNB Chain (somente leitura)";
    container.appendChild(header);

    if (saldos.BNB_NATIVO !== undefined) {
      add("BNB (BSC)", saldos.BNB_NATIVO, 18);
    }

    tokensBsc.forEach(t => {
      const valor = saldos[t.address] || 0n;
      add(`${t.symbol} (BSC)`, valor, t.decimals, { tokenAddr: t.address });
    });
  }

  // ---------- Hints ----------
  document.querySelectorAll("[data-hint]").forEach(el => {
    const attr = el.getAttribute("data-hint") || "";
    const partes = attr.split(":");
    const tipo = partes[0], ref = partes[1];

    if (tipo === "saldoPOL") el.textContent = fmt(saldos.POL, 18);
    if (tipo === "saldoPOLDisponivel") el.textContent = fmt(calcularPOLDisponivel(), 18);
    if (tipo === "saldoWPOL") {
      const wpol = TOKENS.find(t => t.symbol === "WPOL");
      el.textContent = wpol ? fmt(saldos[wpol.address] || 0n, 18) : "0";
    }
    if (tipo === "saldo" && ref) {
      const s = $(ref);
      if (s && s.value) {
        const tok = tokenPorEndereco(s.value);
        if (tok) {
          const val = saldos[tok.address] || 0n;
          el.textContent = `Saldo: ${fmt(val, tok.decimals)} ${tok.symbol}`;
        }
      }
    }
  });

  atualizarHintWbtc();

  container.querySelectorAll(".btn-copy-token").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const addr = btn.getAttribute("data-copy");
      const sym  = btn.getAttribute("data-symbol") || "token";

      const copiar = async (texto) => {
        try {
          await navigator.clipboard.writeText(texto);
          return true;
        } catch {
          const ta = document.createElement("textarea");
          ta.value = texto;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          let ok = false;
          try { ok = document.execCommand("copy"); } catch {}
          ta.remove();
          return ok;
        }
      };

      const ok = await copiar(addr);
      if (ok) {
        const nomeLimpo = sym.replace(/\s*\((Polygon|Ethereum|BSC)\)$/, "");
        toast(`✅ Contrato do ${nomeLimpo} copiado!`, "ok", 7000);
      } else {
        toast("❌ Não foi possível copiar.", "err");
      }
    });
  });

  container.querySelectorAll(".bal-endereco").forEach(el => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const endereco = el.getAttribute("data-copy");
      if (!endereco || endereco === "— Não conectada —") {
        toast("⚠️ Conecte a carteira primeiro.", "warn");
        return;
      }
      try {
        await navigator.clipboard.writeText(endereco);
        toast(`✅ Endereço BRN copiado!`, "ok", 5000);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = endereco;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          toast(`✅ Endereço BRN copiado!`, "ok", 5000);
        } catch {
          toast("❌ Não foi possível copiar.", "err");
        }
        ta.remove();
      }
    });
  });
}

// ============================================================
// Modal "Carteiras Aceitas"
// ============================================================
function abrirModalCarteiras() {
  const modal = $("modalCarteiras");
  if (!modal) return;
  renderizarModalCarteiras();
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function fecharModalCarteiras() {
  const modal = $("modalCarteiras");
  if (!modal) return;
  modal.style.display = "none";
  document.body.style.overflow = "";
}

function renderizarModalCarteiras() {
  const evmDetectadasEl = $("modalEvmDetectadas");
  const evmOutrasEl = $("modalEvmOutras");
  const btcEl = $("modalBtc");

  if (evmDetectadasEl && evmOutrasEl) {
    const detectadas = WALLETS_EVM_CATALOG.filter(w => carteiraEvmDetectada(w.rdns));
    const outras = WALLETS_EVM_CATALOG.filter(w => !carteiraEvmDetectada(w.rdns));

    evmDetectadasEl.innerHTML = "";
    if (detectadas.length === 0) {
      evmDetectadasEl.innerHTML = `<p class="dim" style="grid-column: 1 / -1; text-align: center; padding: 12px;">Nenhuma carteira EVM detectada. Instale uma das opções abaixo.</p>`;
    } else {
      detectadas.forEach(w => {
        const card = document.createElement("div");
        card.className = "carteira-card detectada";
        card.innerHTML = `
          <span class="carteira-icon">${w.icon}</span>
          <span class="carteira-nome">${w.name}</span>
          <span class="carteira-status ok">✅ Instalada</span>
          <button class="carteira-btn primary" data-rdns="${w.rdns}">Conectar</button>
        `;
        card.querySelector("button").addEventListener("click", () => {
          fecharModalCarteiras();
          conectarCarteira(w.rdns);
        });
        evmDetectadasEl.appendChild(card);
      });
    }

    evmOutrasEl.innerHTML = "";
    if (outras.length === 0) {
      evmOutrasEl.innerHTML = `<p class="dim" style="grid-column: 1 / -1; text-align: center; padding: 12px;">Você já tem todas as carteiras compatíveis instaladas! 🎉</p>`;
    } else {
      outras.forEach(w => {
        const card = document.createElement("div");
        card.className = "carteira-card indisponivel";
        card.innerHTML = `
          <span class="carteira-icon">${w.icon}</span>
          <span class="carteira-nome">${w.name}</span>
          <span class="carteira-status off">❌ Não instalada</span>
          <a class="carteira-btn" href="${w.install}" target="_blank" rel="noopener">Instalar</a>
        `;
        evmOutrasEl.appendChild(card);
      });
    }
  }

  if (btcEl) {
    btcEl.innerHTML = "";
    const detectadasBtc = [];
    const outrasBtc = [];

    WALLETS_BTC_CATALOG.forEach(w => {
      let ok = false;
      try { ok = w.check(); } catch {}
      if (ok) detectadasBtc.push(w);
      else outrasBtc.push(w);
    });

    detectadasBtc.forEach(w => {
      const card = document.createElement("div");
      card.className = "carteira-card detectada";
      card.innerHTML = `
        <span class="carteira-icon">${w.icon}</span>
        <span class="carteira-nome">${w.name}</span>
        <span class="carteira-status ok">✅ Instalada</span>
        <button class="carteira-btn btc">Conectar BTC</button>
      `;
      card.querySelector("button").addEventListener("click", () => {
        fecharModalCarteiras();
        conectarCarteiraBTC();
      });
      btcEl.appendChild(card);
    });

    outrasBtc.forEach(w => {
      const card = document.createElement("div");
      card.className = "carteira-card indisponivel";
      card.innerHTML = `
        <span class="carteira-icon">${w.icon}</span>
        <span class="carteira-nome">${w.name}</span>
        <span class="carteira-status off">❌ Não instalada</span>
        <a class="carteira-btn" href="${w.install}" target="_blank" rel="noopener">Instalar</a>
      `;
      btcEl.appendChild(card);
    });
  }
}

// ============================================================
// Conexão de carteira
// ============================================================
async function conectarCarteira(rdnsForcado) {
  const carteiras = listarCarteirasDisponiveis();

  if (carteiras.length === 0) {
    toast("❌ Nenhuma carteira EVM detectada. Instale MetaMask, Trust Wallet ou Rabby.", "err", 10000);
    return;
  }

  let escolhida = null;

  if (rdnsForcado) {
    escolhida = carteiras.find(c => c.rdns === rdnsForcado);
    if (!escolhida) {
      toast("❌ Carteira não detectada pelo EIP-6963.", "err");
      return;
    }
  } else if (carteiras.length === 1) {
    escolhida = carteiras[0];
  } else {
    const nomes = carteiras.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
    const escolha = window.prompt(
      `Múltiplas carteiras detectadas:\n\n${nomes}\n\nDigite o número da carteira que deseja usar:`
    );
    if (!escolha) return;
    const idx = parseInt(escolha) - 1;
    if (isNaN(idx) || idx < 0 || idx >= carteiras.length) {
      toast("❌ Escolha inválida.", "warn");
      return;
    }
    escolhida = carteiras[idx];
  }

  const providerEscolhido = obterProviderPorRdns(escolhida.rdns);
  if (!providerEscolhido) {
    toast("❌ Carteira não encontrada.", "err");
    return;
  }

  toast(`🔌 Conectando à ${escolhida.name}…`, "info");

  try {
    provider = new ethers.providers.Web3Provider(providerEscolhido);
    const contas = await provider.send("eth_requestAccounts", []);
    if (!contas.length) throw new Error("Nenhuma conta encontrada");
    userAddress = ethers.utils.getAddress(contas[0]).toLowerCase();
    signer = provider.getSigner();
    walletEscolhidaRdns = escolhida.rdns;

    let rede = await provider.getNetwork();
    if (rede.chainId !== POLYGON_CHAIN_ID) {
      toast("⚠️ Mudando para Polygon Mainnet…", "warn");
      try {
        await provider.send("wallet_switchEthereumChain", [{ chainId: "0x89" }]);
        await new Promise(r => setTimeout(r, 500));
        rede = await provider.getNetwork();
        if (rede.chainId !== POLYGON_CHAIN_ID) {
          toast("❌ Selecione manualmente a rede Polygon na carteira", "err", 8000);
          return;
        }
      } catch {
        toast("❌ Selecione manualmente a rede Polygon na carteira", "err", 8000);
        return;
      }
    }

    $("btnConnect").style.display = "none";
    $("walletInfo").style.display = "flex";
    $("addr").textContent = short(userAddress);

    toast(`✅ ${escolhida.name} conectada!`, "ok");
    await carregarSaldos();
    await carregarOrdens();
    configurarEventosWallet();
    atualizarStatusCarteiras();
  } catch (e) {
    console.error("conectarCarteira:", e);
    if (e.code === 4001) toast("Conexão recusada.", "warn");
    else toast("Erro: " + (e.message || "Erro desconhecido"), "err");
  }
}

function desconectarCarteira() {
  provider = null;
  signer = null;
  userAddress = null;
  walletEscolhidaRdns = null;
  saldos = { POL: 0n };
  eventosWalletConfigurados = false;

  if ($("btnConnect")) $("btnConnect").style.display = "block";
  if ($("walletInfo")) $("walletInfo").style.display = "none";
  fecharPainelCompartilhar();
  renderizarSaldos();
  aplicarFiltros();
  toast("Desconectado", "info");
  atualizarStatusCarteiras();
}

// ============================================================
// Compartilhar endereço
// ============================================================
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
      novo.addEventListener("click", async (ev) => {
        ev.preventDefault();
        try {
          await navigator.share({ title: "Meu Endereço BRN", text: texto });
        } catch (err) {
          if (err.name !== "AbortError") console.warn("Share cancelado:", err.message);
        }
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
  const p = $("sharePanel");
  if (p) p.style.display = "none";
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
    try {
      document.execCommand("copy");
      toast("✅ Endereço copiado!", "ok");
    } catch {
      toast("❌ Não foi possível copiar.", "err");
    }
    ta.remove();
  }
}

// ============================================================
// Mural
// ============================================================
async function carregarOrdens() {
  if (loading || !rpcProvider || !S) return;
  loading = true;

  const container = $("orders");
  const counter = $("counter");

  try {
    if (counter) counter.textContent = "⏳ Consultando…";
    if (container) container.innerHTML = '<div class="state"><div class="spinner"></div><p>Carregando ordens…</p></div>';

    const listaRes = await rpcProvider.call({
      to: ESCROW_FACTORY,
      data: "0x" + S.Factory.todasOrdens
    });
    const enderecos = decodificarListaEnderecos(listaRes);
    const total = enderecos.length;

    if (counter) counter.textContent = `${total} ordem${total !== 1 ? "ens" : ""}`;

    if (total === 0) {
      if (container) container.innerHTML = '<div class="empty"><div class="big">📋</div><p>Nenhuma ordem encontrada.</p></div>';
      ordersCache = [];
      return;
    }

    const ordens = [];
    await Promise.all(enderecos.map(async (endereco, i) => {
      try {
        const dadosRes = await rpcProvider.call({
          to: endereco,
          data: "0x" + S.Escrow.obterDados
        });
        const d = decodificarOrdem(dadosRes);
        ordens.push({
          indice: i,
          endereco,
          criador: d.criador,
          tokenOferecido: d.tokenOferecido,
          valorOferecido: d.valorOferecido,
          tokenDesejado: d.tokenDesejado,
          valorDesejado: d.valorDesejado,
          executado: d.executado,
          cancelado: d.cancelado
        });
      } catch (e) {
        if (!/missing revert data|call exception|timeout/i.test(e.message || "")) {
          console.warn(`Erro na ordem ${i} (${endereco}):`, e.message);
        }
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

// ============================================================
// Criar / executar / cancelar ordem
// ============================================================
async function criarOrdem() {
  if (!signer || !userAddress || isTxBusy || !S) return;
  isTxBusy = true;

  try {
    const ofAddr = $("selOferece").value;
    const deAddr = $("selDeseja").value;
    const ofToken = tokenPorEndereco(ofAddr);
    const deToken = tokenPorEndereco(deAddr);

    if (!ofToken || !deToken) throw new Error("Selecione os tokens");
    if (mesmoAddr(ofAddr, deAddr)) throw new Error("Tokens devem ser diferentes");

    if (ofToken.somenteEth || deToken.somenteEth || ofToken.somenteBsc || deToken.somenteBsc) {
      throw new Error("Token de outra rede não suportado. Este app opera apenas na Polygon para trocas.");
    }

    const ofStr = $("valorOferece").value.trim().replace(",", ".");
    const deStr = $("valorDeseja").value.trim().replace(",", ".");
    if (!ofStr || isNaN(Number(ofStr)) || Number(ofStr) <= 0) throw new Error("Valor oferecido inválido");
    if (!deStr || isNaN(Number(deStr)) || Number(deStr) <= 0) throw new Error("Valor desejado inválido");

    const ofVal = parseUnits(ofStr, ofToken.decimals);
    const deVal = parseUnits(deStr, deToken.decimals);

    const saldo = decUint((await rpcProvider.call({
      to: ofAddr,
      data: "0x" + S.ERC20.balanceOf + encAddr(userAddress)
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
      toastTx("📤 Aprovação:", tx.hash, "ok");
      await tx.wait();
      toast("✅ Aprovado!", "ok");
    }

    toast("⏳ Criando ordem…", "info");
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
    toast("✅ Ordem criada com sucesso!", "ok", 6000);

    $("valorOferece").value = "";
    $("valorDeseja").value = "";
    await carregarSaldos();
    await carregarOrdens();
  } catch (e) {
    console.error("criarOrdem:", e);
    const { msg, tipo } = traduzirErro(e);
    toast(msg, tipo, 8000);
  } finally {
    isTxBusy = false;
  }
}

async function executarOrdem(escrowAddr) {
  if (!signer || !userAddress || isTxBusy || !S) return;
  isTxBusy = true;
  try {
    const dadosRes = await rpcProvider.call({ to: escrowAddr, data: "0x" + S.Escrow.obterDados });
    const d = decodificarOrdem(dadosRes);

    const allowance = decUint((await rpcProvider.call({
      to: d.tokenDesejado,
      data: "0x" + S.ERC20.allowance + encAddr(userAddress) + encAddr(escrowAddr)
    })).slice(2));

    if (allowance < d.valorDesejado) {
      const tok = tokenPorEndereco(d.tokenDesejado);
      toast(`⏳ Aprovando ${tok?.symbol || "token"}…`, "info");
      const txA = await signer.sendTransaction({
        to: d.tokenDesejado,
        data: "0x" + S.ERC20.approve + encAddr(escrowAddr) + encUint(d.valorDesejado),
        gasLimit: 100000
      });
      toastTx("📤 Aprovação:", txA.hash, "ok");
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
    toast("✅ Ordem executada!", "ok", 6000);
    await carregarSaldos();
    await carregarOrdens();
  } catch (e) {
    console.error("executarOrdem:", e);
    const { msg, tipo } = traduzirErro(e);
    toast(msg, tipo, 8000);
  } finally {
    isTxBusy = false;
  }
}

async function cancelarOrdem(escrowAddr) {
  if (!signer || isTxBusy || !S) return;
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
    toast("✅ Ordem cancelada!", "ok", 6000);
    await carregarSaldos();
    await carregarOrdens();
  } catch (e) {
    console.error("cancelarOrdem:", e);
    const { msg, tipo } = traduzirErro(e);
    toast(msg, tipo, 8000);
  } finally {
    isTxBusy = false;
  }
}

// ============================================================
// Enviar token ERC-20
// ============================================================
async function enviarToken() {
  if (!signer || !userAddress || isTxBusy || !S) return;
  isTxBusy = true;
  try {
    const tokenAddr = $("selTokenEnvio").value;
    const destino = $("destinoEnvio").value.trim();
    const valorStr = $("valorEnvio").value.trim().replace(",", ".");
    const token = tokenPorEndereco(tokenAddr);

    if (!token) throw new Error("Selecione um token");
    if (token.somenteEth || token.somenteBsc) throw new Error("Token de outra rede não suportado. Este app opera apenas na Polygon.");
    if (!isAddr(destino)) throw new Error("Endereço inválido");
    if (mesmoAddr(destino, userAddress)) throw new Error("Não pode enviar para você mesmo");
    if (!valorStr || isNaN(Number(valorStr)) || Number(valorStr) <= 0) throw new Error("Valor inválido");

    const valor = parseUnits(valorStr, token.decimals);
    const saldo = saldos[token.address] || 0n;
    if (saldo < valor) throw new Error(`Saldo insuficiente de ${token.symbol}`);

    toast(`⏳ Enviando ${fmt(valor, token.decimals, 4)} ${token.symbol}…`, "info");

    const tx = await signer.sendTransaction({
      to: token.address,
      data: "0x" + S.ERC20.transfer + encAddr(destino) + encUint(valor),
      gasLimit: 100000
    });
    toastTx("📤 Transação:", tx.hash, "ok");
    await tx.wait();
    toast(`✅ ${token.symbol} enviado!`, "ok", 6000);
    $("destinoEnvio").value = "";
    $("valorEnvio").value = "";
    await carregarSaldos();
  } catch (e) {
    console.error("enviarToken:", e);
    const { msg, tipo } = traduzirErro(e);
    toast(msg, tipo, 8000);
  } finally {
    isTxBusy = false;
  }
}

// ============================================================
// Wrap / unwrap POL
// ============================================================
async function wrapPOL() {
  if (!signer || !userAddress || isTxBusy || !S) return;
  isTxBusy = true;
  try {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    const valorStr = $("valorWPOL").value.trim().replace(",", ".");
    if (!valorStr || isNaN(Number(valorStr)) || Number(valorStr) <= 0) throw new Error("Valor inválido");
    const valor = parseUnits(valorStr, 18);

    if (valor > saldos.POL) {
      throw new Error(`Saldo insuficiente. Você tem ${fmt(saldos.POL, 18)} POL.`);
    }

    toast(`⏳ Convertendo ${fmt(valor, 18, 4)} POL → WPOL…`, "info");
    const tx = await signer.sendTransaction({
      to: wpol.address,
      data: "0x" + S.WPOL.deposit,
      value: valor,
      gasLimit: 100000
    });
    toastTx("📤 Transação enviada:", tx.hash, "ok");
    await tx.wait();
    toast("✅ POL convertido em WPOL!", "ok", 6000);
    $("valorWPOL").value = "";
    await carregarSaldos();
  } catch (e) {
    console.error("wrapPOL:", e);
    const { msg, tipo } = traduzirErro(e);
    toast(msg, tipo, 8000);
  } finally {
    isTxBusy = false;
  }
}

async function unwrapWPOL() {
  if (!signer || !userAddress || isTxBusy || !S) return;
  isTxBusy = true;
  try {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    const valorStr = $("valorPOL").value.trim().replace(",", ".");
    if (!valorStr || isNaN(Number(valorStr)) || Number(valorStr) <= 0) throw new Error("Valor inválido");
    const valor = parseUnits(valorStr, 18);

    const saldoWPOL = saldos[wpol.address] || 0n;
    if (valor > saldoWPOL) {
      throw new Error(`Saldo insuficiente. Você tem ${fmt(saldoWPOL, 18)} WPOL.`);
    }

    toast(`⏳ Convertendo ${fmt(valor, 18, 4)} WPOL → POL…`, "info");
    const tx = await signer.sendTransaction({
      to: wpol.address,
      data: "0x" + S.WPOL.withdraw + encUint(valor),
      gasLimit: 100000
    });
    toastTx("📤 Transação enviada:", tx.hash, "ok");
    await tx.wait();
    toast("✅ WPOL convertido em POL!", "ok", 6000);
    $("valorPOL").value = "";
    await carregarSaldos();
  } catch (e) {
    console.error("unwrapWPOL:", e);
    const { msg, tipo } = traduzirErro(e);
    toast(msg, tipo, 8000);
  } finally {
    isTxBusy = false;
  }
}

// ============================================================
// Configuração de abas / filtros / max / botões
// ============================================================
function configurarAbas() {
  document.querySelectorAll(".tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      const aba = btn.dataset.tab;
      document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".panel").forEach(p => p.hidden = true);
      const alvo = $(`panel-${aba}`);
      if (alvo) alvo.hidden = false;

      if (aba === "bitcoin") {
        setTimeout(atualizarHintWbtc, 100);
        setTimeout(atualizarStatusCarteiraBTC, 100);
        if (btcWallet) setTimeout(atualizarSaldoBTCEnvio, 200);
      }

      if (aba === "crosschain") {
        setTimeout(atualizarHintCC, 100);
      }

      setTimeout(renderizarSaldos, 50);
    });
  });
}

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

function configurarMax() {
  const m1 = $("btnMaxOf");
  if (m1) m1.addEventListener("click", () => {
    const selEl = $("selOferece");
    if (!selEl || !selEl.value) return;
    const tok = tokenPorEndereco(selEl.value);
    const saldo = saldos[tok.address] || 0n;
    if (saldo > 0n) $("valorOferece").value = ethers.utils.formatUnits(saldo, tok.decimals);
  });

  const m2 = $("btnMaxSend");
  if (m2) m2.addEventListener("click", () => {
    const selEl = $("selTokenEnvio");
    if (!selEl || !selEl.value) return;
    const tok = tokenPorEndereco(selEl.value);
    const saldo = saldos[tok.address] || 0n;
    if (saldo > 0n) $("valorEnvio").value = ethers.utils.formatUnits(saldo, tok.decimals);
  });

  const m3 = $("btnMaxWrap");
  if (m3) m3.addEventListener("click", () => {
    const reserva = parseUnits("0.01", 18);
    const disponivel = saldos.POL > reserva ? saldos.POL - reserva : 0n;
    if (disponivel > 0n) $("valorWPOL").value = ethers.utils.formatUnits(disponivel, 18);
  });

  const m4 = $("btnMaxUnwrap");
  if (m4) m4.addEventListener("click", () => {
    const wpol = TOKENS.find(t => t.symbol === "WPOL");
    const saldo = saldos[wpol.address] || 0n;
    if (saldo > 0n) $("valorPOL").value = ethers.utils.formatUnits(saldo, 18);
  });

  const m5 = $("btnMaxWbtcBridge");
  if (m5) m5.addEventListener("click", () => {
    const wbtc = TOKENS.find(t => t.symbol === "WBTC");
    const saldo = saldos[wbtc.address] || 0n;
    if (saldo > 0n) $("valorWbtcBridge").value = ethers.utils.formatUnits(saldo, wbtc.decimals);
  });

  const m6 = $("btnMaxPOLEnvio");
  if (m6) m6.addEventListener("click", () => {
    const disponivel = calcularPOLDisponivel();
    if (disponivel > 0n) {
      $("valorPOLEnvio").value = ethers.utils.formatUnits(disponivel, 18);
    } else {
      toast("Saldo insuficiente (reserva de gas).", "warn");
    }
  });

  const m7 = $("btnMaxBTCEnvio");
  if (m7) m7.addEventListener("click", maxBTCEnvio);

  const m8 = $("btnMaxCC");
  if (m8) m8.addEventListener("click", () => {
    const origemKey = $("ccTokenOrigem").value;
    const origem = SIDESHIFT_MAP[origemKey];
    if (!origem) return;
    const token = TOKENS.find(t => t.symbol === origem.tokenSymbol);
    if (token && saldos[token.address] > 0n) {
      $("ccValor").value = ethers.utils.formatUnits(saldos[token.address], token.decimals);
    }
  });
}

function configurarBotoes() {
  const c  = $("btnConnect");        if (c)  c.addEventListener("click", () => conectarCarteira());
  const d  = $("btnDisconnect");     if (d)  d.addEventListener("click", desconectarCarteira);
  const sa = $("btnShareAddr");      if (sa) sa.addEventListener("click", abrirPainelCompartilhar);
  const cs = $("btnCloseShare");     if (cs) cs.addEventListener("click", fecharPainelCompartilhar);
  const cp = $("btnCopyAddr");       if (cp) cp.addEventListener("click", copiarEndereco);
  const co = $("btnCriarOrdem");     if (co) co.addEventListener("click", criarOrdem);
  const en = $("btnEnviar");         if (en) en.addEventListener("click", enviarToken);
  const cw = $("btnConverterWPOL");  if (cw) cw.addEventListener("click", wrapPOL);
  const cu = $("btnConverterPOL");   if (cu) cu.addEventListener("click", unwrapWPOL);
  const cb = $("btnConsultarBTC");   if (cb) cb.addEventListener("click", consultarSaldoBTC);
  const rf = $("btnRefresh");        if (rf) rf.addEventListener("click", carregarOrdens);

  const bb = $("btnAbrirBridge");    if (bb) bb.addEventListener("click", criarOrdemSideShift);
  const bc = $("btnCopyDeposit");    if (bc) bc.addEventListener("click", copiarDepositAddress);

  const ep = $("btnEnviarPOL");      if (ep) ep.addEventListener("click", enviarPOL);

  const cbBTC = $("btnConectarBTC");     if (cbBTC) cbBTC.addEventListener("click", conectarCarteiraBTC);
  const dbBTC = $("btnDesconectarBTC");  if (dbBTC) dbBTC.addEventListener("click", desconectarCarteiraBTC);
  const ebBTC = $("btnEnviarBTC");       if (ebBTC) ebBTC.addEventListener("click", enviarBTC);

  const ccBtn = $("btnCriarCC");         if (ccBtn) ccBtn.addEventListener("click", criarOrdemCrossChain);
  const ccCopy = $("btnCopyCCDeposit");  if (ccCopy) ccCopy.addEventListener("click", copiarCCDepositAddress);
  const ccSel = $("ccTokenOrigem");      if (ccSel) ccSel.addEventListener("change", atualizarHintCC);

  const bc1 = $("btnCarteirasAceitas");        if (bc1) bc1.addEventListener("click", abrirModalCarteiras);
  const bc2 = $("btnFecharModalCarteiras");    if (bc2) bc2.addEventListener("click", fecharModalCarteiras);
  const bc3 = $("btnFecharModalCarteiras2");   if (bc3) bc3.addEventListener("click", fecharModalCarteiras);

  const modalCart = $("modalCarteiras");
  if (modalCart) {
    modalCart.addEventListener("click", (e) => {
      if (e.target === modalCart) fecharModalCarteiras();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharModalCarteiras();
  });

  ["selOferece", "selDeseja", "selTokenEnvio"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("change", renderizarSaldos);
  });

  const btcIn = $("btcAddressInput");
  if (btcIn) btcIn.addEventListener("keydown", e => { if (e.key === "Enter") consultarSaldoBTC(); });

  const btcDest = $("btcDestinoBridge");
  if (btcDest) btcDest.addEventListener("keydown", e => { if (e.key === "Enter") criarOrdemSideShift(); });

  const polDest = $("destinoPOL");
  if (polDest) polDest.addEventListener("keydown", e => { if (e.key === "Enter") enviarPOL(); });

  const btcDestEnv = $("btcDestinoEnvio");
  if (btcDestEnv) btcDestEnv.addEventListener("keydown", e => { if (e.key === "Enter") enviarBTC(); });
  const btcValEnv = $("btcValorEnvio");
  if (btcValEnv) btcValEnv.addEventListener("keydown", e => { if (e.key === "Enter") enviarBTC(); });
}

function iniciarAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!loading) carregarOrdens();
    if (userAddress) carregarSaldos();
  }, REFRESH_MS);
}

function configurarEventosWallet() {
  if (eventosWalletConfigurados) return;

  const prov = walletEscolhidaRdns
    ? obterProviderPorRdns(walletEscolhidaRdns)
    : window.ethereum;

  if (!prov || !prov.on) return;

  eventosWalletConfigurados = true;

  prov.on("accountsChanged", (contas) => {
    if (!contas || !contas.length) {
      desconectarCarteira();
    } else {
      userAddress = ethers.utils.getAddress(contas[0]).toLowerCase();
      const a = $("addr"); if (a) a.textContent = short(userAddress);
      carregarSaldos();
      carregarOrdens();
      atualizarStatusCarteiras();
    }
  });

  prov.on("chainChanged", () => window.location.reload());
}

// ============================================================
// init
// ============================================================
async function init() {
  console.log("🚀 BRN Exchange v6.14 — inicializando…");

  inicializarDescobertaCarteiras();

  try {
    construirSeletores();
  } catch (e) {
    console.error("❌ Falha ao calcular seletores:", e);
    toast("❌ Erro crítico: " + e.message, "err", 15000);
    return;
  }

  try {
    preencherSeletores();
    configurarAbas();
    configurarFiltros();
    configurarMax();
    configurarBotoes();
    atualizarStatusCarteiraBTC();
    atualizarStatusCarteiras();
  } catch (e) {
    console.error("❌ Falha ao configurar UI:", e);
    toast("⚠️ Erro na configuração da UI: " + e.message, "warn", 10000);
  }

  try {
    const [okPoly] = await Promise.all([
      atualizarStatusRede(),
      verificarStatusRedeBitcoin()
    ]);

    conectarRPCEth().catch(() => {});
    conectarRPCBSC().catch(() => {});

    await new Promise(r => setTimeout(r, 600));

    if (okPoly) {
      const carteiras = listarCarteirasDisponiveis();
      for (const c of carteiras) {
        try {
          const prov = obterProviderPorRdns(c.rdns);
          if (!prov) continue;
          const contas = await prov.request({ method: "eth_accounts" });
          if (contas && contas.length) {
            provider = new ethers.providers.Web3Provider(prov);
            userAddress = ethers.utils.getAddress(contas[0]).toLowerCase();
            signer = provider.getSigner();
            walletEscolhidaRdns = c.rdns;

            const rede = await provider.getNetwork();
            if (rede.chainId === POLYGON_CHAIN_ID) {
              const bc = $("btnConnect"); if (bc) bc.style.display = "none";
              const wi = $("walletInfo"); if (wi) wi.style.display = "flex";
              const a  = $("addr");       if (a)  a.textContent = short(userAddress);
              await carregarSaldos();
              console.log(`✅ Reconectado via ${c.name}`);
              break;
            }
          }
        } catch { /* tenta próxima */ }
      }
      configurarEventosWallet();
      atualizarStatusCarteiras();
    }

    try {
      atualizarStatusCarteiraBTC();
      if (window.unisat) {
        const contas = await window.unisat.getAccounts();
        if (contas && contas.length) await conectarCarteiraBTC();
      }
      atualizarStatusCarteiras();
    } catch (e) {
      console.warn("Auto-conexão BTC falhou:", e.message);
    }

    if (okPoly) await carregarOrdens();

    iniciarAutoRefresh();
    console.log("✅ Pronto.");
  } catch (e) {
    console.error("❌ Falha na conexão de rede:", e);
    toast("❌ Erro ao conectar redes: " + e.message, "err", 12000);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
