import { ethers } from "ethers";

// Flare Testnet Coston2 FtsoV2 地址
const FTSOV2_ADDRESS = "0x3d893C53D9e8056135C26C8c638B76C8b60Df726";
const RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";

// FLR/USD Feed ID
const FEED_ID_FLR = "0x01464c522f55534400000000000000000000000000";

// FtsoV2 简化 ABI，只保留 getCurrentPriceById 方法
const ABI = [
  "function getCurrentPriceById(bytes21 _assetId) view returns (uint256 price, uint256 timestamp)"
];

async function main() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const ftsov2 = new ethers.Contract(FTSOV2_ADDRESS, ABI, provider);

    const result = await ftsov2.getCurrentPriceById(FEED_ID_FLR);
    const price = result.price / 1e2; 
    const timestamp = new Date(result.timestamp * 1000);

    console.log(`FLR/USD Price: $${price}`);
    console.log(`Timestamp: ${timestamp.toISOString()}`);
  } catch (err) {
    console.error("Error reading FTSO feed:", err);
  }
}

main();
