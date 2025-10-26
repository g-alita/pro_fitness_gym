const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(__dirname));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'gym.html'));
});

app.get('/gym', (req, res) => {
  res.sendFile(path.join(__dirname, 'gym.html'));
});

app.get('/services', (req, res) => {
  res.sendFile(path.join(__dirname, 'services.html'));
});

app.get('/gallery', (req, res) => {
  res.sendFile(path.join(__dirname, 'gallery.html'));
});

app.get('/teams', (req, res) => {
  res.sendFile(path.join(__dirname, 'teams.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'contact.html'));
});

// API endpoint for handling contact form submissions
app.post('/api/contact', (req, res) => {
  const { name, phone, gender, age, fitnessGoal } = req.body;
  
  // Here you would typically save to database or send email
  // For now, just return success
  console.log('Contact form submission:', { 
    name, 
    phone, 
    gender, 
    age, 
    fitnessGoal 
  });
  
  res.json({ 
    success: true, 
    message: 'Thank you for your message! We will contact you soon.' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});