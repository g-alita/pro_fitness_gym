// ===== Slideshow functionality =====
const slideshows = {
  machines: [
    "photos/machines1.jpg",
    "photos/machines2.jpg",
    "photos/machines3.jpg"
  ],
  training: [
    "photos/training1.jpg",
    "photos/training2.jpg"
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
    }, 250);
  }, interval);
}

// Initialize all slideshows
for (const [id, images] of Object.entries(slideshows)) {
  startSlideshow(id, images);
}

// ===== Testimonial Slider =====
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
setInterval(nextTestimonial, 3000);

// Pause testimonial slider on hover
const slider = document.querySelector('.testimonial-slider');
let interval = setInterval(nextTestimonial, 4000);

if (slider) {
  slider.addEventListener('mouseenter', () => clearInterval(interval));
  slider.addEventListener('mouseleave', () => {
    interval = setInterval(nextTestimonial, 4000);
  });
}
// Toggle mobile menu
function toggleMenu() {
  document.querySelector(".nav-links").classList.toggle("show");
}

// Smooth scroll for same-page links
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
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

// Shrink navbar when scrolling
window.addEventListener("scroll", () => {
  const navbar = document.querySelector("nav");
  if (window.scrollY > 50) {
    navbar.classList.add("scrolled");
  } else {
    navbar.classList.remove("scrolled");
  }
});