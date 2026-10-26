// scripts/deploy.js
require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const signer = (await ethers.getSigners())[0];
  console.log("Deployer:", signer.address);
  console.log("Network:", hre.network.name);

  // provider (Hardhat's ethers provider)
  const provider = ethers.provider;

  // try to use flarenetwork periphery artifacts to resolve addresses
  let fdcHubAddr;
  let fdcFeeConfigAddr;
  try {
    // Import the helper (must be installed)
    const periphery = require("@flarenetwork/flare-periphery-contract-artifacts");
    // two ways: helper function or network namespace
    if (periphery.nameToAddress) {
      fdcHubAddr = await periphery.nameToAddress("FdcHub", "coston2", provider);
      fdcFeeConfigAddr = await periphery.nameToAddress("FdcRequestFeeConfigurations", "coston2", provider);
    } else if (periphery.coston2 && periphery.coston2.products && periphery.coston2.products.FdcHub) {
      fdcHubAddr = await periphery.coston2.products.FdcHub.getAddress(provider);
      fdcFeeConfigAddr = await periphery.coston2.products.FdcRequestFeeConfigurations.getAddress(provider);
    } else {
      throw new Error("periphery package does not expose expected helpers");
    }
    console.log("Resolved FdcHub:", fdcHubAddr);
    console.log("Resolved FdcRequestFeeConfigurations:", fdcFeeConfigAddr);
  } catch (err) {
    console.warn("Could not auto-resolve FDC addresses via periphery package:", err.message || err);
    console.warn("Falling back to environment variables FDC_HUB_ADDR & FDC_FEE_CONFIG_ADDR (if set)");
    fdcHubAddr = process.env.FDC_HUB_ADDR;
    fdcFeeConfigAddr = process.env.FDC_FEE_CONFIG_ADDR;
  }

  if (!fdcHubAddr || !fdcFeeConfigAddr) {
    throw new Error("FDC addresses not available. Provide via periphery package or set FDC_HUB_ADDR & FDC_FEE_CONFIG_ADDR in .env");
  }

  // compile already done if using hardhat run normally, but safe to get contract factory
  const Factory = await ethers.getContractFactory("VenmorphFdcReceiver");
  console.log("Deploying VenmorphFdcReceiver...");
  const contract = await Factory.deploy(fdcHubAddr, fdcFeeConfigAddr);
  await contract.waitForDeployment();
  console.log("VenmorphFdcReceiver deployed at:", await contract.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
