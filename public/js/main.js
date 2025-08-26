let sidebarToggle;
let darkModeToggle;

function applyDarkModeToElements(isDarkMode) {
    const preElements = document.querySelectorAll('pre');
    preElements.forEach(el => {
        if (isDarkMode) {
            el.classList.add('bg-dark', 'text-light');
        } else {
            el.classList.remove('bg-dark', 'text-light');
        }
    });
    
    const logEntries = document.querySelectorAll('.log-entry');
    logEntries.forEach(entry => {
        if (isDarkMode) {
            entry.classList.add('bg-dark', 'text-light');
        } else {
            entry.classList.remove('bg-dark', 'text-light');
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    sidebarToggle = document.getElementById('sidebarToggle');
    darkModeToggle = document.getElementById('darkModeToggle');

    // Toggle sidebar
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function () {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
                sidebar.classList.toggle('show');
            }
        });
    }

    // Toggle dark mode
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', function () {
            document.body.classList.toggle('dark-mode');
            
            // Save preference
            const isDarkMode = document.body.classList.contains('dark-mode');
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
            
            // Update icon
            const icon = this.querySelector('i');
            if (icon) {
                if (isDarkMode) {
                    icon.classList.remove('bi-moon');
                    icon.classList.add('bi-sun');
                } else {
                    icon.classList.remove('bi-sun');
                    icon.classList.add('bi-moon');
                }
            }
            
            // Aplicar clases adicionales para modo oscuro
            applyDarkModeToElements(isDarkMode);
            
            // Emitir evento personalizado para que otras partes de la app puedan reaccionar
            window.dispatchEvent(new CustomEvent('themeChanged', { detail: { darkMode: isDarkMode } }));
        });
    }

    // Apply saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const icon = document.getElementById('darkModeToggle')?.querySelector('i');
        if (icon) {
            icon.classList.remove('bi-moon');
            icon.classList.add('bi-sun');
            
            // Aplicar modo oscuro a elementos existentes
            applyDarkModeToElements(true);
        }
    }

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(e) {
        const sidebar = document.querySelector('.sidebar');
        if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('show')) {
            const sidebarToggle = document.getElementById('sidebarToggle');
            if (sidebarToggle && !sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                sidebar.classList.remove('show');
            }
        }
    });
});