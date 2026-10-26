// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Minimal interfaces we need from the FDC periphery
interface IFdcHub {
    function requestAttestation(bytes calldata request) external payable;
}

interface IFdcRequestFeeConfigurations {
    function getRequestFee(bytes calldata request) external view returns (uint256);
}

contract VenmorphFdcReceiver {
    address public owner;
    address public fdcHub;
    address public fdcRequestFeeConfig;

    event AttestationRequested(address indexed sender, bytes indexed requestBytes, uint256 feePaid);
    event FdcAddressesUpdated(address fdcHub, address fdcFeeConfig);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(address _fdcHub, address _fdcRequestFeeConfig) {
        owner = msg.sender;
        fdcHub = _fdcHub;
        fdcRequestFeeConfig = _fdcRequestFeeConfig;
        emit FdcAddressesUpdated(_fdcHub, _fdcRequestFeeConfig);
    }

    // Owner can change addresses if needed
    function setFdcAddresses(address _fdcHub, address _fdcRequestFeeConfig) external onlyOwner {
        fdcHub = _fdcHub;
        fdcRequestFeeConfig = _fdcRequestFeeConfig;
        emit FdcAddressesUpdated(_fdcHub, _fdcRequestFeeConfig);
    }

    /// Submit an already ABI-encoded attestation request prepared off-chain.
    /// msg.value must be >= required fee computed by FDC fee contract.
    function submitAttestation(bytes calldata abiEncodedRequest) external payable {
        require(fdcHub != address(0) && fdcRequestFeeConfig != address(0), "fdc not configured");

        uint256 requiredFee = IFdcRequestFeeConfigurations(fdcRequestFeeConfig).getRequestFee(abiEncodedRequest);
        require(msg.value >= requiredFee, "insufficient request fee");

        // forward to FDC
        IFdcHub(fdcHub).requestAttestation{value: msg.value}(abiEncodedRequest);

        emit AttestationRequested(msg.sender, abiEncodedRequest, msg.value);
    }

    // Allow contract to receive refunds or native tokens if needed
    receive() external payable {}
    fallback() external payable {}
}
