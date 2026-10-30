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
const ADMIN_DATA_DATABASE_NAME = "profitnessgym";
const ADMIN_DATA_COLLECTIONS = [
  { name: "members sheet 1", label: "Members Sheet 1" },
  { name: "members sheet 2", label: "Members Sheet 2" },
  { name: "members sheet 3", label: "Members Sheet 3" },
  { name: "evening", label: "Evening" },
  { name: "morning", label: "Morning" }
];

async function getAdminDatasetFields(collection) {
  const fields = await collection.aggregate([
    {
      $project: {
        fields: {
          $map: {
            input: { $objectToArray: "$$ROOT" },
            as: "field",
            in: "$$field.k"
          }
        }
      }
    },
    { $unwind: "$fields" },
    { $group: { _id: "$fields" } },
    { $sort: { _id: 1 } }
  ]).toArray();
  return fields.map(({ _id }) => _id).filter((field) => field !== "_id");
}
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

function isValidIndianMobile(phone) {
  return typeof phone === "string" && /^\+91[6-9]\d{9}$/.test(phone);
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encodeBase32(buffer) {
  let value = 0;
  let bits = 0;
  let encoded = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    encoded += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return encoded;
}

function decodeBase32(secret) {
  let value = 0;
  let bits = 0;
  const decoded = [];
  for (const character of secret) {
    const digit = BASE32_ALPHABET.indexOf(character);
    if (digit === -1) return null;
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      decoded.push((value >>> bits) & 255);
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(decoded);
}

function verifyTotp(secret, code, now = Date.now()) {
  const key = decodeBase32(secret);
  if (!key || !/^\d{6}$/.test(code)) return false;

  const currentStep = Math.floor(now / 30000);
  let isValid = false;
  for (let offset = -1; offset <= 1; offset++) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(currentStep + offset));
    const digest = crypto.createHmac("sha1", key).update(counter).digest();
    const truncatedAt = digest[digest.length - 1] & 15;
    const value = digest.readUInt32BE(truncatedAt) & 0x7fffffff;
    const expected = String(value % 1000000).padStart(6, "0");
    const matches = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code));
    isValid = matches || isValid;
  }
  return isValid;
}

function isValidTotpSetupToken(candidate) {
  const configuredToken = process.env.ADMIN_TOTP_SETUP_TOKEN;
  if (!configuredToken || typeof candidate !== "string") return false;
  const candidateBuffer = Buffer.from(candidate);
  const configuredBuffer = Buffer.from(configuredToken);
  return candidateBuffer.length === configuredBuffer.length &&
    crypto.timingSafeEqual(candidateBuffer, configuredBuffer);
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

function createAuthToken(email, role, phone) {
  const payload = base64UrlEncode(JSON.stringify({
    email,
    role,
    ...(phone ? { phone } : {}),
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
    const hasEmail = typeof data.email === "string" && data.email.length > 0;
    const hasAdminPhone = data.role === "admin" && isValidIndianMobile(data.phone);
    if ((!hasEmail && !hasAdminPhone) || !["user", "admin"].includes(data.role) ||
        typeof data.expiresAt !== "number" || data.expiresAt <= Date.now()) {
      return null;
    }
    return { email: data.email || null, role: data.role, phone: data.phone || null };
  } catch {
    return null;
  }
}

function setAuthSession(req, res, email, role, phone) {
  res.cookie("pro_fitness_session", createAuthToken(email, role, phone), {
    httpOnly: true,
    secure: req.secure || process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000
  });
}

async function isAccountAllowed(accountType, email) {
  if (accountType === "admin") {
    return getGoogleAdminEmails().includes(email) || Boolean(await AdminAllowlist.exists({
      email,
      enabled: { $ne: false }
    }));
  }

  return Boolean(await User.exists({
    email: new RegExp(`^${escapeRegex(email)}$`, "i")
  }));
}

async function isAuthorizedAdminSession(session) {
  if (!session || session.role !== "admin") return false;
  if (session.email && getGoogleAdminEmails().includes(session.email.toLowerCase())) {
    return true;
  }
  if (session.email && await AdminAllowlist.exists({
    email: session.email.toLowerCase(),
    enabled: { $ne: false }
  })) {
    return true;
  }
  if (session.phone && isValidIndianMobile(session.phone)) {
    return Boolean(await AdminAllowlist.exists({
      phone: session.phone,
      enabled: { $ne: false },
      totpSecret: { $type: "string", $ne: "" }
    }));
  }
  return false;
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

const adminTotpSetupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many authenticator setup attempts. Please try again later." }
});

const adminTotpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many authenticator code attempts. Please try again later." }
});

