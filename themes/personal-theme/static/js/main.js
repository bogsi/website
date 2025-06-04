// Update the dark mode toggle functions
function enableDarkMode() {
    document.body.classList.add('dark-mode');
    darkModeStyle.removeAttribute('disabled');
    localStorage.setItem('darkMode', 'enabled');  // Fixed typo here ('enabled' not 'enabled')
    darkModeToggle.innerHTML = '<i class="fas fa-sun"></i>';
}

function disableDarkMode() {
    document.body.classList.remove('dark-mode');
    darkModeStyle.setAttribute('disabled', 'true');
    localStorage.setItem('darkMode', 'disabled');
    darkModeToggle.innerHTML = '<i class="fas fa-moon"></i>';
}


// Add this to main.js for mobile dropdown functionality
document.addEventListener('DOMContentLoaded', () => {
    // Mobile dropdown toggle
    const dropdownButtons = document.querySelectorAll('.dropdown-button');
    
    dropdownButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                e.preventDefault();
                const dropdown = button.parentElement;
                const content = dropdown.querySelector('.dropdown-content');
                
                // Close all other dropdowns first
                document.querySelectorAll('.dropdown-content').forEach(dc => {
                    if (dc !== content) dc.style.display = 'none';
                });
                
                // Toggle current dropdown
                content.style.display = content.style.display === 'block' ? 'none' : 'block';
            }
        });
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.matches('.dropdown-button') && !e.target.closest('.dropdown-content')) {
            document.querySelectorAll('.dropdown-content').forEach(dropdown => {
                dropdown.style.display = 'none';
            });
        }
    });
});


// Initialize dark mode on page load
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('darkMode') === 'enabled') {
        enableDarkMode();
    }
});
