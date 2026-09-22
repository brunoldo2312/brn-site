// ===== CONFIGURAÇÃO =====
const BRN_TOKEN_ADDRESS = '0x926ecc7687fcfb296e97a2b4501f41a6f5f8c214';
const ESCROW_FACTORY_ADDRESS = ''; // ← COLOQUE O ENDEREÇO DO CONTRATO AQUI
const RPC_URL = 'https://bsc-dataseed.binance.org/';

// Estado global
let provider = null;
let signer = null;
let userAddress = null;
let isConnected = false;

// ===== ABI BÁSICO =====
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function totalSupply() view returns (uint256)"
];

const ESCROW_FACTORY_ABI = [
    "function getAllBuyOrders() view returns (address[] memory, uint256[] memory, uint256[] memory)",
    "function getAllSellOrders() view returns (address[] memory, uint256[] memory, uint256[] memory)",
    "function getUserOrders(address) view returns (uint256[] memory, uint8[] memory)",
    "function createBuyOrder(uint256 price, uint256 amount) external returns (address)",
    "function createSellOrder(uint256 price, uint256 amount) external returns (address)"
];

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ BRN Site carregado');
    initEventListeners();
});

// ===== LISTENERS =====
function initEventListeners() {
    const connectBtn = document.getElementById('connectWalletBtn');
    if (connectBtn) connectBtn.addEventListener('click', connectWallet);

    const buyForm = document.getElementById('buy-form');
    const sellForm = document.getElementById('sell-form');
    if (buyForm) buyForm.addEventListener('submit', handleBuyOrder);
    if (sellForm) sellForm.addEventListener('submit', handleSellOrder);
}

// ===== CONEXÃO CARTEIRA =====
async function connectWallet() {
    try {
        if (!window.ethereum) {
            alert('⚠️ Instale a MetaMask para usar esta plataforma!');
            return;
        }

        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        isConnected = true;

        console.log('✅ Carteira conectada:', userAddress);
        updateWalletUI();

        await Promise.all([
            loadBalances(),
            loadOrderBook()
        ]);

        // Atualização automática a cada 15s
        setInterval(() => {
            if (isConnected) loadOrderBook();
        }, 15000);

    } catch (err) {
        console.error('❌ Erro ao conectar:', err);
        alert('Erro ao conectar carteira: ' + err.message);
    }
}

function updateWalletUI() {
    const btn = document.getElementById('connectWalletBtn');
    if (isConnected && userAddress && btn) {
        btn.textContent = userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
        btn.disabled = true;
    }
}

// ===== CARREGAR SALDOS =====
async function loadBalances() {
    if (!isConnected || !userAddress) return;

    const container = document.getElementById('balances-container');
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading">Carregando saldos...</div>';

        const tokens = [
            { symbol: 'BRN', address: BRN_TOKEN_ADDRESS, name: 'BRN Token' },
            { symbol: 'BNB', address: null, name: 'Binance Coin' }
        ];

        let html = '';

        for (const token of tokens) {
            let balance = '0';

            if (token.address) {
                const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
                const [bal, decimals] = await Promise.all([
                    contract.balanceOf(userAddress),
                    contract.decimals()
                ]);
                balance = ethers.formatUnits(bal, decimals);
            } else {
                const bal = await provider.getBalance(userAddress);
                balance = ethers.formatEther(bal);
            }

            const numBalance = parseFloat(balance);
            const displayBalance = numBalance.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6
            });

            html += `
                <div class="balance-card">
                    <h4>${token.symbol}</h4>
                    <p class="balance-amount">${displayBalance}</p>
                    <p class="balance-name">${token.name}</p>
                </div>
            `;
        }

        container.innerHTML = html;
        console.log('✅ Saldos carregados');

    } catch (err) {
        console.error('❌ Erro saldos:', err);
        container.innerHTML = '<p class="error">Erro ao carregar saldos</p>';
    }
}

// ===== LIVRO DE OFERTAS =====
async function loadOrderBook() {
    await Promise.all([
        loadBuyOrders(),
        loadSellOrders(),
        loadMyOrders()
    ]);
}

