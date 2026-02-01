/**
 * Loopwork Docs - Documentation-specific JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  initCopyButtons();
  initSmoothScroll();
  initTableOfContents();
});

/**
 * Copy to Clipboard functionality
 */
function initCopyButtons() {
  const copyButtons = document.querySelectorAll('.copy-btn');
  
  copyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-clipboard');
      const codeElement = document.getElementById(targetId);
      
      if (codeElement) {
        const codeText = codeElement.textContent;
        
        navigator.clipboard.writeText(codeText).then(() => {
          // Show success state
          const originalIcon = btn.innerHTML;
          btn.innerHTML = '<i class="fas fa-check"></i>';
          btn.style.color = 'var(--neon-green)';
          
          setTimeout(() => {
            btn.innerHTML = originalIcon;
            btn.style.color = '';
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy:', err);
        });
      }
    });
  });
}

/**
 * Smooth scroll for anchor links within docs
 */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetElement = document.querySelector(targetId);
      
      if (targetElement) {
        const offsetTop = targetElement.offsetTop - 100;
        window.scrollTo({
          top: offsetTop,
          behavior: 'smooth'
        });
        
        // Update URL without jumping
        history.pushState(null, null, targetId);
      }
    });
  });
}

/**
 * Auto-generate Table of Contents
 */
function initTableOfContents() {
  const contentBody = document.querySelector('.content-body');
  const tocContainer = document.querySelector('.table-of-contents ul');
  
  if (!contentBody || !tocContainer) return;
  
  const headings = contentBody.querySelectorAll('h2[id], h3[id]');
  
  headings.forEach(heading => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + heading.id;
    a.textContent = heading.textContent.replace(/^\d+\s*/, '').trim();
    
    if (heading.tagName === 'H3') {
      li.style.paddingLeft = '1rem';
    }
    
    li.appendChild(a);
    tocContainer.appendChild(li);
  });
}

/**
 * Mobile sidebar toggle
 */
const sidebarToggle = document.createElement('button');
sidebarToggle.className = 'sidebar-toggle';
sidebarToggle.innerHTML = '<i class="fas fa-bars"></i>';
sidebarToggle.style.cssText = `
  display: none;
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 50px;
  height: 50px;
  background: var(--neon-cyan);
  border: none;
  border-radius: 50%;
  color: var(--bg-primary);
  font-size: 1.25rem;
  cursor: pointer;
  z-index: 100;
  box-shadow: 0 0 20px rgba(0, 243, 255, 0.5);
`;

document.body.appendChild(sidebarToggle);

const sidebar = document.querySelector('.docs-sidebar');

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('active');
});

// Close sidebar when clicking outside
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 1024) {
    if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
      sidebar.classList.remove('active');
    }
  }
});

// Show/hide toggle button based on screen size
function updateSidebarToggle() {
  if (window.innerWidth <= 1024) {
    sidebarToggle.style.display = 'flex';
    sidebarToggle.style.alignItems = 'center';
    sidebarToggle.style.justifyContent = 'center';
  } else {
    sidebarToggle.style.display = 'none';
    sidebar.classList.remove('active');
  }
}

window.addEventListener('resize', updateSidebarToggle);
updateSidebarToggle();

/**
 * Highlight active section in sidebar on scroll
 */
function highlightActiveSection() {
  const sections = document.querySelectorAll('.content-body h2[id], .content-body h3[id]');
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  
  let current = '';
  
  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    if (pageYOffset >= sectionTop - 150) {
      current = section.getAttribute('id');
    }
  });
  
  sidebarLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === '#' + current) {
      link.classList.add('active');
    }
  });
}

window.addEventListener('scroll', highlightActiveSection);
