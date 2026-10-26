// scripts/prepare_and_submit_attestation.js
// Node >=18 recommended
import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

/*
Required env vars in .env (examples)
-----------------------------------
COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
VENMORPH_CONTRACT_ADDR=0xYourVenmorphContractAddress
FDC_FEE_CONFIG_ADDR=0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e   # optional - script can try to auto-resolve if set up
VERIFIER_BASE_URL=https://fdc-verifiers-testnet.flare.network
API_KEY=00000000-0000-0000-0000-000000000000   # optional verifier API key
TX_HASH=0x97308B0E06B063255DCED667CE9E8BDE6AAE17506F08B81C99BDC4474CC15769
SENDER_XRPL=rnGBu4ssAfwRKrdzXdg38iaiqcGbBF1hxC
DEST_XRPL=rGFTehMJDrxuyt6DvjczCdf6RpAr4WvdTn
*/

const RPC = process.env.COSTON2_RPC_URL;
const PK = process.env.PRIVATE_KEY;
const VENMORPH_ADDR = process.env.VENMORPH_CONTRACT_ADDR;
const FDC_FEE_CONFIG_ADDR = process.env.FDC_FEE_CONFIG_ADDR;
const VERIFIER_BASE = process.env.VERIFIER_BASE_URL || "https://fdc-verifiers-testnet.flare.network";
const API_KEY = process.env.API_KEY || "";
const TX_HASH = process.env.TX_HASH;
const SENDER_XRPL = process.env.SENDER_XRPL;
const DEST_XRPL = process.env.DEST_XRPL;

const requiredVars = {
    COSTON2_RPC_URL: process.env.COSTON2_RPC_URL,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    VENMORPH_CONTRACT_ADDR: process.env.VENMORPH_CONTRACT_ADDR,
    TX_HASH: process.env.TX_HASH,
    SENDER_XRPL: process.env.SENDER_XRPL,
    DEST_XRPL: process.env.DEST_XRPL,
  };
  
  const missing = Object.entries(requiredVars)
    .filter(([_, v]) => !v)
    .map(([k]) => k);
  
  if (missing.length > 0) {
    console.error("❌ Missing required env vars:", missing.join(", "));
    process.exit(1);
  }
  

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  console.log("Using wallet:", wallet.address);
  console.log("Network RPC:", RPC);

  // 1) Prepare verifier request JSON.
  // AttestationType "Payment" and sourceId "XRP" must be zero-padded 32-byte hex strings.
  function zeroPadUtf8Hex(str) {
    // convert UTF-8 string to hex, then pad to 32 bytes (64 hex chars)
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let hex = "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    // remove 0x, pad right with zeros to 64 chars
    let nox = hex.slice(2);
    if (nox.length > 64) throw new Error("string too long to pad to 32 bytes");
    nox = nox.padEnd(64, "0");
    return "0x" + nox;
  }

  const attestationTypeHex = zeroPadUtf8Hex("Payment");
  const sourceIdHex = zeroPadUtf8Hex("testXRP"); // use "XRP" per docs

  const verifierPath = `${VERIFIER_BASE}/verifier/xrp/Payment/prepareRequest`;
  console.log("Verifier prepareRequest URL:", verifierPath);

  // requestBody per Flare Payment guide: transactionId (bytes32), inUtxo, utxo
  const requestBody = {
    transactionId: TX_HASH.startsWith("0x") ? TX_HASH : "0x" + TX_HASH,
    inUtxo: "0",
    utxo: "0"
  };

  const verifierPayload = {
    attestationType: attestationTypeHex,
    sourceId: sourceIdHex,
    requestBody: requestBody,
    // optional: include expected addresses to verify? Some verifiers support params
    // You may also include custom metadata if verifier accepts it.
    // e.g., "expected": { "sender": SENDER_XRPL, "destination": DEST_XRPL }
  };

  // 2) call verifier prepareRequest
  console.log("Posting to verifier to get abiEncodedRequest...");
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) headers["x-api-key"] = API_KEY;

  const resp = await fetch(verifierPath, {
    method: "POST",
    headers,
    body: JSON.stringify(verifierPayload),
    // timeout handled by caller environment
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Verifier returned ${resp.status} ${resp.statusText} - ${txt}`);
  }

  const j = await resp.json();
  if (!j.abiEncodedRequest) {
    console.error("Full verifier response:", JSON.stringify(j, null, 2));
    throw new Error("Verifier response missing abiEncodedRequest");
  }

  const abiEncodedRequest = j.abiEncodedRequest; // hex string like 0x...
  console.log("Got abiEncodedRequest (len):", abiEncodedRequest.length);

  // Optionally verifier might already do some validation (e.g., addresses match),
  // but most often verifier only prepares encoding; final verification happens inside FDC flow.
  // You can store j to examine for diagnostics:
  fs.writeFileSync("lastVerifierResponse.json", JSON.stringify(j, null, 2));

  // 3) Query FDC fee: call getRequestFee(bytes)
  // Minimal ABI for FdcRequestFeeConfigurations.getRequestFee
  const feeAbi = [
    "function getRequestFee(bytes request) view returns (uint256)"
  ];

  if (!FDC_FEE_CONFIG_ADDR) {
    console.warn("FDC_FEE_CONFIG_ADDR not set in .env — the script will attempt to guess common testnet address, but it's better to set it.");
    // if you know testnet address discovered earlier, set it in .env
  }

  const feeContract = new ethers.Contract(FDC_FEE_CONFIG_ADDR, feeAbi, provider);
  console.log("Calling FDC fee contract getRequestFee(...) ...");
  let fee;
  try {
    fee = await feeContract.getRequestFee(abiEncodedRequest);
  } catch (err) {
    console.error("Failed to call getRequestFee:", err);
    throw err;
  }
  console.log("Required fee (wei native units):", fee.toString());

  // 4) Call your deployed Venmorph contract submitAttestation(bytes) and attach fee as value
  const venmorphAbi = [
    "function submitAttestation(bytes abiEncodedRequest) payable",
    "event AttestationRequested(address indexed sender, bytes indexed requestBytes, uint256 feePaid)"
  ];
  const venmorph = new ethers.Contract(VENMORPH_ADDR, venmorphAbi, wallet);

  console.log("Submitting attestation to Venmorph contract:", VENMORPH_ADDR);
  const tx = await venmorph.submitAttestation(abiEncodedRequest, { value: fee });
  console.log("Tx sent. Hash:", tx.hash);
  console.log("Waiting for inclusion...");
  const receipt = await tx.wait();
  console.log("Tx mined. Block:", receipt.blockNumber, "Gas used:", receipt.gasUsed?.toString());

  // Optionally check for event
  try {
    for (const ev of receipt.logs) {
      try {
        const parsed = venmorph.interface.parseLog(ev);
        if (parsed && parsed.name === "AttestationRequested") {
          console.log("AttestationRequested event:", parsed.args);
        }
      } catch (_) {}
    }
  } catch (e) {
    // ignore
  }

  console.log("Done. Saved verifier response to lastVerifierResponse.json");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
