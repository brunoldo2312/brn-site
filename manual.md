# 📘 Manual do BRN Exchange

**Repositório:** https://github.com/brunoldo2312/brn-site
**Versão:** 1.0
**Data:** 22/09/2026
**Rede:** Polygon (Mainnet)

---

## 1. Apresentação

O **BRN Exchange** é um ecossistema descentralizado de troca de criptoativos que opera na rede Polygon. Permite a criação de ordens de troca com garantia de depósito seguro (*escrow*), sem intermediários, entre tokens BRN, USDC, POL/WPOL e consulta de saldos em Bitcoin (BTC).

### Principais características
- ✅ Troca P2P sem servidor central
- ✅ Contratos inteligentes auditáveis e implantados na Polygon
- ✅ Sistema de *escrow* individual por operação
- ✅ Token nativo BRN (padrão ERC-20)
- ✅ Conversão direta POL ↔ WPOL
- ✅ Suporte a envio de tokens e consulta de saldos BTC
- ✅ Interface web responsiva, acessível via navegador

---

## 2. Estrutura do Projeto

| Arquivo | Função |
|---|---|
| `TokenBRN.sol` | Contrato do token BRN (padrão ERC-20) |
| `EscrowFactory.sol` | Fábrica — cria contratos de garantia |
| `EscrowIndividual.sol` | Contrato de garantia por operação |
| `index.html` | Interface principal do usuário |
| `app.js` | Lógica de conexão, carteira e interação com contratos |
| `style.css` / `style-melhorias.css` | Estilos visuais |
| `favicon.svg` | Ícone do sistema |

---

## 3. Contratos Inteligentes

### 3.1 TokenBRN.sol — Moeda Nativa
- **Nome:** BRN Token | **Símbolo:** BRN
- **Padrão:** ERC-20
- **Oferta inicial:** 1.000.000 de tokens
- **Endereço de implantação:** a definir na Mainnet
- Funcionalidades: transferências, aprovações e permissões padrão ERC-20

### 3.2 EscrowFactory.sol — Fábrica de Ordens
Funções principais:
- `criarNovoContratoEscrow()` — cria ordem de troca e transfere ativos para garantia
- `obterContratosGerados()` — lista de todas as ordens
- `obterContratosPorCriador()` — filtra ordens por endereço do criador
- `totalContratos()` — contador de ordens

**Eventos:** `ContratoCriado` — registra cada nova ordem na blockchain

### 3.3 EscrowIndividual.sol — Garantia por Operação
Cada ordem gera um contrato próprio:
- `executarTroca()` — comprador paga e recebe os tokens
- `cancelar()` — criador desfaz a ordem e recupera seus ativos
- `obterDados()` — consulta estado completo da operação

**Proteções:**
- ✅ `ReentrancyGuard` — prevenção contra ataques de reentrada
- ✅ Apenas o criador pode cancelar
- ✅ Criador não pode comprar sua própria ordem

---

## 4. Requisitos do Sistema

| Item | Especificação |
|---|---|
| Navegador | Chrome, Firefox, Edge ou Safari (versões recentes) |
| Carteira | MetaMask, Rabby ou compatível com EIP-1193 |
| Rede | Polygon (RPC: `https://polygon-rpc.com/`) |
| Ativos necessários | POL para taxas de gás |
| Conexão | Internet para acesso à blockchain |

---

## 5. Guia de Uso

### 5.1 Conectar Carteira
1. Abra o site da aplicação
2. Clique **🔌 Conectar carteira**
3. Autorize a conexão no popup da carteira
4. Aparecerá: ✅ Conectado + seu endereço

### 5.2 Mural de Ordens — Consulta
- Visualize todas as ordens: ativas, executadas e canceladas
- **Filtros:**
  - Status: Todas / Ativas / Executáveis / Executadas / Canceladas
  - Oferece / Pede: filtrar por token
  - Minhas ordens: exibe apenas suas criações
- Cada ordem mostra: valores, endereço do contrato de garantia e status

### 5.3 Criar Ordem de Troca
1. Vá na aba **💰 Vender**
2. Selecione:
   - Você oferece: token e quantidade
   - Você pede: token e quantidade desejada
3. Clique **✅ Aprovar** — autoriza o contrato a movimentar seus tokens
4. Clique **📋 Criar Ordem** — confirme a transação
5. Seus tokens ficam protegidos no *escrow* até execução ou cancelamento

### 5.4 Executar Ordem (Comprar)
1. No mural, localize uma ordem ativa que deseja aceitar
2. Verifique taxa, quantidade e token de destino
3. Clique em **Executar Troca**
4. Confirme na carteira:
   - O valor solicitado é transferido ao criador
   - Os tokens em garantia são enviados a você
5. Ordem marcada como **Executada** ✅

### 5.5 Cancelar Ordem
- Apenas o criador pode cancelar enquanto a ordem estiver ativa
- Ao cancelar: tokens devolvidos imediatamente
- Clique em **Cancelar** e confirme
- Ordem marcada como **Cancelada** ❌

### 5.6 Enviar Ativos
- Aba **📤 Enviar** — transfira tokens ERC-20 ou POL diretamente
- Informe: ativo, endereço de destino e quantidade
- Confirme a transação

### 5.7 Converter POL ↔ WPOL
- Aba **🔄 POL/WPOL** — conversão 1:1 sem taxas
- **POL → WPOL:** envolve para compatibilidade com contratos
- **WPOL → POL:** desfaz o envolvimento
- Saldos atualizados automaticamente

### 5.8 Consultar Bitcoin (BTC)
- Aba **🟠 Bitcoin** — consulte saldo de endereços BTC
- Digite o endereço e clique em **Consultar**
- *Nota:* A aplicação **não gera chaves** nem realiza transações BTC — apenas consulta saldos via API pública

---

## 6. Fluxo Completo de Uma Operação
