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


// Slideshow functionality
const slideshows = {
  machines: [
    "photos/machines1.jpg",
    "photos/machines2.jpg",
    "photos/machines3.jpg"
  ],
  training: [
    "photos/training1.jpg",
    "photos/training2.jpg",
    "photos/training3.jpg"
  ],
  clean: [
    "photos/clean1.jpg",
    "photos/clean2.jpg",
    "photos/clean3.jpg"
  ]
};

function startSlideshow(id, images, interval = 4000) {
  const container = document.getElementById(id);
  const img = container.querySelector("img");
  let index = 0;

  setInterval(() => {
    index = (index + 1) % images.length;
    img.style.opacity = 0; // fade out
    setTimeout(() => {
      img.src = images[index];
      img.style.opacity = 1; // fade in
    }, 1000);
  }, interval);
}

// Initialize all slideshows
for (const [id, images] of Object.entries(slideshows)) {
  startSlideshow(id, images);
}


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
function toggleMenu() {
    document.querySelector('.nav-links').classList.toggle('show');
}
