// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const xrpl = require('xrpl');
const { ethers } = require('ethers');
const { interfaceToAbi } = require('@flarenetwork/flare-periphery-contract-artifacts');

// ============ Flare 配置 ==============
const FLARE_RPC = process.env.FLARE_RPC || 'https://coston2-api.flare.network/ext/C/rpc';
const FLARE_NETWORK = process.env.FLARE_NETWORK || 'coston2';
const FTSOV2_ADDRESS = process.env.FTSOV2_ADDRESS || '0x3d893C53D9e8056135C26C8c638B76C8b60Df726'; // coston2 示例
const provider = new ethers.JsonRpcProvider(FLARE_RPC);
const ftsoAbi = interfaceToAbi('FtsoV2Interface', FLARE_NETWORK);
const ftso = new ethers.Contract(FTSOV2_ADDRESS, ftsoAbi, provider);

// 支持的 FTSO feed ID 映射（按需扩展）
const FEED_IDS = {
  ETH: '0x014554482f55534400000000000000000000000000', // ETH/USD
  XRP: '0x015852502f55534400000000000000000000000000', // XRP/USD
  BTC: '0x014254432f55534400000000000000000000000000'  // BTC/USD
};

// helper：读取某个资产的 USD 价格
async function getPriceUSD(symbol) {
  const feedId = FEED_IDS[symbol];
  if (!feedId) throw new Error('Unsupported asset: ' + symbol);
  const res = await ftso.getFeedByIdInWei.staticCall(feedId);
  const valueWei = BigInt(res[0].toString());
  const price = Number(valueWei) / 1e18;
  return { price, timestamp: Number(res[1]) };
}

// ============ XRPL 配置 ==============
const XRPL_WS = process.env.XRPL_WS || 'wss://s.altnet.rippletest.net:51233';
const xrplClient = new xrpl.Client(XRPL_WS);

// ============ Express 初始化 ============
const app = express();
app.use(cors());
app.use(bodyParser.json());

// 内存数据库（测试用）
let requests = {};

// ============ API: 创建请求 ============
app.post('/api/request', async (req, res) => {
  const { requesterSeed, recipientAddress, asset, amount, note } = req.body;
  const requestId = 'req_' + Date.now();
  const wallet = xrpl.Wallet.fromSeed(requesterSeed);

  const requestObj = {
    requestId,
    requesterAddress: wallet.classicAddress,
    recipientAddress,
    asset,
    amount,
    note,
    status: "OPEN",
    createdAt: Date.now()
  };

  // 把请求 JSON 放到 XRPL Memo
  const memoHex = Buffer.from(JSON.stringify({
    requestId, asset, amount, note
  }), 'utf8').toString('hex');

  const tx = {
    TransactionType: "Payment",
    Account: wallet.classicAddress,
    Destination: recipientAddress,
    Amount: "5000000", // 只是一个最小支付，主要是为了写入 Memo
    Memos: [
      {
        Memo: {
          MemoData: memoHex,
          MemoFormat: Buffer.from("application/json").toString('hex'),
          MemoType: Buffer.from("venmo_request").toString('hex')
        }
      }
    ]
  };

  try {
    const prepared = await xrplClient.autofill(tx);
    const signed = wallet.sign(prepared);
    const result = await xrplClient.submitAndWait(signed.tx_blob);

    requestObj.anchorTx = result.result.hash;
    requests[requestId] = requestObj;

    return res.json({ ok: true, request: requestObj });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ API: 获取请求列表 ============
app.get('/api/requests/:address', (req, res) => {
  const { address } = req.params;
  const list = Object.values(requests).filter(
    r => r.recipientAddress === address || r.requesterAddress === address
  );
  res.json({ ok: true, requests: list });
});

// ============ API: 获取报价（通过 FTSO） ============
app.get('/api/price/quote', async (req, res) => {
  const { from = "ETH", to = "XRP", amount = "1" } = req.query;
  try {
    const fromRes = await getPriceUSD(from);
    const toRes = await getPriceUSD(to);
    const usd = Number(amount) * fromRes.price;
    const equivalent = usd / toRes.price;
    res.json({
      ok: true,
      from, to, amount,
      fromUsd: fromRes.price,
      toUsd: toRes.price,
      usd,
      equivalent
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ 启动服务 & 连接 XRPL ============
(async () => {
  await xrplClient.connect();
  console.log("✅ Connected to XRPL Testnet");

  await xrplClient.request({ command: "subscribe", streams: ["transactions"] });
  console.log("📡 Subscribed to XRPL transactions");

  xrplClient.on("transaction", async (event) => {
    try {
      if (!event || !event.transaction) return;
      const tx = event.transaction;
      if (tx.TransactionType === "Payment" && tx.Memos) {
        const memos = tx.Memos.map(m =>
          Buffer.from(m.Memo.MemoData, "hex").toString("utf8")
        );
        memos.forEach(async (m) => {
          if (m.includes("req_")) {
            const match = m.match(/req_\d+/);
            if (match) {
              const reqId = match[0];
              if (requests[reqId] && requests[reqId].status === "OPEN") {
                requests[reqId].status = "PAID";
                requests[reqId].paidTx = tx.hash;
                console.log("💰 Request paid:", reqId);

                // 调用 FDC 提交 attestation
                try {
                  const { submitXrpPaymentAttestation } = require('./fdc');
                  const att = await submitXrpPaymentAttestation(tx.hash);
                  requests[reqId].attestation = att;
                  console.log("📝 Attestation submitted:", att);
                } catch (fdcErr) {
                  console.error("FDC attestation failed:", fdcErr.message);
                }
              }
            }
          }
        });
      }
    } catch (err) {
      console.error("tx parse error", err);
    }
  });

  app.listen(4000, () => console.log("🚀 Backend running on http://localhost:4000"));
})();