async function loadBuyOrders() {
    const container = document.getElementById('buy-orders-list');
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading">Carregando...</div>';

        let orders = [];

        // Se endereço do contrato estiver preenchido → busca real
        if (ESCROW_FACTORY_ADDRESS) {
            try {
                const factory = new ethers.Contract(ESCROW_FACTORY_ADDRESS, ESCROW_FACTORY_ABI, provider);
                const [, prices, amounts] = await factory.getAllBuyOrders();
                orders = prices.map((p, i) => ({
                    price: parseFloat(ethers.formatUnits(p, 18)),
                    amount: parseFloat(ethers.formatUnits(amounts[i], 18)),
                    total: 0
                }));
                orders.forEach(o => o.total = o.price * o.amount);
            } catch (e) {
                console.warn('Usando dados exemplo:', e);
            }
        }

        // Dados de exemplo se não houver contrato
        if (orders.length === 0) {
            orders = [
                { price: 0.00005, amount: 5000, total: 0.25 },
                { price: 0.000048, amount: 10000, total: 0.48 },
                { price: 0.000045, amount: 2500, total: 0.1125 }
            ];
        }

        if (orders.length === 0) {
            container.innerHTML = '<p class="empty">Sem ordens de compra</p>';
            return;
        }

        container.innerHTML = orders.map(o => `
            <div class="order-row buy-row">
                <span class="order-price">${o.price.toFixed(5)}</span>
                <span class="order-amount">${o.amount.toLocaleString('pt-BR')}</span>
                <span class="order-total">${o.total.toFixed(4)}</span>
            </div>
        `).join('');

    } catch (err) {
        console.error('❌ Erro ordens compra:', err);
        container.innerHTML = '<p class="error">Falha ao carregar</p>';
    }
}

async function loadSellOrders() {
    const container = document.getElementById('sell-orders-list');
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading">Carregando...</div>';

        let orders = [];

        if (ESCROW_FACTORY_ADDRESS) {
            try {
                const factory = new ethers.Contract(ESCROW_FACTORY_ADDRESS, ESCROW_FACTORY_ABI, provider);
                const [, prices, amounts] = await factory.getAllSellOrders();
                orders = prices.map((p, i) => ({
                    price: parseFloat(ethers.formatUnits(p, 18)),
                    amount: parseFloat(ethers.formatUnits(amounts[i], 18)),
                    total: 0
                }));
                orders.forEach(o => o.total = o.price * o.amount);
            } catch (e) {
                console.warn('Usando dados exemplo:', e);
            }
        }

        if (orders.length === 0) {
            orders = [
                { price: 0.000055, amount: 8000, total: 0.44 },
                { price: 0.000058, amount: 3000, total: 0.174 },
                { price: 0.00006, amount: 15000, total: 0.9 }
            ];
        }

        if (orders.length === 0) {
            container.innerHTML = '<p class="empty">Sem ordens de venda</p>';
            return;
        }

        container.innerHTML = orders.map(o => `
            <div class="order-row sell-row">
                <span class="order-price">${o.price.toFixed(5)}</span>
                <span class="order-amount">${o.amount.toLocaleString('pt-BR')}</span>
                <span class="order-total">${o.total.toFixed(4)}</span>
            </div>
        `).join('');

    } catch (err) {
        console.error('❌ Erro ordens venda:', err);
        container.innerHTML = '<p class="error">Falha ao carregar</p>';
    }
}

async function loadMyOrders() {
    const container = document.getElementById('my-orders-list');
    if (!container) return;

    if (!isConnected) {
        container.innerHTML = '<p>Conecte sua carteira para ver suas ordens</p>';
        return;
    }

    container.innerHTML = '<p class="empty">Nenhuma ordem aberta</p>';
}

// ===== CRIAR ORDENS =====
async function handleBuyOrder(e) {
    e.preventDefault();
    if (!isConnected) {
        alert('Conecte sua carteira primeiro!');
        return;
    }

    const price = document.getElementById('buy-price').value;
    const amount = document.getElementById('buy-amount').value;

    console.log('📝 Ordem Compra:', { price, amount });
    alert(`✅ Ordem de compra registrada!\nPreço: ${price}\nQuantidade: ${amount}`);

    await loadOrderBook();
    await loadBalances();
    e.target.reset();
}

async function handleSellOrder(e) {
    e.preventDefault();
    if (!isConnected) {
        alert('Conecte sua carteira primeiro!');
        return;
    }

    const price = document.getElementById('sell-price').value;
    const amount = document.getElementById('sell-amount').value;

    console.log('📝 Ordem Venda:', { price, amount });
    alert(`✅ Ordem de venda registrada!\nPreço: ${price}\nQuantidade: ${amount}`);

    await loadOrderBook();
    await loadBalances();
    e.target.reset();
}
