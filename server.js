// ===== Import Dependencies =====
require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const { OAuth2Client } = require("google-auth-library");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 12);

// ===== App Setup =====
const app = express();
const PORT = process.env.PORT || 3000;
const googleOAuthClient = new OAuth2Client();
const authSessionSecret = process.env.AUTH_SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.AUTH_SESSION_SECRET) {
  console.warn("AUTH_SESSION_SECRET is unset; active sign-in sessions will expire when the server restarts.");
}

function getGoogleAdminEmails() {
  return (process.env.GOOGLE_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidEmail(email) {
  return typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createSmtpTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_FROM || (SMTP_USER && !SMTP_PASS) || (!SMTP_USER && SMTP_PASS)) {
    return null;
  }

  const options = {
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === "true"
  };
  if (SMTP_USER) {
    options.auth = { user: SMTP_USER, pass: SMTP_PASS };
  }
  return nodemailer.createTransport(options);
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createAuthToken(email, role) {
  const payload = base64UrlEncode(JSON.stringify({
    email,
    role,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000
  }));
  const signature = crypto.createHmac("sha256", authSessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readAuthToken(req) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("pro_fitness_session="));
  if (!cookie) return null;

  const token = cookie.slice("pro_fitness_session=".length);
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = crypto.createHmac("sha256", authSessionSecret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.email || !["user", "admin"].includes(data.role) ||
        typeof data.expiresAt !== "number" || data.expiresAt <= Date.now()) {
      return null;
    }
    return { email: data.email, role: data.role };
  } catch {
    return null;
  }
}

function setAuthSession(req, res, email, role) {
  res.cookie("pro_fitness_session", createAuthToken(email, role), {
    httpOnly: true,
    secure: req.secure || process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000
  });
}

async function isAccountAllowed(accountType, email) {
  if (accountType === "admin") {
    return getGoogleAdminEmails().includes(email);
  }

  return Boolean(await User.exists({
    email: new RegExp(`^${escapeRegex(email)}$`, "i")
  }));
}

const passwordLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many sign-in attempts. Please try again later." }
});

const passwordResetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many password setup requests. Please try again later." }
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many password reset attempts. Please try again later." }
});

// ===== Middleware =====
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const session = readAuthToken(req);
  const isAdminPage = req.path === "/admin" || req.path === "/admin.html";
  const isUserPage = req.path === "/profile" || req.path === "/profile.html";
  const isUserManagementApi = req.path === "/api/users" ||
    req.path.startsWith("/api/users/");

  if (isAdminPage && (!session || session.role !== "admin" ||
      !getGoogleAdminEmails().includes(session.email.toLowerCase()))) {
    return res.redirect("/signin-admin.html");
  }
  if (isUserPage && (!session || session.role !== "user")) {
    return res.redirect("/signin-user.html");
  }
  if (isUserManagementApi && (!session || session.role !== "admin" ||
      !getGoogleAdminEmails().includes(session.email.toLowerCase()))) {
    return res.status(401).json({ success: false, message: "Admin sign-in is required." });
  }

  req.authSession = session;
  next();
});

// ===== Email/Password Authentication =====
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("pro_fitness_session", {
    httpOnly: true,
    secure: req.secure || process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  res.json({ success: true });
});

app.post("/api/auth/password/login", passwordLoginLimiter, async (req, res) => {
  const { email, password, accountType } = req.body || {};
  if (!isValidEmail(email) || typeof password !== "string" ||
      !["user", "admin"].includes(accountType)) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid email address and password."
    });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const allowed = await isAccountAllowed(accountType, normalizedEmail);
    const account = allowed
      ? await PasswordCredential.findOne({ email: normalizedEmail, accountType })
      : null;
    const validPassword = await bcrypt.compare(
      password,
      account ? account.passwordHash : DUMMY_PASSWORD_HASH
    );

    if (!allowed || !account || !validPassword) {
      return res.status(401).json({
        success: false,
        message: "Email or password is incorrect."
      });
    }

    setAuthSession(req, res, normalizedEmail, accountType);
    res.json({ success: true, email: normalizedEmail });
  } catch (error) {
    console.error("Email/password sign-in failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to sign in right now. Please try again later."
    });
  }
});

