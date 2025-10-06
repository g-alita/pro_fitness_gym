document.addEventListener("DOMContentLoaded", () => {
  const filterButtons = document.querySelectorAll(".gallery-filters button");
  const galleryItems = document.querySelectorAll(".gallery-masonry a");

  filterButtons.forEach(button => {
    button.addEventListener("click", () => {
      // Update active button
      filterButtons.forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      const filter = button.getAttribute("data-filter");

      galleryItems.forEach(item => {
        const category = item.getAttribute("data-category");

        if (filter === "all" || category === filter) {
          item.style.display = "inline-block";   // show item
          setTimeout(() => {
            item.style.opacity = "1";            // fade in
          }, 50);
        } else {
          item.style.opacity = "0";              // fade out
          setTimeout(() => {
            item.style.display = "none";         // hide after fade
          }, 300);
        }
      });
    });
  });
});