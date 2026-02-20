const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const QRCode = require("qrcode");
const generatePayload = require("promptpay-qr");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// ===== เชื่อม MongoDB =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

// ===== ตั้งค่า Upload =====
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// ===== Schema User =====
const userSchema = new mongoose.Schema({
  email: String,
  balance: { type: Number, default: 0 }
});
const User = mongoose.model("User", userSchema);

// ===== Schema Order =====
const orderSchema = new mongoose.Schema({
  email: String,
  originalAmount: Number,
  finalAmount: Number,
  status: { type: String, default: "pending" },
  slip: String,
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model("Order", orderSchema);

// ===== สร้าง Order + QR =====
app.post("/create-order", async (req, res) => {
  try {
    const { email, amount } = req.body;

    if (!email || !amount) {
      return res.status(400).json({ message: "Missing data" });
    }

    const randomSatang = (Math.floor(Math.random() * 9) + 1) / 100;
    const finalAmount = (parseFloat(amount) + randomSatang).toFixed(2);

    const order = new Order({
      email,
      originalAmount: Number(amount),
      finalAmount: Number(finalAmount)
    });

    await order.save();

    const promptpayNumber = "0611750847"; // ใส่เบอร์คุณ
    const payload = generatePayload(promptpayNumber, { amount: Number(finalAmount) });
    const qrCode = await QRCode.toDataURL(payload);

    res.json({
      order,
      qrCode
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ===== อัปโหลดสลิป =====
app.post("/upload-slip/:id", upload.single("slip"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.slip = req.file.filename;
    await order.save();

    res.json({ message: "Slip uploaded" });
  } catch (error) {
    res.status(500).json({ message: "Upload error" });
  }
});

// ===== ดึง Order ทั้งหมด (Admin) =====
app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Error fetching orders" });
  }
});

// ===== อนุมัติ Order =====
app.post("/approve/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status === "approved") {
      return res.json({ message: "Already approved" });
    }

    order.status = "approved";
    await order.save();

    let user = await User.findOne({ email: order.email });

    if (!user) {
      user = new User({ email: order.email, balance: 0 });
    }

    user.balance += order.originalAmount;
    await user.save();

    res.json({ message: "Order approved and balance updated" });

  } catch (error) {
    res.status(500).json({ message: "Error approving order" });
  }
});

// ===== ซื้อสินค้า =====
app.post("/buy", async (req, res) => {
  const { email, price } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.json({ message: "ไม่พบผู้ใช้" });
  }

  if (user.balance < price) {
    return res.json({ message: "เงินไม่พอ" });
  }

  user.balance -= price;
  await user.save();

  res.json({ message: "ซื้อสำเร็จ!" });
});

// ===== ทดสอบ =====
app.get("/", (req, res) => {
  res.send("Server is running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});