// ===== Middleware =====
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(async (req, res, next) => {
  const session = readAuthToken(req);
  const isAdminPage = req.path === "/admin" || req.path === "/admin.html";
  const isUserPage = req.path === "/profile" || req.path === "/profile.html";
  const isUserManagementApi = req.path === "/api/users" ||
    req.path.startsWith("/api/users/");
  const isAdminDatasetApi = req.path === "/api/admin/datasets" ||
    req.path.startsWith("/api/admin/datasets/");

  if (isAdminPage && !(await isAuthorizedAdminSession(session))) {
    return res.redirect("/signin-admin.html");
  }
  if (isUserPage && (!session || session.role !== "user")) {
    return res.redirect("/signin-user.html");
  }
  if (isUserManagementApi && !(await isAuthorizedAdminSession(session))) {
    return res.status(401).json({ success: false, message: "Admin sign-in is required." });
  }
  if (isAdminDatasetApi && !(await isAuthorizedAdminSession(session))) {
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

app.post("/api/auth/phone/admin/setup-authenticator", adminTotpSetupLimiter, async (req, res) => {
  const { phone, setupToken } = req.body || {};
  if (!isValidIndianMobile(phone)) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid Indian mobile number in +91XXXXXXXXXX format."
    });
  }
  if (!isValidTotpSetupToken(setupToken)) {
    return res.status(403).json({
      success: false,
      message: "Authenticator setup is not authorized."
    });
  }

  try {
    const secret = encodeBase32(crypto.randomBytes(20));
    const admin = await AdminAllowlist.findOneAndUpdate(
      {
        phone,
        enabled: { $ne: false },
        $or: [{ totpSecret: { $exists: false } }, { totpSecret: "" }]
      },
      { $set: { totpSecret: secret } },
      { new: true, runValidators: true }
    );
    if (!admin) {
      const isAllowed = await AdminAllowlist.exists({
        phone,
        enabled: { $ne: false }
      });
      return res.status(isAllowed ? 409 : 404).json({
        success: false,
        message: isAllowed
          ? "An authenticator is already configured for this number."
          : "This phone number is not on the enabled admin allowlist."
      });
    }

    const label = encodeURIComponent(`Pro Fitness Gym:${phone}`);
    const issuer = encodeURIComponent("Pro Fitness Gym");
    res.json({
      success: true,
      phone,
      secret,
      otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
    });
  } catch (error) {
    console.error("Admin authenticator setup failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to set up an authenticator right now. Please try again later."
    });
  }
});

app.post("/api/auth/phone/admin/verify-totp", adminTotpVerifyLimiter, async (req, res) => {
  const { phone, code } = req.body || {};
  if (!isValidIndianMobile(phone) || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid Indian mobile number and six-digit authenticator code."
    });
  }

  try {
    const admin = await AdminAllowlist.findOne({
      phone,
      enabled: { $ne: false }
    }).select("phone +totpSecret");
    if (!admin || !admin.totpSecret) {
      return res.status(401).json({
        success: false,
        message: "This number is not enabled for authenticator sign-in."
      });
    }

    if (!verifyTotp(admin.totpSecret, code)) {
      return res.status(401).json({
        success: false,
        message: "The phone number or authenticator code is incorrect."
      });
    }

    const stillAllowed = await AdminAllowlist.exists({
      phone,
      enabled: { $ne: false },
      totpSecret: admin.totpSecret
    });
    if (!stillAllowed) {
      return res.status(401).json({
        success: false,
        message: "The phone number or authenticator code is incorrect."
      });
    }

    setAuthSession(req, res, null, "admin", phone);
    res.json({ success: true, phone });
  } catch (error) {
    console.error("Admin authenticator verification failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to verify the authenticator code right now. Please try again later."
    });
  }
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
  const credential = req.body && req.body.credential;

  if (!clientId) {
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
    if (!(await isAccountAllowed("admin", email.toLowerCase()))) {
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

const adminAllowlistSchema = new mongoose.Schema({
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  phone: {
    type: String,
    match: /^\+91[6-9]\d{9}$/
  },
  totpSecret: { type: String, select: false },
  enabled: { type: Boolean, default: true }
}, { collection: "admin_allowlist" });
adminAllowlistSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);
adminAllowlistSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string" } } }
);
const AdminAllowlist = mongoose.model("AdminAllowlist", adminAllowlistSchema);

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

app.get("/api/admin/datasets", async (req, res) => {
  try {
    const database = mongoose.connection.useDb(ADMIN_DATA_DATABASE_NAME, { useCache: true });
    const collections = await Promise.all(ADMIN_DATA_COLLECTIONS.map(async ({ name, label }) => {
      const collection = database.collection(name);
      const [count, fields] = await Promise.all([
        collection.countDocuments(),
        getAdminDatasetFields(collection)
      ]);
      return {
        name,
        label,
        count,
        fields
      };
    }));

    res.json({ success: true, database: ADMIN_DATA_DATABASE_NAME, collections });
  } catch (error) {
    console.error("Error listing admin datasets:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to load the gym member collections."
    });
  }
});

