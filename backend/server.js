// ===== Import Dependencies =====
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const ProFitnessFAQ = require("../frontend/faq-data");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const { OAuth2Client } = require("google-auth-library");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const { getContactEmail, isResendConfigured, sendEmail } = require("./email");
const { sendEmailOtp, verifyEmailOtp } = require("./supabase-auth");
const { isWhatsAppConfigured, sendWhatsAppOtp } = require("./whatsapp");

// ===== App Setup =====
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const googleOAuthClient = new OAuth2Client();
const ADMIN_DATA_DATABASE_NAME = "profitnessgym";
const ADMIN_EMAIL_COLLECTION_NAME = "admin mail";
const USER_EMAIL_COLLECTION_NAME = "user mail";
const USER_PHONE_COLLECTION_NAME = "user number";
const USER_PHONE_AUTHENTICATOR_COLLECTION_NAME = "user_phone_authenticators";
const PHONE_LOGIN_OTP_COLLECTION_NAME = "phone_login_otps";
const PHONE_OTP_LIFETIME_MS = 10 * 60 * 1000;
const PHONE_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const PHONE_OTP_MAX_ATTEMPTS = 5;
const USER_EMAIL_OTP_COLLECTION_NAME = "user_email_login_otps";
const ADMIN_EMAIL_OTP_COLLECTION_NAME = "admin_email_login_otps";
const contactSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
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
const ADMIN_HIDDEN_COLLECTIONS = new Set([
  "admin_allowlist",
  "passwordcredentials",
  "passwordresettokens",
  USER_PHONE_AUTHENTICATOR_COLLECTION_NAME,
  PHONE_LOGIN_OTP_COLLECTION_NAME,
  "user_phone_enrollment_tokens",
  USER_EMAIL_OTP_COLLECTION_NAME,
  ADMIN_EMAIL_OTP_COLLECTION_NAME
]);
const ADMIN_DATASET_LABELS = {
  "members sheet 1": "Members Sheet 1",
  "members sheet 2": "Members Sheet 2",
  "members sheet 3": "Members Sheet 3",
  evening: "Evening",
  morning: "Morning"
};

async function getAdminDatasetCollections() {
  const collections = await getGymDatabase().listCollections({}, { nameOnly: true }).toArray();
  return collections
    .map(({ name }) => name)
    .filter((name) => !name.startsWith("system.") && !ADMIN_HIDDEN_COLLECTIONS.has(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      name,
      label: ADMIN_DATASET_LABELS[name] ||
        name.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    }));
}

async function getAdminDataset(name) {
  if (typeof name !== "string") return null;
  const collections = await getAdminDatasetCollections();
  return collections.find((collection) => collection.name === name) || null;
}

async function getAdminDatasetFields(collection, collectionName) {
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
  const fieldNames = fields.map(({ _id }) => _id).filter((field) => field !== "_id");
  if (collectionName === USER_EMAIL_COLLECTION_NAME && !fieldNames.includes("MAIL")) {
    fieldNames.push("MAIL");
  }
  return fieldNames;
}
const authSessionSecret = process.env.AUTH_SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const phoneOtpSecret = process.env.PHONE_OTP_SECRET || authSessionSecret;
if (!process.env.AUTH_SESSION_SECRET) {
  console.warn("AUTH_SESSION_SECRET is unset; active sign-in sessions will expire when the server restarts.");
}

function isValidIndianMobile(phone) {
  return typeof phone === "string" && /^\+91[6-9]\d{9}$/.test(phone);
}

function normalizeIndianMobile(phone) {
  if (typeof phone !== "string") return null;
  const trimmedPhone = phone.trim();
  const localNumber = /^\+91[6-9]\d{9}$/.test(trimmedPhone)
    ? trimmedPhone.slice(3)
    : /^[6-9]\d{9}$/.test(trimmedPhone)
      ? trimmedPhone
      : null;
  return localNumber ? `+91${localNumber}` : null;
}

function getGymDatabase() {
  return mongoose.connection.useDb(ADMIN_DATA_DATABASE_NAME, { useCache: true }).db;
}

