import { ethers } from "hardhat";

async function main() {
    const XRPLAttestation = await ethers.getContractFactory("XRPLAttestation");
  
    // 替换成 FdcHub 的合约地址 (testnet)
    const fdcHubAddress = "0x...";
    console.log("🚀 正在部署 XRPLAttestation...");
    const contract = await XRPLAttestation.deploy(fdcHubAddress);
    await contract.deployed();
  
    console.log("XRPLAttestation 部署成功:", contract.address);
  }
  
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
  