
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
  const age = parseInt(document.getElementById('age').value.trim(), 10) || null;
  const fitnessGoal = document.getElementById('goal').value;
  const message = document.getElementById('message').value.trim();
  const membershipPlan = selectedMembershipPlan;
  const statusMessage = document.getElementById('statusMessage');
  const submitButton = form.querySelector('button[type="submit"]');
  
  // Validate required fields
  if (!name || !phone || !fitnessGoal) {
    statusMessage.textContent = 'Please fill in all required fields!';
    statusMessage.style.color = 'red';
    return;
  }

  try {
    statusMessage.textContent = 'Sending...';
    statusMessage.style.color = '#333';
    submitButton.disabled = true;
    
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, gender, age, fitnessGoal, message, membershipPlan }),
    });

    const data = await response.json();

    if (response.ok) {
      statusMessage.textContent = data.message;
      statusMessage.style.color = 'green';
      form.reset();
    } else {
      statusMessage.textContent = data.message || data.error || 'Something went wrong!';
      statusMessage.style.color = 'red';
    }
  } catch (err) {
    statusMessage.textContent = 'Server connection failed! Please check if the server is running.';
    statusMessage.style.color = 'red';
    console.error(err);
  } finally {
    submitButton.disabled = false;
  }
});

const membershipPlans = {
  daily: 'Daily Pass - ₹100',
  monthly: 'Monthly - ₹2000',
  'three-months': '3 Months - ₹4000',
  'six-months': '6 Months - ₹7000',
  annual: 'Annual - ₹10000'
};
const requestedPlan = new URLSearchParams(window.location.search).get('plan');
const selectedMembershipPlan = membershipPlans[requestedPlan] || '';
if (selectedMembershipPlan) {
  document.getElementById('selected-plan-value').textContent = selectedMembershipPlan;
  document.getElementById('selected-plan-row').hidden = false;
}