app.get("/api/admin/datasets/:collection", async (req, res) => {
  const selected = ADMIN_DATA_COLLECTIONS.find(({ name }) => name === req.params.collection);
  if (!selected) {
    return res.status(404).json({ success: false, message: "Dataset not found." });
  }

  const page = Number(req.query.page || 1);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (!Number.isSafeInteger(page) || page < 1 || search.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid page and a search term no longer than 100 characters."
    });
  }

  const pageSize = 50;
  try {
    const database = mongoose.connection.useDb(ADMIN_DATA_DATABASE_NAME, { useCache: true });
    const collection = database.collection(selected.name);
    const fields = await getAdminDatasetFields(collection);
    const filter = search && fields.length > 0
      ? {
          $or: fields.map((field) => ({
            [field]: { $regex: escapeRegex(search), $options: "i" }
          }))
        }
      : {};
    const total = await collection.countDocuments(filter);
    const totalPages = Math.ceil(total / pageSize);
    if (page > Math.max(totalPages, 1)) {
      return res.status(400).json({
        success: false,
        message: "The requested page is outside this dataset."
      });
    }

    const records = await collection.find(filter)
      .sort({ _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();
    const rows = records.map(({ _id, ...values }) => ({
      id: String(_id),
      values
    }));
    res.json({
      success: true,
      collection: selected.name,
      label: selected.label,
      fields,
      rows,
      page,
      pageSize,
      total,
      totalPages
    });
  } catch (error) {
    console.error(`Error loading admin dataset ${selected.name}:`, error.message);
    res.status(500).json({
      success: false,
      message: "Unable to load this dataset. Please try again."
    });
  }
});

app.put("/api/admin/datasets/:collection", async (req, res) => {
  const selected = ADMIN_DATA_COLLECTIONS.find(({ name }) => name === req.params.collection);
  if (!selected) {
    return res.status(404).json({ success: false, message: "Dataset not found." });
  }

  const updates = req.body && req.body.updates;
  if (!Array.isArray(updates) || updates.length === 0 || updates.length > 50) {
    return res.status(400).json({
      success: false,
      message: "Save between 1 and 50 edited records at a time."
    });
  }

  try {
    const database = mongoose.connection.useDb(ADMIN_DATA_DATABASE_NAME, { useCache: true });
    const collection = database.collection(selected.name);
    const operations = [];

    for (const update of updates) {
      if (!update || typeof update.id !== "string" ||
          !update.fields || typeof update.fields !== "object" || Array.isArray(update.fields)) {
        return res.status(400).json({
          success: false,
          message: "Each update must include a record ID and edited fields."
        });
      }

      const id = mongoose.Types.ObjectId.isValid(update.id)
        ? new mongoose.Types.ObjectId(update.id)
        : update.id;
      const current = await collection.findOne({ _id: id });
      if (!current) {
        return res.status(404).json({
          success: false,
          message: "A record no longer exists. Refresh the table and try again."
        });
      }

      const fields = Object.keys(update.fields);
      if (fields.length === 0 || fields.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Each record must include between 1 and 100 edited fields."
        });
      }

      const set = {};
      for (const field of fields) {
        const value = update.fields[field];
        if (field === "_id" || field.includes(".") || field.startsWith("$") ||
            !Object.prototype.hasOwnProperty.call(current, field) ||
            typeof value !== "string" || value.length > 10000) {
          return res.status(400).json({
            success: false,
            message: "An edited field is invalid or cannot be changed."
          });
        }

        const previousValue = current[field];
        if (typeof previousValue === "number") {
          if (value.trim() === "") {
            set[field] = null;
          } else if (Number.isFinite(Number(value))) {
            set[field] = Number(value);
          } else {
            return res.status(400).json({
              success: false,
              message: `Enter a valid number for "${field}".`
            });
          }
        } else if (typeof previousValue === "boolean") {
          if (!["true", "false"].includes(value.toLowerCase())) {
            return res.status(400).json({
              success: false,
              message: `Enter true or false for "${field}".`
            });
          }
          set[field] = value.toLowerCase() === "true";
        } else if (previousValue instanceof Date) {
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) {
            return res.status(400).json({
              success: false,
              message: `Enter a valid date for "${field}".`
            });
          }
          set[field] = date;
        } else if (previousValue && typeof previousValue === "object") {
          try {
            set[field] = JSON.parse(value);
          } catch {
            return res.status(400).json({
              success: false,
              message: `Enter valid JSON for "${field}".`
            });
          }
        } else {
          set[field] = value;
        }
      }

      operations.push({
        updateOne: {
          filter: { _id: id },
          update: { $set: set }
        }
      });
    }

    const result = await collection.bulkWrite(operations, { ordered: true });
    res.json({
      success: true,
      modified: result.modifiedCount,
      matched: result.matchedCount
    });
  } catch (error) {
    console.error(`Error saving admin dataset ${selected.name}:`, error.message);
    res.status(500).json({
      success: false,
      message: "Unable to save these changes. Please refresh and try again."
    });
  }
});

