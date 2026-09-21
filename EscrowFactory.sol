// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./EscrowIndividual.sol";

contract EscrowFactory {
    using SafeERC20 for IERC20;

    address[] public contratosGerados;
    mapping(address => address[]) public contratosPorCriador;

    event ContratoCriado(
        address indexed enderecoContrato,
        address indexed criador,
        address tokenOferecido,
        address tokenDesejado,
        uint256 valorOferecido,
        uint256 valorDesejado
    );

    /// @notice Cria um novo escrow e transfere os BRN do criador para o escrow
    function criarNovoContratoEscrow(
        address _tokenOferecido,
        address _tokenDesejado,
        uint256 _valorOferecido,
        uint256 _valorDesejado
    ) external returns (address) {
        require(_valorOferecido > 0, "Valor oferecido invalido");
        require(_valorDesejado > 0, "Valor desejado invalido");
        require(_tokenOferecido != _tokenDesejado, "Tokens devem ser diferentes");

        // Cria o escrow
        EscrowIndividual novoEscrow = new EscrowIndividual(
            msg.sender,
            _tokenOferecido,
            _tokenDesejado,
            _valorOferecido,
            _valorDesejado
        );

        address enderecoEscrow = address(novoEscrow);

        // Transfere os BRN do criador direto para o escrow
        IERC20(_tokenOferecido).safeTransferFrom(
            msg.sender,
            enderecoEscrow,
            _valorOferecido
        );

        // Registra
        contratosGerados.push(enderecoEscrow);
        contratosPorCriador[msg.sender].push(enderecoEscrow);

        emit ContratoCriado(
            enderecoEscrow,
            msg.sender,
            _tokenOferecido,
            _tokenDesejado,
            _valorOferecido,
            _valorDesejado
        );

        return enderecoEscrow;
    }

    function obterContratosGerados() external view returns (address[] memory) {
        return contratosGerados;
    }

    function obterContratosPorCriador(address _criador) external view returns (address[] memory) {
        return contratosPorCriador[_criador];
    }

    function totalContratos() external view returns (uint256) {
        return contratosGerados.length;
    }
}