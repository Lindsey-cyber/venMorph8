// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IFdcHub {
    function verifyAttestation(bytes32 _txHash) external view returns (bool);
}

contract XRPLAttestation {
    address public fdcHub; // Flare FDC Hub 合约地址
    mapping(bytes32 => bool) public attested;

    constructor(address _fdcHub) {
        fdcHub = _fdcHub;
    }

    function verifyXRPLPayment(bytes32 txHash) public returns (bool) {
        IFdcHub hub = IFdcHub(fdcHub);
        bool result = hub.verifyAttestation(txHash);
        if (result) {
            attested[txHash] = true;
        }
        return result;
    }

    function isAttested(bytes32 txHash) public view returns (bool) {
        return attested[txHash];
    }
}