app.post("/api/auth/password/request-reset", passwordResetRequestLimiter, async (req, res) => {
  const { email, accountType } = req.body || {};
  if (!isValidEmail(email) || !["user", "admin"].includes(accountType)) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid email address."
    });
  }

  const appBaseUrl = process.env.APP_BASE_URL;
  const transport = createSmtpTransport();
  if (!appBaseUrl || !transport) {
    return res.status(503).json({
      success: false,
      message: "Password setup email is not configured. Please contact the gym."
    });
  }

  let resetUrl;
  try {
    const baseUrl = new URL(appBaseUrl);
    if (!["http:", "https:"].includes(baseUrl.protocol)) {
      throw new Error("APP_BASE_URL must use HTTP or HTTPS.");
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!(await isAccountAllowed(accountType, normalizedEmail))) {
      return res.json({
        success: true,
        message: "If the email belongs to an authorized account, a password setup link will be sent."
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await PasswordResetToken.deleteMany({ email: normalizedEmail, accountType });
    await PasswordResetToken.create({
      email: normalizedEmail,
      accountType,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    resetUrl = new URL("/password-reset.html", baseUrl);
    resetUrl.searchParams.set("token", token);
    resetUrl.searchParams.set("type", accountType);
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: normalizedEmail,
      subject: "Set or reset your Pro Fitness Gym password",
      text: `Use this link within 30 minutes to set or reset your password:\n\n${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`
    });

    res.json({
      success: true,
      message: "If the email belongs to an authorized account, a password setup link will be sent."
    });
  } catch (error) {
    console.error("Password setup email failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to send a password setup email right now. Please try again later."
    });
  }
});

app.post("/api/auth/password/reset", passwordResetLimiter, async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token) ||
      typeof password !== "string" || password.length < 8 || password.length > 128) {
    return res.status(400).json({
      success: false,
      message: "Use a valid setup link and a password between 8 and 128 characters."
    });
  }

  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const reset = await PasswordResetToken.findOneAndDelete({
      tokenHash,
      expiresAt: { $gt: new Date() }
    });
    if (!reset || !(await isAccountAllowed(reset.accountType, reset.email))) {
      return res.status(400).json({
        success: false,
        message: "This password setup link is invalid or expired. Request a new one."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await PasswordCredential.findOneAndUpdate(
      { email: reset.email, accountType: reset.accountType },
      { $set: { passwordHash } },
      { upsert: true, new: true, runValidators: true }
    );
    res.json({ success: true, message: "Password set successfully. You can now sign in." });
  } catch (error) {
    console.error("Password reset failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to set your password right now. Please try again later."
    });
  }
});

// ===== Google Admin Sign-In =====
app.get("/api/auth/google/config", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({
      success: false,
      message: "Google sign-in is not configured on the server."
    });
  }

  res.json({ clientId });
});

app.post("/api/auth/google/admin", async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const allowedEmails = getGoogleAdminEmails();
  const credential = req.body && req.body.credential;

  if (!clientId || allowedEmails.length === 0) {
    return res.status(503).json({
      success: false,
      message: "Google admin sign-in is not configured on the server."
    });
  }
  if (typeof credential !== "string" || credential.length === 0) {
    return res.status(400).json({
      success: false,
      message: "A Google credential is required."
    });
  }

  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: credential,
      audience: clientId
    });
    const payload = ticket.getPayload();
    const email = payload && payload.email;

    if (!email || payload.email_verified !== true) {
      return res.status(401).json({
        success: false,
        message: "Use a Google account with a verified email address."
      });
    }
    if (!allowedEmails.includes(email.toLowerCase())) {
      return res.status(403).json({
        success: false,
        message: "This Google account is not authorized for admin access."
      });
    }

    setAuthSession(req, res, email.toLowerCase(), "admin");
    res.json({ success: true, email });
  } catch (error) {
    console.error("Google ID token verification failed:", error.message);
    res.status(401).json({
      success: false,
      message: "Google account could not be verified. Please try again."
    });
  }
});

