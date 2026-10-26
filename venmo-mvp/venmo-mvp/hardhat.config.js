require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config(); // 用 .env 来存私钥和 RPC

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    coston2: {
      url: process.env.COSTON2_RPC || "https://coston2-api.flare.network/ext/C/rpc",
      chainId: 114,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  }
};
