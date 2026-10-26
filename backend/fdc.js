// fdc.js
require('dotenv').config();
const axios = require('axios');
const { ethers } = require('ethers');
const { interfaceToAbi, nameToAddress } = require('@flarenetwork/flare-periphery-contract-artifacts');

// ============ 配置 ============
const FLARE_RPC = process.env.FLARE_RPC || 'https://coston2-api.flare.network/ext/C/rpc';
const NETWORK = process.env.FLARE_NETWORK || 'coston2';
const VERIFIER_BASE = process.env.FDC_VERIFIER || 'https://fdc-verifiers-testnet.flare.network';

const provider = new ethers.JsonRpcProvider(FLARE_RPC);
const signer = new ethers.Wallet(process.env.FLARE_PRIVATE_KEY, provider); // 必须有 FLR 余额

// helper: 把字符串转成 bytes32（右补 0）
function to32Hex(str) {
  const hex = Buffer.from(str, 'utf8').toString('hex');
  return '0x' + hex.padEnd(64, '0');
}

/**
 * 提交一个 XRPL Payment attestation
 * @param {string} txHash - XRPL 的交易 hash
 */
async function submitXrpPaymentAttestation(txHash) {
  // 1) 调用 verifier 生成 abiEncodedRequest
  const sourceName = 'xrp';      // 数据源：XRP 链
  const attType = 'Payment';     // attestation 类型
  const prepareUrl = `${VERIFIER_BASE}/verifier/${sourceName}/${attType}/prepareRequest`;

  const preparePayload = {
    attestationType: to32Hex('Payment'),
    sourceId: to32Hex('xrp'),
    requestBody: {
      transactionHash: txHash,
      requiredConfirmations: "1",
      provideInput: true
    }
  };

  const prepResp = await axios.post(prepareUrl, preparePayload, {
    headers: { 'Content-Type': 'application/json' }
  });

  if (!prepResp.data || !prepResp.data.abiEncodedRequest) {
    throw new Error('verifier failed: ' + JSON.stringify(prepResp.data));
  }
  const abiEncodedRequest = prepResp.data.abiEncodedRequest;

  // 2) 获取 FDCHub 合约实例
  const abi = interfaceToAbi('IFdcHub', NETWORK);
  let fdcHubAddress;
  try {
    fdcHubAddress = await nameToAddress('FDCHub', NETWORK, provider);
  } catch (e) {
    fdcHubAddress = process.env.FDC_HUB_ADDRESS; // 兜底
  }
  if (!fdcHubAddress) throw new Error("FDCHub address not found");
  const fdcHub = new ethers.Contract(fdcHubAddress, abi, signer);

  // 3) 调用 requestAttestation
  const tx = await fdcHub.requestAttestation(abiEncodedRequest, {
    value: ethers.parseEther('0.01') // 示例押金，具体数值看网络要求
  });
  const receipt = await tx.wait();

  // 4) 计算 roundId（示例逻辑，正式请从链上参数读取）
  const block = await provider.getBlock(receipt.blockNumber);
  const firstVotingRoundStartTs = 1658429955; // testnet 示例值
  const votingEpochDurationSeconds = 90;
  const roundId = Math.floor(
    (block.timestamp - firstVotingRoundStartTs) / votingEpochDurationSeconds
  );

  return { receipt, roundId, abiEncodedRequest };
}

module.exports = { submitXrpPaymentAttestation };
