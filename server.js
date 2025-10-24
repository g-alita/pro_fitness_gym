const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

/* =========================================================
   1️⃣ MAIN DATABASE CONNECTION — pro_fitness_gym
   Stores: Users, Logins
========================================================= */
const mainDB = mongoose.createConnection(
  'mongodb+srv://preco870:123@cluster0.j0egfbv.mongodb.net/pro_fitness_gym?retryWrites=true&w=majority&appName=Cluster0',
  { useNewUrlParser: true, useUnifiedTopology: true }
);

mainDB.once('open', () => console.log('✅ Connected to pro_fitness_gym database'));

/* =========================================================
   2️⃣ CONTACT DATABASE CONNECTION — pro_fitness_contacts
   Stores: Contact Form Submissions
========================================================= */
const contactDB = mongoose.createConnection(
  'mongodb+srv://preco870:123@cluster0.j0egfbv.mongodb.net/pro_fitness_contacts?retryWrites=true&w=majority&appName=Cluster0',
  { useNewUrlParser: true, useUnifiedTopology: true }
);

contactDB.once('open', () => console.log('✅ Connected to pro_fitness_contacts database'));

/* =========================================================
   3️⃣ MODELS
========================================================= */

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  password: String,
  gender: String
});
const User = mainDB.model('User', userSchema);

// Login Schema
const loginSchema = new mongoose.Schema({
  email: String,
  password: String,
  createdAt: { type: Date, default: Date.now }
});
const Login = mainDB.model('Login', loginSchema, 'logins');

// Contact Schema (Stored in different DB)
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});
const Contact = contactDB.model('Contact', contactSchema);

/* =========================================================
   4️⃣ ROUTES
========================================================= */

// Registration endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { name, phone, email, password, gender } = req.body;
    const user = new User({ name, phone, email, password, gender });
    await user.save();
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Sign-in endpoint
app.post('/api/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const user = await Login.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Email not registered.' });
    if (user.password !== password)
      return res.status(400).json({ error: 'Incorrect password.' });

    res.json({ message: 'Sign in successful!' });
  } catch (err) {
    res.status(500).json({ error: 'Sign in failed' });
  }
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phonenumber, message } = req.body;
    const contact = new Contact({ name, email, phonenumber, message });
    await contact.save();
    res.status(201).json({ message: 'Contact info saved successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save contact info' });
  }
});

/* =========================================================
   5️⃣ START SERVER
========================================================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));