async function isEmailInAllowlist(collectionName, email) {
  return Boolean(await getGymDatabase().collection(collectionName).findOne({
    MAIL: new RegExp(`^${escapeRegex(email)}$`, "i")
  }));
}

async function isUserPhoneAllowlisted(phone) {
  const normalizedPhone = normalizeIndianMobile(phone);
  if (!normalizedPhone) return false;
  const localNumber = normalizedPhone.slice(3);
  return Boolean(await getGymDatabase().collection(USER_PHONE_COLLECTION_NAME).findOne({
    Number: {
      $in: [
        Number(localNumber),
        localNumber,
        normalizedPhone,
        `91${localNumber}`
      ]
    }
  }));
}

async function isPhoneAllowlisted(role, phone) {
  if (role === "admin") {
    return Boolean(await AdminAllowlist.exists({
      phone,
      enabled: { $ne: false }
    }));
  }
  return isUserPhoneAllowlisted(phone);
}

function hashPhoneOtp(role, phone, code) {
  return crypto.createHmac("sha256", phoneOtpSecret)
    .update(`${role}:${phone}:${code}`)
    .digest("hex");
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
    const hasRolePhone = ["admin", "user"].includes(data.role) && isValidIndianMobile(data.phone);
    if ((!hasEmail && !hasRolePhone) || !["user", "admin"].includes(data.role) ||
        typeof data.expiresAt !== "number" || data.expiresAt <= Date.now()) {
      return null;
    }
    return { email: data.email || null, role: data.role, phone: data.phone || null };
  } catch {
    return null;
  }
}

function setAuthSession(req, res, email, role, phone) {
  const crossOriginFrontend = Boolean(process.env.FRONTEND_ORIGIN);
  res.cookie("pro_fitness_session", createAuthToken(email, role, phone), {
    httpOnly: true,
    secure: req.secure || process.env.NODE_ENV === "production" || crossOriginFrontend,
    sameSite: crossOriginFrontend ? "none" : "lax",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000
  });
}

async function isAccountAllowed(accountType, email) {
  if (accountType === "admin") {
    const [listedByEmail, allowlisted] = await Promise.all([
      isEmailInAllowlist(ADMIN_EMAIL_COLLECTION_NAME, email),
      AdminAllowlist.exists({ email, enabled: { $ne: false } })
    ]);
    return Boolean(listedByEmail || allowlisted);
  }

  return isEmailInAllowlist(USER_EMAIL_COLLECTION_NAME, email);
}

async function isAuthorizedAdminSession(session) {
  if (!session || session.role !== "admin") return false;
  if (session.email && await isEmailInAllowlist(
    ADMIN_EMAIL_COLLECTION_NAME,
    session.email.toLowerCase()
  )) {
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
      enabled: { $ne: false }
    }));
  }
  return false;
}

async function isAuthorizedUserSession(session) {
  if (!session || session.role !== "user") return false;
  if (session.email) {
    return isAccountAllowed("user", session.email.toLowerCase());
  }
  return Boolean(session.phone && await isUserPhoneAllowlisted(session.phone));
}

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

const phoneOtpRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many WhatsApp code requests. Please try again later." }
});

const phoneOtpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many WhatsApp code attempts. Please try again later." }
});

const userEmailOtpRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many email code requests. Please try again later." }
});

const userEmailOtpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many email code attempts. Please try again later." }
});

const adminEmailOtpRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many email code requests. Please try again later." }
});

const adminEmailOtpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many email code attempts. Please try again later." }
});

const googleLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many Google sign-in attempts. Please try again later." }
});

