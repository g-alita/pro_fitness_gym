// Authentication and Navigation State Management

function updateNavbar() {
    const userLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
    const adminLoggedIn = localStorage.getItem('adminLoggedIn') === 'true';
    const staffLoggedIn = localStorage.getItem('staffLoggedIn') === 'true';
    
    // Find all nav-links containers
    const navLinks = document.querySelectorAll('.nav-links');
    
    navLinks.forEach(navLink => {
        // Find existing signin dropdown or profile/admin link
        const signinDropdown = navLink.querySelector('.signin-dropdown');
        const existingProfileLink = navLink.querySelector('#profileLink');
        const existingAdminLink = navLink.querySelector('#adminLink');
        const existingStaffLink = navLink.querySelector('#staffLink');
        
        // Remove existing elements
        if (signinDropdown) {
            signinDropdown.remove();
        }
        if (existingProfileLink) {
            existingProfileLink.remove();
        }
        if (existingAdminLink) {
            existingAdminLink.remove();
        }
        if (existingStaffLink) {
            existingStaffLink.remove();
        }
        
        // Add appropriate link based on login state
        if (userLoggedIn) {
            const profileLink = document.createElement('a');
            profileLink.href = 'profile.html';
            profileLink.id = 'profileLink';
            profileLink.innerHTML = '<i class="fas fa-user"></i> Profile';
            navLink.appendChild(profileLink);
        } else if (adminLoggedIn) {
            const adminLink = document.createElement('a');
            adminLink.href = 'admin.html';
            adminLink.id = 'adminLink';
            adminLink.innerHTML = '<i class="fas fa-user-shield"></i> Admin';
            navLink.appendChild(adminLink);
        } else if (staffLoggedIn) {
            const staffLink = document.createElement('a');
            staffLink.href = 'staff.html';
            staffLink.id = 'staffLink';
            staffLink.innerHTML = '<i class="fas fa-id-badge"></i> Staff';
            navLink.appendChild(staffLink);
        } else {
            // Add signin dropdown
            const signinDropdown = document.createElement('div');
            signinDropdown.className = 'signin-dropdown';
            signinDropdown.setAttribute('onclick', 'toggleSignInDropdown(event)');
            signinDropdown.innerHTML = `
                <a><i class="fas fa-sign-in-alt"></i> Sign In</a>
                <div class="signin-dropdown-content">
                    <a href="signin-user.html"><i class="fas fa-user"></i> Sign In as User</a>
                    <a href="signin-admin.html"><i class="fas fa-user-shield"></i> Sign In as Admin</a>
                    <a href="signin-staff.html"><i class="fas fa-id-badge"></i> Sign In as Staff</a>
                </div>
            `;
            navLink.appendChild(signinDropdown);
        }
    });
}

function toggleSignInDropdown(event) {
    event.stopPropagation();
    const dropdown = event.currentTarget;
    dropdown.classList.toggle('show');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdowns = document.querySelectorAll('.signin-dropdown');
    dropdowns.forEach(dropdown => {
        if (!dropdown.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    });
});

// Update navbar when page loads
document.addEventListener('DOMContentLoaded', function() {
    updateNavbar();
});

// Also update on storage changes (for multi-tab support)
window.addEventListener('storage', function(e) {
    if (e.key === 'userLoggedIn' || e.key === 'adminLoggedIn' || e.key === 'staffLoggedIn') {
        updateNavbar();
    }
});
