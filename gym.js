// gym.js

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

// Testimonial Slider
let testimonials = document.querySelectorAll('.testimonial');
let currentTestimonial = 0;

function showTestimonial(index) {
  testimonials.forEach((testimonial, i) => {
    testimonial.classList.toggle('active', i === index);
  });
}

function nextTestimonial() {
  currentTestimonial = (currentTestimonial + 1) % testimonials.length;
  showTestimonial(currentTestimonial);
}

// Auto-slide every 4 seconds
setInterval(nextTestimonial, 4000);

// Join button alert
const joinButton = document.querySelector('button');
if (joinButton) {
  joinButton.addEventListener('click', () => {
    alert('Thank you for your interest! Our team will contact you soon.');
  });
}



// Pause testimonial slider on hover
const slider = document.querySelector('.testimonial-slider');
let interval = setInterval(nextTestimonial, 4000);

if (slider) {
  slider.addEventListener('mouseenter', () => clearInterval(interval));
  slider.addEventListener('mouseleave', () => {
    interval = setInterval(nextTestimonial, 4000);
  });
}
