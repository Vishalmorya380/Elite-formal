document.addEventListener('DOMContentLoaded', () => {
    const carousels = document.querySelectorAll('.promo-carousel');
    carousels.forEach(carousel => {
      const track = carousel.querySelector('.carousel-track');
      const slides = Array.from(track.children);
      const prevButton = carousel.querySelector('.carousel-prev');
      const nextButton = carousel.querySelector('.carousel-next');
      const indicators = carousel.querySelectorAll('.indicator');
      let currentIndex = 0;
  
      const updateCarousel = () => {
        const offset = -currentIndex * 100;
        track.style.transform = `translateX(${offset}%)`;
        indicators.forEach((indicator, i) => {
          indicator.classList.toggle('active', i === currentIndex);
        });
      };
  
      prevButton.addEventListener('click', () => {
        currentIndex = (currentIndex - 1 + slides.length) % slides.length;
        updateCarousel();
      });
  
      nextButton.addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % slides.length;
        updateCarousel();
      });
  
      indicators.forEach((indicator, i) => {
        indicator.addEventListener('click', () => {
          currentIndex = i;
          updateCarousel();
        });
      });
  
      // Auto-slide every 5 seconds
      setInterval(() => {
        currentIndex = (currentIndex + 1) % slides.length;
        updateCarousel();
      }, 5000);
    });
  });