// ===== Middleware =====
const frontendOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || frontendOrigins.includes(origin)),
  credentials: true
}));
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
  if (isUserPage && !(await isAuthorizedUserSession(session))) {
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

// ===== Email and Password Authentication =====
app.post("/api/auth/logout", (req, res) => {
  const crossOriginFrontend = Boolean(process.env.FRONTEND_ORIGIN);
  res.clearCookie("pro_fitness_session", {
    httpOnly: true,
    secure: req.secure || process.env.NODE_ENV === "production" || crossOriginFrontend,
    sameSite: crossOriginFrontend ? "none" : "lax",
    path: "/"
  });
  res.json({ success: true });
});

function createEmailOtpRequestHandler(accountType) {
  return async (req, res) => {
    const { email } = req.body || {};
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Enter a valid email address." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    try {
      await connectToMongoDB();
      if (!await isAccountAllowed(accountType, normalizedEmail)) {
        return res.json({
          success: true,
          message: "If the email belongs to an authorized account, a sign-in code will be sent."
        });
      }

      await sendEmailOtp(normalizedEmail);

      res.json({
        success: true,
        message: "If the email belongs to an authorized account, a sign-in code will be sent."
      });
    } catch (error) {
      console.error(
        `${accountType} Supabase email sign-in request failed:`,
        error.status || error.code || error.message
      );
      res.status(error.status === 429 ? 429 : 503).json({
        success: false,
        message: error.status === 429
          ? "Too many sign-in code requests. Please try again later."
          : "Unable to send a sign-in code right now. Please try again later."
      });
    }
  };
}

function createEmailOtpVerifyHandler(accountType) {
  return async (req, res) => {
    const { email, code } = req.body || {};
    if (!isValidEmail(email) || typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address and six-digit sign-in code."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    try {
      await connectToMongoDB();
      if (!await isAccountAllowed(accountType, normalizedEmail)) {
        return res.status(401).json({
          success: false,
          message: "The email or sign-in code is incorrect or expired."
        });
      }

      const { user } = await verifyEmailOtp(normalizedEmail, code);
      const verifiedEmail = user?.email?.trim().toLowerCase();
      if (verifiedEmail !== normalizedEmail ||
          !await isAccountAllowed(accountType, normalizedEmail)) {
        return res.status(401).json({
          success: false,
          message: "The email or sign-in code is incorrect or expired."
        });
      }

      setAuthSession(req, res, normalizedEmail, accountType);
      res.json({ success: true, email: normalizedEmail });
    } catch (error) {
      const invalidCode = [400, 401, 403, 422].includes(error.status);
      console.error(
        `${accountType} Supabase email sign-in verification failed:`,
        error.status || error.code || error.message
      );
      res.status(invalidCode ? 401 : 503).json({
        success: false,
        message: invalidCode
          ? "The email or sign-in code is incorrect or expired."
          : "Unable to verify the sign-in code right now. Please try again later."
      });
    }
  };
}

app.post(
  "/api/auth/email/user/request-code",
  userEmailOtpRequestLimiter,
  createEmailOtpRequestHandler("user")
);
app.post(
  "/api/auth/email/user/verify-code",
  userEmailOtpVerifyLimiter,
  createEmailOtpVerifyHandler("user")
);
app.post(
  "/api/auth/email/admin/request-code",
  adminEmailOtpRequestLimiter,
  createEmailOtpRequestHandler("admin")
);
app.post(
  "/api/auth/email/admin/verify-code",
  adminEmailOtpVerifyLimiter,
  createEmailOtpVerifyHandler("admin")
);

async function getPhoneOtpCollection() {
  const collection = getGymDatabase().collection(PHONE_LOGIN_OTP_COLLECTION_NAME);
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return collection;
}

