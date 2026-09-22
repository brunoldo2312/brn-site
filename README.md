# 🚀 BRN Exchange

> Ecossistema descentralizado de troca de criptoativos na rede Polygon — P2P sem servidor central, com garantia de escrow.

## ✨ Funcionalidades

- 🔄 **Troca P2P Descentralizada** — ordens entre BRN, USDC, POL/WPOL sem intermediários
- 🔐 **Sistema de Escrow** — garantia automatizada por contratos inteligentes
- 🪙 **Token Nativo BRN** — padrão ERC-20 na Polygon
- 💱 **Conversão POL ↔ WPOL** — 1:1 sem taxas
- 🟠 **Consulta de Saldos BTC** — via API pública
- 🌐 **Interface Web** — acessível pelo navegador, conecte sua carteira

## 📁 Estrutura do Projeto

| Arquivo | Descrição |
|---|---|
| `TokenBRN.sol` | Contrato do token BRN (ERC-20) |
| `EscrowFactory.sol` | Fábrica de contratos de garantia |
| `EscrowIndividual.sol` | Contrato individual por operação |
| `app.js` | Lógica de conexão e interação com contratos |
| `index.html` | Interface principal |
| `style.css` / `style-melhorias.css` | Estilos visuais |
| `MANUAL.md` | 📖 **Manual completo do usuário** |

## 🚀 Começando

### Pré-requisitos
- Navegador moderno (Chrome, Firefox, Edge, Safari)
- Carteira compatível com EIP-1193 (MetaMask, Rabby, etc.)
- Rede Polygon configurada
- POL para taxas de gás

### Uso Rápido
1. **Conecte sua carteira** na página principal
2. **Crie ou encontre uma ordem** no mural de trocas
3. **Aprove e execute** a operação com segurança
4. **Receba seus ativos** diretamente na carteira

📖 **Leia o [MANUAL.md](./MANUAL.md)** para o guia completo de uso, fluxo de operações, resolução de problemas e detalhes técnicos.

## 🔧 Desenvolvimento

```bash
# Clonar
git clone https://github.com/brunoldo2312/brn-site.git
cd brn-site

# Instalar dependências
npm install

# Compilar contratos
npx hardhat compile

# Implantar na Polygon
npx hardhat run scripts/deploy.js --network polygon
