// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract EscrowIndividual is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public criador;
    IERC20 public tokenOferecido;   // BRN
    IERC20 public tokenDesejado;    // USDC
    uint256 public valorOferecido;  // quantidade de BRN
    uint256 public valorDesejado;   // quantidade de USDC
    bool public executado;
    bool public cancelado;
    address public factory;

    event TrocaExecutada(address indexed comprador, uint256 valorBRN, uint256 valorUSDC);
    event EscrowCancelado(address indexed criador);

    modifier apenasCriador() {
        require(msg.sender == criador, "Apenas o criador");
        _;
    }

    modifier ativo() {
        require(!executado && !cancelado, "Escrow ja finalizado");
        _;
    }

    constructor(
        address _criador,
        address _tokenOferecido,
        address _tokenDesejado,
        uint256 _valorOferecido,
        uint256 _valorDesejado
    ) {
        criador = _criador;
        tokenOferecido = IERC20(_tokenOferecido);
        tokenDesejado = IERC20(_tokenDesejado);
        valorOferecido = _valorOferecido;
        valorDesejado = _valorDesejado;
        factory = msg.sender;
    }

    /// @notice Comprador executa a troca: paga USDC e recebe BRN
    function executarTroca() external nonReentrant ativo {
        require(msg.sender != criador, "Criador nao pode comprar a propria ordem");

        // 1. Transferir USDC do comprador para o criador
        tokenDesejado.safeTransferFrom(msg.sender, criador, valorDesejado);

        // 2. Transferir BRN do escrow para o comprador
        tokenOferecido.safeTransfer(msg.sender, valorOferecido);

        executado = true;

        emit TrocaExecutada(msg.sender, valorOferecido, valorDesejado);
    }

    /// @notice Criador cancela a ordem e recebe o BRN de volta
    function cancelar() external nonReentrant ativo apenasCriador {
        tokenOferecido.safeTransfer(criador, valorOferecido);
        cancelado = true;

        emit EscrowCancelado(criador);
    }

    /// @notice Retorna os dados completos do escrow
    function obterDados() external view returns (
        address _criador,
        address _tokenOferecido,
        address _tokenDesejado,
        uint256 _valorOferecido,
        uint256 _valorDesejado,
        bool _executado,
        bool _cancelado
    ) {
        return (
            criador,
            address(tokenOferecido),
            address(tokenDesejado),
            valorOferecido,
            valorDesejado,
            executado,
            cancelado
        );
    }
}