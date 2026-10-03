🌉 Guia Completo — Como Usar Pontes (Bridges)
📌 O Que é uma Ponte?

Uma ponte (bridge) é uma ferramenta que permite mover seus tokens de uma blockchain para outra. Pense nas blockchains como ilhas separadas — cada uma tem suas próprias regras e moedas. A ponte é a estrada que conecta essas ilhas.

Como funciona?

1. Você envia seus tokens para um contrato da ponte na rede de origem

2. Os tokens ficam bloqueados (guardados em segurança)

3. A ponte cria/mint uma quantidade equivalente de tokens na rede de destino

4. Quando quiser voltar, você queima os tokens na rede de destino e a ponte libera os originais
🔗 Principais Pontes Disponíveis
Ponte Redes Conectadas Site Oficial Tempo Médio 
Polygon Bridge ↔ Ethereum ⇄ Polygon portal.polygon.technology 7–8 min (Ethereum→Polygon) / 30min–3h (volta) 
Arbitrum Bridge Ethereum ⇄ Arbitrum bridge.arbitrum.io ~10 min 
Base Bridge Ethereum ⇄ Base bridge.base.org ~10 min 
Hop Protocol Ethereum ⇄ Polygon/Arbitrum/Optimism hop.exchange Mais rápido 
Across Protocol Ethereum ⇄ L2s across.to Mais rápido 

📖 Passo a Passo — Usando a Polygon Bridge

Esta é a ponte oficial e mais usada para mover ativos entre Ethereum e Polygon (onde opera o BRN Exchange).

✅ Enviar da Ethereum → Polygon

Passo 1 — Acesse a Ponte

• Entre no site oficial: portal.polygon.technology/bridge

• ⚠️ Confira sempre o endereço — golpes usam sites parecidos!

Passo 2 — Conecte sua Carteira

• Clique em "Connect Wallet" no canto superior direito

• Selecione MetaMask e autorize a conexão

• Verifique se está na rede Ethereum Mainnet

Passo 3 — Escolha o Token e Quantidade

• Confirme que a seta está: Ethereum → Polygon PoS

• Selecione o token que deseja mover (ex: ETH, USDC, etc.)

• Digite o valor

• ⚠️ Verifique que você tem ETH suficiente para as taxas de gás da rede Ethereum

Passo 4 — Aprove e Confirme

• Na primeira vez com um token específico, clique em "Approve" — autoriza a ponte a usar seus tokens

• Depois clique em "Bridge"

• Confirme a transação no MetaMask

• ⏳ Aguarde — geralmente leva 7 a 8 minutos

Passo 5 — Receba na Polygon

• Troque a rede da sua carteira para Polygon Mainnet

• Seus tokens aparecerão automaticamente após a confirmação
🔄 Voltar da Polygon → Ethereum

Passo 1

# 🚀 BRN 

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
npx hardhat run scripts/deploy.js --network 📘 Guia Completo — Como Usar o BRN Exchange
📌 Sumário

1. Introdução

2. Pré-requisitos

3. Configuração da Carteira

4. Conectando ao Site

5. Navegação Principal

6. Criar uma Ordem de Troca

7. Comprar / Aceitar uma Ordem

8. Cancelar uma Ordem

9. Sistema de Disputas

10. Converter POL ↔ WPOL

11. Enviar Tokens

12. Consultar Saldo de Bitcoin

13. Perguntas Frequentes

14. Segurança e Boas Práticas
1. Introdução

O BRN Exchange é uma plataforma descentralizada de troca de criptoativos que funciona na rede Polygon. Diferente de corretoras tradicionais, não há intermediários: você negocia diretamente com outra pessoa, e os ativos ficam protegidos por contratos inteligentes até a conclusão da operação.

Principais Vantagens

• ✅ Sem intermediários — você controla seus ativos

• ✅ Segurança do Escrow — seus tokens ficam protegidos durante a troca

• ✅ Taxas baixas — operando na rede Polygon

• ✅ Transparência total — todas as operações ficam registradas na blockchain
2. Pré-requisitos

Antes de começar, você precisará de:
Item Detalhe 
📱 Navegador Chrome, Firefox, Edge ou Safari (versão atualizada) 
🦊 Carteira MetaMask, Rabby ou outra compatível com EIP-1193 
🌐 Rede Polygon (MATIC) configurada na carteira 
💵 Saldo POL (MATIC) para pagar as taxas de transação 

3. Configuração da Carteira

3.1 Instalar e Configurar o MetaMask

1. Acesse o site oficial: metamask.io e instale a extensão no seu navegador

2. Clique em "Criar uma nova carteira"

3. Anote e guarde em local seguro sua frase de recuperação — nunca compartilhe essa informação!

4. Crie uma senha forte

3.2 Adicionar a Rede Polygon

1. Abra o MetaMask → clique no nome da rede (geralmente diz "Rede Principal Ethereum")

2. Selecione "Redes" → "Adicionar rede manualmente"

3. Preencha os dados:

◦ Nome da rede: Polygon Mainnet

◦ URL RPC: https://polygon-rpc.com/

◦ ID da Cadeia: 137

◦ Símbolo da moeda: POL (ou MATIC)

◦ URL do explorador: https://polygonscan.com/

4. Clique em Salvar e selecione a rede Polygon
💡 Dica: Você pode também usar o botão "Adicionar Rede Polygon" disponível na própria página do BRN Exchange, se disponível.
4. Conectando ao Site

Passo a Passo

1. Acesse o site oficial do BRN Exchange

2. No canto superior da página, clique no botão 🔌 Conectar Carteira

3. Uma janela do MetaMask aparecerá → clique em Conectar

4. Aparecerá: ✅ Conectado + seu endereço de carteira
⚠️ Atenção: Verifique sempre se você está no site correto antes de conectar sua carteira. O endereço oficial