app.post("/api/auth/phone/:role/request-code", phoneOtpRequestLimiter, async (req, res) => {
  const { role } = req.params;
  const phone = normalizeIndianMobile(req.body && req.body.phone);
  if (!["user", "admin"].includes(role) || !phone) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid 10-digit Indian mobile number, with or without the +91 prefix."
    });
  }

  const genericResponse = {
    success: true,
    message: "If this number is on the allowlist, a sign-in code has been sent via WhatsApp."
  };
  try {
    if (!await isPhoneAllowlisted(role, phone)) {
      return res.json(genericResponse);
    }
    if (!isWhatsAppConfigured()) {
      return res.status(503).json({
        success: false,
        message: "WhatsApp sign-in is temporarily unavailable. Please try again later."
      });
    }

    const now = new Date();
    const otpCollection = await getPhoneOtpCollection();
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const codeHash = hashPhoneOtp(role, phone, code);
    try {
      await otpCollection.findOneAndUpdate(
        {
          _id: `${role}:${phone}`,
          createdAt: { $lte: new Date(now.getTime() - PHONE_OTP_RESEND_COOLDOWN_MS) }
        },
        {
          $set: {
            phone,
            role,
            codeHash,
            createdAt: now,
            expiresAt: new Date(now.getTime() + PHONE_OTP_LIFETIME_MS),
            attempts: 0
          }
        },
        { upsert: true, returnDocument: "after" }
      );
    } catch (error) {
      if (error.code === 11000) return res.json(genericResponse);
      throw error;
    }

    try {
      await sendWhatsAppOtp(phone, code);
    } catch (error) {
      console.error("WhatsApp OTP delivery failed:", {
        status: error.status,
        providerCode: error.providerCode,
        code: error.code
      });
      return res.status(502).json({
        success: false,
        message: "Unable to send a WhatsApp sign-in code right now. Please try again later."
      });
    }
    return res.json(genericResponse);
  } catch (error) {
    console.error("WhatsApp OTP request failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to request a WhatsApp sign-in code right now. Please try again later."
    });
  }
});

app.post("/api/auth/phone/:role/verify-code", phoneOtpVerifyLimiter, async (req, res) => {
  const { role } = req.params;
  const phone = normalizeIndianMobile(req.body && req.body.phone);
  const code = req.body && req.body.code;
  if (!["user", "admin"].includes(role) || !phone || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid phone number and six-digit WhatsApp code."
    });
  }

  try {
    const otpCollection = await getPhoneOtpCollection();
    const otpId = `${role}:${phone}`;
    const otp = await otpCollection.findOne({
      _id: otpId,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: PHONE_OTP_MAX_ATTEMPTS }
    });
    const candidateHash = hashPhoneOtp(role, phone, code);
    const storedHash = typeof otp?.codeHash === "string" && /^[a-f0-9]{64}$/.test(otp.codeHash)
      ? Buffer.from(otp.codeHash, "hex")
      : null;
    const candidateHashBytes = Buffer.from(candidateHash, "hex");
    const hashMatches = Boolean(storedHash) &&
      crypto.timingSafeEqual(storedHash, candidateHashBytes);
    if (!otp || !hashMatches) {
      await otpCollection.updateOne(
        { _id: otpId, expiresAt: { $gt: new Date() }, attempts: { $lt: PHONE_OTP_MAX_ATTEMPTS } },
        { $inc: { attempts: 1 } }
      );
      return res.status(401).json({
        success: false,
        message: "The phone number or WhatsApp code is incorrect or expired."
      });
    }

    const consumed = await otpCollection.deleteOne({
      _id: otpId,
      codeHash: candidateHash,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: PHONE_OTP_MAX_ATTEMPTS }
    });
    if (consumed.deletedCount !== 1 || !await isPhoneAllowlisted(role, phone)) {
      return res.status(401).json({
        success: false,
        message: "The phone number or WhatsApp code is incorrect or expired."
      });
    }

    setAuthSession(req, res, null, role, phone);
    return res.json({ success: true, phone });
  } catch (error) {
    console.error("WhatsApp OTP verification failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to verify the WhatsApp code right now. Please try again later."
    });
  }
});

app.post("/api/auth/password/login", (req, res) => {
  res.status(410).json({
    success: false,
    message: "Email/password sign-in is no longer available. Use an email code instead."
  });
});

