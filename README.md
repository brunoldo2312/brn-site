
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
