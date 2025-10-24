const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Enable CORS for any frontend origin
app.use(cors());
app.use(express.json());

// Connect to MongoDB (replace with your credentials)
const contactDB = mongoose.createConnection(
  'mongodb+srv://preco870:123@cluster0.j0egfbv.mongodb.net/pro_fitness_contacts?retryWrites=true&w=majority&appName=Cluster0',
  { useNewUrlParser: true, useUnifiedTopology: true }
);

contactDB.once('open', () => console.log('✅ Connected to pro_fitness_contacts database'));

// Contact Schema
const contactSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  gender: String,
  age: Number,
  fitnessGoal: String,
  createdAt: { type: Date, default: Date.now }
});

const Contact = contactDB.model('Contact', contactSchema);

// Endpoint to save contact info
app.post('/api/contact', async (req, res) => {
  try {
    const { name, phone, email, gender, age, fitnessGoal } = req.body;

    if (!name || !phone || !email || !fitnessGoal) {
      return res.status(400).json({ error: 'Please fill all required fields.' });
    }

    const contact = new Contact({ name, phone, email, gender, age, fitnessGoal });
    await contact.save();

    res.status(201).json({ message: 'Your enquiry has been submitted. Our team will contact you soon.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit enquiry' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