app.post("/api/auth/password/request-reset", passwordResetRequestLimiter, async (req, res) => {
  const { email, accountType } = req.body || {};
  if (!isValidEmail(email) || accountType !== "admin") {
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
      accountType: "admin",
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

app.post("/api/auth/google/:role", googleLoginLimiter, async (req, res) => {
  const { credential } = req.body || {};
  const { role } = req.params;
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return res.status(503).json({
      success: false,
      message: "Google sign-in is not configured on the server."
    });
  }
  if (typeof credential !== "string" || !credential || credential.length > 8192 ||
      !["user", "admin"].includes(role)) {
    return res.status(400).json({
      success: false,
      message: "A valid Google sign-in credential is required."
    });
  }

  let email;
  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: credential,
      audience: clientId
    });
    const payload = ticket.getPayload();
    email = payload?.email?.trim().toLowerCase();
    if (!email || payload?.email_verified !== true) {
      return res.status(401).json({
        success: false,
        message: "Use a Google account with a verified email address."
      });
    }
  } catch (error) {
    console.error("Google ID token verification failed:", error.message);
    return res.status(401).json({
      success: false,
      message: "Google account could not be verified. Please try again."
    });
  }

  try {
    await connectToMongoDB();
    if (!await isAccountAllowed(role, email)) {
      return res.status(403).json({
        success: false,
        message: role === "admin"
          ? "This Google account is not authorized for admin access."
          : "This Google account is not authorized for user access."
      });
    }

    setAuthSession(req, res, email, role);
    res.json({ success: true, email });
  } catch (error) {
    console.error("Google account allowlist lookup failed:", error.message);
    res.status(503).json({
      success: false,
      message: "Unable to verify your allowlist access right now. Please try again."
    });
  }
});

// ===== MongoDB Connection =====
let mongoConnectionPromise;
mongoose.connection.on("disconnected", () => {
  mongoConnectionPromise = null;
});

async function connectToMongoDB() {
  if (mongoose.connection.readyState === 1) return;
  if (!mongoConnectionPromise) {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not configured.");
    }
    mongoConnectionPromise = mongoose.connect(process.env.MONGO_URI)
      .then(async () => {
        console.log("✅ Connected to MongoDB Atlas");
        try {
          await Enquiry.createCollection();
        } catch (error) {
          if (error.code !== 48) {
            console.error("Failed to create contact_query collection:", error.message);
          }
        }
      })
      .catch((error) => {
        mongoConnectionPromise = null;
        throw error;
      });
  }
  await mongoConnectionPromise;
}

// ===== Define Enquiry Schema & Model =====
const enquirySchema = new mongoose.Schema({
  recordType: { type: String, enum: ["contact", "faq"], default: "contact" },
  name: String,
  phone: String,
  gender: String,
  age: Number,
  fitnessGoal: String,
  message: String,
  membershipPlan: String,
  question: { type: String, maxlength: 250 },
  normalizedQuestion: { type: String, maxlength: 250 },
  answer: { type: String, maxlength: 2000 },
  date: { type: Date, default: Date.now },
});
enquirySchema.index(
  { recordType: 1, normalizedQuestion: 1 },
  {
    unique: true,
    partialFilterExpression: { recordType: "faq", normalizedQuestion: { $type: "string" } }
  }
);

const gymDatabaseConnection = mongoose.connection.useDb(ADMIN_DATA_DATABASE_NAME, { useCache: true });
const Enquiry = gymDatabaseConnection.model("Enquiry", enquirySchema, "contact_query");

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
app.use(express.static(FRONTEND_DIR));

// ===== Routes for Pages =====
app.get("/", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "gym.html")));
app.get("/gym", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "gym.html")));
app.get("/services", (req, res) =>
  res.sendFile(path.join(FRONTEND_DIR, "services.html"))
);
app.get("/gallery", (req, res) =>
  res.sendFile(path.join(FRONTEND_DIR, "gallery.html"))
);
app.get("/teams", (req, res) =>
  res.sendFile(path.join(FRONTEND_DIR, "teams.html"))
);
app.get("/contact", (req, res) =>
  res.sendFile(path.join(FRONTEND_DIR, "contact.html"))
);
app.get("/faq", (req, res) =>
  res.sendFile(path.join(FRONTEND_DIR, "faq.html"))
);
app.get("/admin", (req, res) =>
  res.sendFile(path.join(FRONTEND_DIR, "admin.html"))
);
app.get("/profile", (req, res) =>
  res.sendFile(path.join(FRONTEND_DIR, "profile.html"))
);
app.get("/signin-user", (req, res) =>
  res.sendFile(path.join(FRONTEND_DIR, "signin-user.html"))
);
app.get("/signin-admin", (req, res) =>
  res.sendFile(path.join(FRONTEND_DIR, "signin-admin.html"))
);

