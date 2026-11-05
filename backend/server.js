const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const ProFitnessFAQ = require("../frontend/faq-data");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const DATABASE_NAME = "profitnessgym";
let mongoConnectionPromise;

const contactSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many contact submissions. Please try again later." }
});

const faqSearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many FAQ searches. Please try again later." }
});

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const enquirySchema = new mongoose.Schema({
  recordType: { type: String, enum: ["contact", "faq"], default: "contact" },
  name: String,
  phone: String,
  email: String,
  gender: String,
  age: Number,
  fitnessGoal: String,
  message: String,
  membershipPlan: String,
  question: { type: String, maxlength: 250 },
  normalizedQuestion: { type: String, maxlength: 250 },
  answer: { type: String, maxlength: 2000 },
  date: { type: Date, default: Date.now }
});
enquirySchema.index(
  { recordType: 1, normalizedQuestion: 1 },
  {
    unique: true,
    partialFilterExpression: { recordType: "faq", normalizedQuestion: { $type: "string" } }
  }
);

const databaseConnection = mongoose.connection.useDb(DATABASE_NAME, { useCache: true });
const Enquiry = databaseConnection.model("Enquiry", enquirySchema, "contact_query");

async function connectToMongoDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (mongoose.connection.readyState === 0) {
    mongoConnectionPromise = null;
  }
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured.");
  }
  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose.connect(process.env.MONGO_URI)
      .then(async () => {
        console.log("Connected to MongoDB Atlas");
        try {
          await Enquiry.createCollection();
        } catch (error) {
          if (error.code !== 48) {
            console.error("Failed to create contact_query collection:", error.message);
          }
        }
        return mongoose.connection;
      });
  }
  try {
    return await mongoConnectionPromise;
  } catch (error) {
    mongoConnectionPromise = null;
    throw error;
  }
}

async function sendContactNotification(enquiry) {
  const { RESEND_API_KEY, EMAIL_FROM, CONTACT_EMAIL } = process.env;
  if (!RESEND_API_KEY || !EMAIL_FROM || !CONTACT_EMAIL) {
    const error = new Error("Resend contact email is not configured.");
    error.code = "RESEND_NOT_CONFIGURED";
    throw error;
  }

  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [CONTACT_EMAIL],
        subject: `New gym enquiry from ${enquiry.name}`,
        text: [
          "A new contact form submission was received.",
          "",
          `Name: ${enquiry.name}`,
          `Phone: ${enquiry.phone}`,
          ...(enquiry.email ? [`Email: ${enquiry.email}`] : []),
          `Gender: ${enquiry.gender || "Not provided"}`,
          `Age: ${enquiry.age ?? "Not provided"}`,
          `Fitness goal: ${enquiry.fitnessGoal}`,
          ...(enquiry.membershipPlan ? [`Selected membership plan: ${enquiry.membershipPlan}`] : []),
          `Message: ${enquiry.message || "Not provided"}`
        ].join("\n")
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    const error = new Error("Unable to reach the Resend email service.");
    error.code = "RESEND_NETWORK_ERROR";
    throw error;
  }

  if (!response.ok) {
    let providerName;
    let providerMessage;
    try {
      const result = await response.json();
      providerName = result.name;
      providerMessage = result.message;
    } catch {
      providerName = undefined;
      providerMessage = undefined;
    }
    const error = new Error("Resend rejected the contact notification.");
    error.status = response.status;
    error.providerName = providerName;
    error.providerMessage = providerMessage;
    throw error;
  }

  await response.arrayBuffer();
}

app.use(express.static(FRONTEND_DIR));

app.get("/", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "gym.html")));
app.get("/gym", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "gym.html")));
app.get("/services", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "services.html")));
app.get("/gallery", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "gallery.html")));
app.get("/teams", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "teams.html")));
app.get("/contact", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "contact.html")));
app.get("/faq", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "faq.html")));

