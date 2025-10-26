
// Smooth scroll when clicking nav links
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    // Only prevent default for same-page navigation
    if (href.startsWith('#')) {
      e.preventDefault();
      const targetId = href.substring(1);
      const target = document.getElementById(targetId);
      if (target) {
        window.scrollTo({
          top: target.offsetTop - 50,
          behavior: 'smooth'
        });
      }
    }
  });
});

  function toggleMenu() {
    document.querySelector(".nav-links").classList.toggle("show");
  }

  const form = document.getElementById('contact-form'); // assign form id
  form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phonenumber').value.trim();
  const gender = document.getElementById('gender').value.trim();
  const age = parseInt(document.getElementById('age').value.trim()) || null;
  const fitnessGoal = document.getElementById('goal').value;
  const statusMessage = document.getElementById('statusMessage');
  
  // Validate required fields
  if (!name || !phone || !fitnessGoal) {
    statusMessage.textContent = 'Please fill in all required fields!';
    statusMessage.style.color = 'red';
    return;
  }

  try {
    statusMessage.textContent = 'Sending...';
    statusMessage.style.color = '#333';
    
    const response = await fetch('http://localhost:3000/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, gender, age, fitnessGoal }),
    });

    const data = await response.json();

    if (response.ok) {
      statusMessage.textContent = data.message;
      statusMessage.style.color = 'green';
      form.reset();
    } else {
      statusMessage.textContent = data.error || 'Something went wrong!';
      statusMessage.style.color = 'red';
    }
  } catch (err) {
    statusMessage.textContent = 'Server connection failed! Please check if the server is running.';
    statusMessage.style.color = 'red';
    console.error(err);
  }
});