// ===== API Endpoint for Contact Form =====
app.post("/api/contact", contactSubmissionLimiter, async (req, res) => {
  const { name, phone, gender = "", age = null, fitnessGoal, message = "", membershipPlan = "" } = req.body || {};
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120 ||
      typeof phone !== "string" || !phone.trim() || phone.trim().length > 40 ||
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
      message: "Unable to submit your enquiry right now. Please try again later."
    });
  }

  const contactEmail = getContactEmail();
  if (!isResendConfigured() || !contactEmail) {
    return res.status(503).json({
      success: false,
      saved: true,
      message: "Your enquiry was saved, but Resend email is not configured. Please call the gym to confirm."
    });
  }

  try {
    await sendEmail({
      to: contactEmail,
      subject: `New gym enquiry from ${enquiry.name}`,
      text: [
        "A new contact form submission was received.",
        "",
        `Name: ${enquiry.name}`,
        `Phone: ${enquiry.phone}`,
        `Gender: ${enquiry.gender || "Not provided"}`,
        `Age: ${enquiry.age ?? "Not provided"}`,
        `Fitness goal: ${enquiry.fitnessGoal}`,
        ...(enquiry.membershipPlan ? [`Selected membership plan: ${enquiry.membershipPlan}`] : []),
        `Message: ${enquiry.message || "Not provided"}`
      ].join("\n")
    });

    res.json({
      success: true,
      message: "Thank you! Your enquiry was sent successfully. We'll contact you soon."
    });
  } catch (error) {
    console.error("Contact form email delivery failed:", error.message);
    res.status(502).json({
      success: false,
      saved: true,
      message: "Your enquiry was saved, but the email could not be sent. Please call the gym to confirm."
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

  if (Enquiry.db.readyState !== 1) {
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

    res.json({
      success: true,
      answer: savedQuestion.answer || null,
      source: savedQuestion.answer ? (faqEntry ? "faq" : "database") : "none"
    });
  } catch (error) {
    console.error("FAQ search failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to search FAQs right now. Please try again later."
    });
  }
});

// ===== API Endpoints for User Management =====

app.get("/api/admin/datasets", async (req, res) => {
  try {
    const database = mongoose.connection.useDb(ADMIN_DATA_DATABASE_NAME, { useCache: true });
    const datasets = await getAdminDatasetCollections();
    const collections = await Promise.all(datasets.map(async ({ name, label }) => {
      const collection = database.collection(name);
      const [count, fields] = await Promise.all([
        collection.countDocuments(),
        getAdminDatasetFields(collection, name)
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
  let selected;
  try {
    selected = await getAdminDataset(req.params.collection);
  } catch (error) {
    console.error("Error verifying admin dataset:", error.message);
    return res.status(500).json({ success: false, message: "Unable to verify this dataset." });
  }
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
    const fields = await getAdminDatasetFields(collection, selected.name);
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
  let selected;
  try {
    selected = await getAdminDataset(req.params.collection);
  } catch (error) {
    console.error("Error verifying admin dataset:", error.message);
    return res.status(500).json({ success: false, message: "Unable to verify this dataset." });
  }
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
  let selected;
  try {
    selected = await getAdminDataset(req.params.collection);
  } catch (error) {
    console.error("Error verifying admin dataset:", error.message);
    return res.status(500).json({ success: false, message: "Unable to verify this dataset." });
  }
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
    const fields = await getAdminDatasetFields(collection, selected.name);
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
  let selected;
  try {
    selected = await getAdminDataset(req.params.collection);
  } catch (error) {
    console.error("Error verifying admin dataset:", error.message);
    return res.status(500).json({ success: false, message: "Unable to verify this dataset." });
  }
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
  let selected;
  try {
    selected = await getAdminDataset(req.params.collection);
  } catch (error) {
    console.error("Error verifying admin dataset:", error.message);
    return res.status(500).json({ success: false, message: "Unable to verify this dataset." });
  }
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
    const fields = await getAdminDatasetFields(collection, selected.name);
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
if (require.main === module) {
  connectToMongoDB().catch((error) => {
    console.error("❌ MongoDB Connection Error:", error.message);
  });
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

module.exports = { app, connectToMongoDB };