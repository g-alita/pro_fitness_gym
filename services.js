function toggleDetails(card) {
  // Close all other cards
  document.querySelectorAll(".service-card").forEach(c => {
    if (c !== card) c.classList.remove("active");
  });
  
  // Toggle the clicked card
  card.classList.toggle("active");
}
