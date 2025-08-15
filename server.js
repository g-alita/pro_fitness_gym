const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Replace with your MongoDB Atlas connection string
const mongoURI = 'mongodb+srv://preco870:123@cluster0.j0egfbv.mongodb.net/pro_fitness_gym?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  password: String,
  gender: String
});

const User = mongoose.model('User', userSchema);

// Registration endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { name, phone, email, password, gender } = req.body;
    // You should add validation and password hashing here in production!
    const user = new User({ name, phone, email, password, gender });
    await user.save();
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

const loginSchema = new mongoose.Schema({
  email: String,
  password: String, // In production, hash passwords!
  createdAt: { type: Date, default: Date.now }
});
const Login = mongoose.model('Login', loginSchema, 'logins');

app.post('/api/signin', async (req, res) => {
  const { email, password } = req.body;
  // Validate email format and password length
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  // Check if user exists
  const user = await Login.findOne({ email });
  if (!user) {
    return res.status(400).json({ error: 'Email not registered.' });
  }
  // Check password (in production, use bcrypt)
  if (user.password !== password) {
    return res.status(400).json({ error: 'Incorrect password.' });
  }
  res.json({ message: 'Sign in successful!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));