app.post("/api/contact", contactSubmissionLimiter, async (req, res) => {
  const {
    name,
    phone,
    email = "",
    gender = "",
    age = null,
    fitnessGoal,
    message = "",
    membershipPlan = ""
  } = req.body || {};
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120 ||
      typeof phone !== "string" || !phone.trim() || phone.trim().length > 40 ||
      typeof email !== "string" || email.length > 254 ||
      (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) ||
      typeof gender !== "string" || gender.length > 40 ||
      (age !== null && (!Number.isInteger(age) || age < 1 || age > 120)) ||
      typeof fitnessGoal !== "string" || !fitnessGoal.trim() || fitnessGoal.length > 100 ||
      typeof message !== "string" || message.length > 2000 ||
      typeof membershipPlan !== "string" || membershipPlan.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Please check your contact details and try again."
    });
  }

  const enquiry = {
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    gender: gender.trim(),
    age,
    fitnessGoal: fitnessGoal.trim(),
    message: message.trim(),
    membershipPlan: membershipPlan.trim()
  };

  try {
    await connectToMongoDB();
    await new Enquiry(enquiry).save();
  } catch (error) {
    console.error("Failed to save contact form enquiry:", error.message);
    return res.status(500).json({
      success: false,
      saved: false,
      message: "Unable to submit your enquiry right now. Please try again later."
    });
  }

  try {
    await sendContactNotification(enquiry);

    return res.json({
      success: true,
      saved: true,
      notificationSent: true,
      message: "Thank you! Your enquiry was sent successfully. We'll contact you soon."
    });
  } catch (error) {
    console.error("Contact enquiry notification failed:", {
      code: error.code,
      status: error.status,
      providerName: error.providerName,
      providerMessage: error.providerMessage
    });
    const senderDomainUnverified =
      typeof error.providerMessage === "string" &&
      /domain.{0,30}not verified|not verified.{0,30}domain/i.test(error.providerMessage);
    return res.status(error.code === "RESEND_NOT_CONFIGURED" ? 503 : 502).json({
      success: false,
      saved: true,
      notificationSent: false,
      message: senderDomainUnverified
        ? "Your enquiry was saved, but Resend cannot send email from an unverified domain. Verify a domain in Resend, then set EMAIL_FROM to an address on that domain. Personal Gmail addresses cannot be used as the sender domain."
        : "Your enquiry was saved, but its email notification could not be sent. Please call the gym to confirm."
    });
  }
});

app.post("/api/faq/search", faqSearchLimiter, async (req, res) => {
  const question = req.body?.question;
  if (typeof question !== "string" || !question.trim() || question.trim().length > 250) {
    return res.status(400).json({
      success: false,
      message: "Enter a question of 250 characters or fewer."
    });
  }

  const trimmedQuestion = question.trim();
  const normalizedQuestion = ProFitnessFAQ.normalizeQuestion(trimmedQuestion);
  if (!normalizedQuestion) {
    return res.status(400).json({
      success: false,
      message: "Enter a question using letters or numbers."
    });
  }

  try {
    await connectToMongoDB();
  } catch (error) {
    console.error("FAQ MongoDB connection failed:", error.message);
    return res.status(503).json({
      success: false,
      message: "FAQ search is temporarily unavailable. Please try again later."
    });
  }

  try {
    const query = { recordType: "faq", normalizedQuestion };
    const existing = await Enquiry.findOne(query).lean();
    if (existing?.answer?.trim()) {
      return res.json({ success: true, answer: existing.answer, source: "database" });
    }

    const faqEntry = ProFitnessFAQ.findEntry(trimmedQuestion);
    const answer = faqEntry?.answer || "";
    const savedQuestion = await Enquiry.findOneAndUpdate(
      query,
      {
        $set: { answer },
        $setOnInsert: {
          recordType: "faq",
          question: trimmedQuestion,
          normalizedQuestion
        }
      },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    return res.json({
      success: true,
      answer: savedQuestion.answer || null,
      source: savedQuestion.answer ? (faqEntry ? "faq" : "database") : "none"
    });
  } catch (error) {
    console.error("FAQ search failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to search FAQs right now. Please try again later."
    });
  }
});

if (require.main === module) {
  connectToMongoDB().catch((error) => {
    console.error("MongoDB connection failed:", error.message);
  });
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = { app, connectToMongoDB };
