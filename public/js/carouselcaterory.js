document.addEventListener("DOMContentLoaded", function () {
    const wrapper = document.querySelector(".category-wrapper");
    const prevBtn = document.querySelector(".prev-btn");
    const nextBtn = document.querySelector(".next-btn");
    const dotsContainer = document.querySelector(".category-dots");
    const items = document.querySelectorAll(".category-item");
    let itemWidth = 220; // width + gap
    let itemsPerView = Math.floor(wrapper.offsetWidth / itemWidth);
    let currentPosition = 0;
    let autoSlideInterval;

    function updateItemsPerView() {
        itemsPerView = Math.floor(wrapper.offsetWidth / itemWidth);
        createDots();
        scrollToPosition(0);
    }

    // Create Dots
    function createDots() {
        dotsContainer.innerHTML = ""; // Clear existing dots
        const dotCount = Math.ceil(items.length / itemsPerView);
        for (let i = 0; i < dotCount; i++) {
            const dot = document.createElement("div");
            dot.classList.add("dot");
            if (i === 0) dot.classList.add("active");
            dot.addEventListener("click", () => scrollToPosition(i));
            dotsContainer.appendChild(dot);
        }
    }

    function updateDots() {
        const dots = document.querySelectorAll(".dot");
        dots.forEach((dot, index) => {
            dot.classList.toggle("active", index === currentPosition);
        });
    }

    function scrollToPosition(position) {
        currentPosition = position;
        const offset = -position * (itemsPerView * itemWidth);
        wrapper.style.transition = "transform 0.5s ease-in-out";
        wrapper.style.transform = `translateX(${offset}px)`;
        updateDots();
    }

    function nextSlide() {
        if (currentPosition < Math.ceil(items.length / itemsPerView) - 1) {
            scrollToPosition(currentPosition + 1);
        } else {
            scrollToPosition(0);
        }
    }

    function prevSlide() {
        if (currentPosition > 0) {
            scrollToPosition(currentPosition - 1);
        } else {
            scrollToPosition(Math.ceil(items.length / itemsPerView) - 1);
        }
    }

    // Auto-Slide Function
    function startAutoSlide() {
        autoSlideInterval = setInterval(nextSlide, 3000);
    }

    function stopAutoSlide() {
        clearInterval(autoSlideInterval);
    }

    // Attach Event Listeners
    prevBtn.addEventListener("click", prevSlide);
    nextBtn.addEventListener("click", nextSlide);
    wrapper.addEventListener("mouseenter", stopAutoSlide);
    wrapper.addEventListener("mouseleave", startAutoSlide);
    window.addEventListener("resize", updateItemsPerView);

    // Initialize the carousel
    updateItemsPerView();
    startAutoSlide();
});
