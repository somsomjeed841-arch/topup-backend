const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const QRCode = require("qrcode");
const generatePayload = require("promptpay-qr");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* =========================
   Cloudinary Config
========================= */

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME=soomjeed,
  api_key: process.env.CLOUD_API_KEY=372972935332658,
  api_secret: process.env.CLOUD_API_SECRET=g0TZLImDkhYbCL9aq5xC5OVWpXA
});

/* =========================
   เชื่อม MongoDB
========================= */

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

/* =========================
   ตั้งค่า Upload (Temporary)
========================= */

const upload = multer({ dest: "temp/" });

/* =========================
   Schema User
========================= */

const userSchema = new mongoose.Schema({
  email: String,
  balance: { type: Number, default: 0 }
});

const User = mongoose.model("User", userSchema);

/* =========================
   Schema Order
========================= */

const orderSchema = new mongoose.Schema({
  email: String,
  originalAmount: Number,
  finalAmount: Number,
  status: { type: String, default: "pending" },
  slip: String, // จะเก็บ URL จาก Cloudinary
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model("Order", orderSchema);

/* =========================
   สร้าง Order + QR
========================= */

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
    const payload = generatePayload(promptpayNumber, {
      amount: Number(finalAmount)
    });

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
/* =========================
   อัปโหลดสลิป → Cloudinary
========================= */

app.post("/upload-slip/:id", upload.single("slip"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // อัปขึ้น Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path);

    // ลบไฟล์ temp ทิ้ง
    fs.unlinkSync(req.file.path);

    order.slip = result.secure_url; // เก็บ URL ถาวร
    await order.save();

    res.json({ message: "Slip uploaded" });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Upload error" });
  }
});

/* =========================
   ดึง Order ทั้งหมด (Admin)
========================= */

app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Error fetching orders" });
  }
});

/* =========================
   อนุมัติ Order
========================= */

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
    console.log(error);
    res.status(500).json({ message: "Error approving order" });
  }
});

/* =========================
   ซื้อสินค้า
========================= */

app.post("/buy", async (req, res) => {
  try {
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

  } catch (error) {
    res.status(500).json({ message: "Error buying" });
  }
});

/* =========================
   ทดสอบ
========================= */

app.get("/", (req, res) => {
  res.send("Server is running");
});

/* =========================
   Start Server
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});