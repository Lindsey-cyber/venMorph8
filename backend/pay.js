// pay.js
require('dotenv').config();
const xrpl = require('xrpl');

async function main() {
  const client = new xrpl.Client(process.env.XRPL_WS || "wss://s.altnet.rippletest.net:51233");
  await client.connect();

  // Receiver 的 seed（测试用）
  const receiverSeed = "sEdTJdLuEgQq6SzixR1cpdVuzEy3Wzx"; // ⚠️ 仅测试环境用！
  const wallet = xrpl.Wallet.fromSeed(receiverSeed);

  // Requester 地址
  const requesterAddress = "rwJDVy2wDUc3cP5GaPrQTyLZGqNdgTcMbk";

  // 假设我们要支付 100 XRP（只是例子，你可以根据 /api/price/quote 动态算）
  const amountInDrops = xrpl.xrpToDrops("5");

  // 假设这是要支付的 requestId
  const requestId = "req_1758350032406";

  const tx = {
    TransactionType: "Payment",
    Account: wallet.classicAddress,
    Destination: requesterAddress,
    Amount: amountInDrops,
    Memos: [
      {
        Memo: {
            MemoData: Buffer.from(JSON.stringify({ requestId }), "utf8").toString("hex"),
            MemoFormat: Buffer.from("application/json").toString("hex"),
            MemoType: Buffer.from("venmo_payment").toString("hex")
        }
      }
    ]
  };

  const prepared = await client.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  if (result.result.meta.TransactionResult === "tesSUCCESS") {
    console.log("💸 Payment sent!");
    console.log("Tx Hash:", result.result.hash);
    console.log("Delivered:", result.result.meta.delivered_amount, "drops");
    console.log("Status:", result.result.meta.TransactionResult);
    console.log("Result:", result);
  } else {
    console.error("❌ Payment failed:", result);
  }
  await client.disconnect();
}

main();
