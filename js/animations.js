// Intersection Observer for scroll animations
const animateOnScroll = () => {
    const elements = document.querySelectorAll('.service-card, .project-card, .blog-card, .about-image img');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1
    });
    
    elements.forEach(element => {
        observer.observe(element);
    });
};

// Initialize animations when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    animateOnScroll();
    
    // Add any additional animation initializations here
});

// Add CSS for the animate class
const style = document.createElement('style');
style.textContent = `
    .service-card, .project-card, .blog-card {
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 0.6s ease-out, transform 0.6s ease-out;
    }
    
    .about-image img {
        opacity: 0;
        transform: scale(0.95);
        transition: opacity 0.6s ease-out, transform 0.6s ease-out;
    }
    
    .animate {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
`;
document.head.appendChild(style);
