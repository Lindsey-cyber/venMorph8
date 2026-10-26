import express from "express";
import cors from "cors";
const app = express();
app.use(express.json());
app.use(cors());
// 接收前端 attestation 请求
app.post("/api/attest", (req, res) => {
  console.log("收到 attestation 请求:", req.body);
  // 先简单返回确认
  res.send(`attestation started for tx ${req.body.xrplTxHash}`);
});

// 监听端口
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ 后端启动成功: http://localhost:${PORT}`);
});