app.post("/api/admin/datasets/:collection/records", async (req, res) => {
  const selected = ADMIN_DATA_COLLECTIONS.find(({ name }) => name === req.params.collection);
  if (!selected) {
    return res.status(404).json({ success: false, message: "Dataset not found." });
  }

  const values = req.body && req.body.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return res.status(400).json({ success: false, message: "Provide values for the new record." });
  }

  try {
    const database = mongoose.connection.useDb(ADMIN_DATA_DATABASE_NAME, { useCache: true });
    const collection = database.collection(selected.name);
    const fields = await getAdminDatasetFields(collection);
    const record = {};
    for (const [field, value] of Object.entries(values)) {
      if (!fields.includes(field) || typeof value !== "string" || value.length > 10000) {
        return res.status(400).json({
          success: false,
          message: "The new record contains an invalid field or value."
        });
      }
      record[field] = value;
    }
    if (Object.keys(record).length === 0) {
      return res.status(400).json({ success: false, message: "The new record must contain fields." });
    }

    const result = await collection.insertOne(record);
    const total = await collection.countDocuments();
    res.status(201).json({ success: true, id: String(result.insertedId), total });
  } catch (error) {
    console.error(`Error adding row to admin dataset ${selected.name}:`, error.message);
    res.status(500).json({ success: false, message: "Unable to add a row to this collection." });
  }
});

app.delete("/api/admin/datasets/:collection/records/:id", async (req, res) => {
  const selected = ADMIN_DATA_COLLECTIONS.find(({ name }) => name === req.params.collection);
  if (!selected) {
    return res.status(404).json({ success: false, message: "Dataset not found." });
  }

  try {
    const database = mongoose.connection.useDb(ADMIN_DATA_DATABASE_NAME, { useCache: true });
    const collection = database.collection(selected.name);
    const id = mongoose.Types.ObjectId.isValid(req.params.id)
      ? new mongoose.Types.ObjectId(req.params.id)
      : req.params.id;
    const result = await collection.deleteOne({ _id: id });
    if (result.deletedCount !== 1) {
      return res.status(404).json({ success: false, message: "Record not found." });
    }

    res.json({ success: true, total: await collection.countDocuments() });
  } catch (error) {
    console.error(`Error deleting row from admin dataset ${selected.name}:`, error.message);
    res.status(500).json({ success: false, message: "Unable to delete this row." });
  }
});

app.post("/api/admin/datasets/:collection/columns", async (req, res) => {
  const selected = ADMIN_DATA_COLLECTIONS.find(({ name }) => name === req.params.collection);
  if (!selected) {
    return res.status(404).json({ success: false, message: "Dataset not found." });
  }

  const { action, field } = req.body || {};
  if (!["add", "delete"].includes(action) || typeof field !== "string" ||
      field.trim() !== field || field.length === 0 || field.length > 100 ||
      field === "_id" || field.includes(".") || field.includes("$") ||
      ["__proto__", "prototype", "constructor"].includes(field)) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid column name and action."
    });
  }

  try {
    const database = mongoose.connection.useDb(ADMIN_DATA_DATABASE_NAME, { useCache: true });
    const collection = database.collection(selected.name);
    const fields = await getAdminDatasetFields(collection);
    if (action === "add" && fields.includes(field)) {
      return res.status(409).json({ success: false, message: "That column already exists." });
    }
    if (action === "delete" && !fields.includes(field)) {
      return res.status(404).json({ success: false, message: "That column does not exist." });
    }

    const update = action === "add"
      ? await collection.updateMany({ [field]: { $exists: false } }, { $set: { [field]: "" } })
      : await collection.updateMany({ [field]: { $exists: true } }, { $unset: { [field]: "" } });
    res.json({
      success: true,
      action,
      field,
      modified: update.modifiedCount,
      total: await collection.countDocuments()
    });
  } catch (error) {
    console.error(`Error ${action}ing column ${field} in ${selected.name}:`, error.message);
    res.status(500).json({
      success: false,
      message: "Unable to update this collection column."
    });
  }
});

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