// ===== Import Dependencies =====
require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const { OAuth2Client } = require("google-auth-library");

// ===== App Setup =====
const app = express();
const PORT = process.env.PORT || 3000;
const googleOAuthClient = new OAuth2Client();

function getGoogleAdminEmails() {
  return (process.env.GOOGLE_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ===== Middleware =====
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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