app.post("/api/auth/google/user", async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const credential = req.body && req.body.credential;

  if (!clientId) {
    return res.status(503).json({
      success: false,
      message: "Google sign-in is not configured on the server."
    });
  }
  if (typeof credential !== "string" || credential.length === 0) {
    return res.status(400).json({
      success: false,
      message: "A Google credential is required."
    });
  }

  let email;
  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: credential,
      audience: clientId
    });
    const payload = ticket.getPayload();
    email = payload && payload.email;

    if (!email || payload.email_verified !== true) {
      return res.status(401).json({
        success: false,
        message: "Use a Google account with a verified email address."
      });
    }
  } catch (error) {
    console.error("Google user ID token verification failed:", error.message);
    return res.status(401).json({
      success: false,
      message: "Google account could not be verified. Please try again."
    });
  }

  try {
    const registeredUser = await User.exists({
      email: new RegExp(`^${escapeRegex(email)}$`, "i")
    });
    if (!registeredUser) {
      return res.status(403).json({
        success: false,
        message: "This Google account is not on the registered user list. Please contact the gym."
      });
    }

    setAuthSession(req, res, email.toLowerCase(), "user");
    res.json({ success: true, email });
  } catch (error) {
    console.error("Google user sign-in failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to verify your user account right now. Please try again later."
    });
  }
});

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

// ===== Define User Schema & Model =====
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  gender: String,
  age: Number,
  fitnessGoal: String,
  membershipType: String,
  membershipStatus: { type: String, default: 'Active' },
  joinDate: { type: Date, default: Date.now },
  address: String,
  notes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

const passwordCredentialSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  accountType: { type: String, required: true, enum: ["user", "admin"] },
  passwordHash: { type: String, required: true }
});
passwordCredentialSchema.index({ email: 1, accountType: 1 }, { unique: true });
const PasswordCredential = mongoose.model("PasswordCredential", passwordCredentialSchema);

const passwordResetTokenSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  accountType: { type: String, required: true, enum: ["user", "admin"] },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
});
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const PasswordResetToken = mongoose.model("PasswordResetToken", passwordResetTokenSchema);

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
app.get("/admin", (req, res) =>
  res.sendFile(path.join(__dirname, "admin.html"))
);
app.get("/profile", (req, res) =>
  res.sendFile(path.join(__dirname, "profile.html"))
);
app.get("/signin-user", (req, res) =>
  res.sendFile(path.join(__dirname, "signin-user.html"))
);
app.get("/signin-admin", (req, res) =>
  res.sendFile(path.join(__dirname, "signin-admin.html"))
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
      message: "✅ Thank you! Your enquiry has been saved. We'll contact you soon.",
    });
  } catch (error) {
    console.error("❌ Error saving enquiry:", error);
    res.status(500).json({
      success: false,
      message: "❌ Failed to save enquiry. Please try again later.",
    });
  }
});

// ===== API Endpoints for User Management =====

// Get all users
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });
    res.json({
      success: true,
      users: users
    });
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "❌ Failed to fetch users.",
      error: error.message
    });
  }
});

// Bulk update/create users
app.post("/api/users/bulk-update", async (req, res) => {
  try {
    const { updates, creates } = req.body;
    let updatedCount = 0;
    let createdCount = 0;

    // Update existing users
    if (updates && updates.length > 0) {
      for (const userData of updates) {
        const { _id, ...updateData } = userData;
        updateData.updatedAt = new Date();
        
        // Convert joinDate string to Date if provided
        if (updateData.joinDate && typeof updateData.joinDate === 'string') {
          updateData.joinDate = new Date(updateData.joinDate);
        }
        
        await User.findByIdAndUpdate(_id, updateData, { new: true });
        updatedCount++;
      }
    }

    // Create new users
    if (creates && creates.length > 0) {
      for (const userData of creates) {
        // Convert joinDate string to Date if provided
        if (userData.joinDate && typeof userData.joinDate === 'string') {
          userData.joinDate = new Date(userData.joinDate);
        }
        
        const newUser = new User(userData);
        await newUser.save();
        createdCount++;
      }
    }

    console.log(`✅ Bulk update completed: ${updatedCount} updated, ${createdCount} created`);

    res.json({
      success: true,
      updated: updatedCount,
      created: createdCount,
      message: `Successfully updated ${updatedCount} users and created ${createdCount} new users.`
    });
  } catch (error) {
    console.error("❌ Error in bulk update:", error);
    res.status(500).json({
      success: false,
      message: "❌ Failed to update users.",
      error: error.message
    });
  }
});

// Delete user
app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    res.json({
      success: true,
      message: "User deleted successfully."
    });
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({
      success: false,
      message: "❌ Failed to delete user.",
      error: error.message
    });
  }
});

// ===== Start Server =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});