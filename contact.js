
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
  const email = document.getElementById('email').value.trim();
  const gender = document.getElementById('gender').value.trim();
  const age = parseInt(document.getElementById('age').value.trim()) || null;
  const fitnessGoal = document.getElementById('goal').value;
  try {
    const response = await fetch('http://localhost:5000/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email, gender, age, fitnessGoal }),
    });

    const data = await response.json();

    if (response.ok) {
      alert(data.message); // show popup
      form.reset();
    } else {
      alert(data.error || 'Something went wrong!');
    }
  } catch (err) {
    alert('Server connection failed!');
    console.error(err);
  }
});

