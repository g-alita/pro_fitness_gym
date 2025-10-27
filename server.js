// ===== Import Dependencies =====
require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");

// ===== App Setup =====
const app = express();
const PORT = process.env.PORT || 3000;

// ===== Middleware =====
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ===== MongoDB Connection =====
// Replace the connection string below with your Atlas URI from MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// ===== Define Enquiry Schema & Model =====
const enquirySchema = new mongoose.Schema({
  name: String,
  phone: String,
  gender: String,
  age: Number,
  fitnessGoal: String,
  date: { type: Date, default: Date.now },
});

const Enquiry = mongoose.model("Enquiry", enquirySchema);

// ===== Static File Serving =====
app.use(express.static(__dirname));

// ===== Routes for Pages =====
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "gym.html")));
app.get("/gym", (req, res) => res.sendFile(path.join(__dirname, "gym.html")));
app.get("/services", (req, res) =>
  res.sendFile(path.join(__dirname, "services.html"))
);
app.get("/gallery", (req, res) =>
  res.sendFile(path.join(__dirname, "gallery.html"))
);
app.get("/teams", (req, res) =>
  res.sendFile(path.join(__dirname, "teams.html"))
);
app.get("/contact", (req, res) =>
  res.sendFile(path.join(__dirname, "contact.html"))
);

// ===== API Endpoint for Contact Form =====
app.post("/api/contact", async (req, res) => {
  try {
    const { name, phone, gender, age, fitnessGoal } = req.body;

    // Save to MongoDB
    const newEnquiry = new Enquiry({ name, phone, gender, age, fitnessGoal });
    await newEnquiry.save();

    console.log("📩 New enquiry saved:", newEnquiry);

    res.json({
      success: true,
      message: "✅ Thank you! Your enquiry has been saved. We’ll contact you soon.",
    });
  } catch (error) {
    console.error("❌ Error saving enquiry:", error);
    res.status(500).json({
      success: false,
      message: "❌ Failed to save enquiry. Please try again later.",
    });
  }
});

// ===== Start Server =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});