/**
 * Loopwork Website - Main JavaScript
 * Cyberpunk theme interactions
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initCodeTabs();
  initScrollAnimations();
  initGlitchEffect();
});

/**
 * Mobile Navigation Toggle
 */
function initNavigation() {
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-menu');
  
  if (!navToggle || !navMenu) return;
  
  navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('active');
    navMenu.classList.toggle('active');
  });
  
  // Close menu when clicking on a link
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navToggle.classList.remove('active');
      navMenu.classList.remove('active');
    });
  });
  
  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
      navToggle.classList.remove('active');
      navMenu.classList.remove('active');
    }
  });
}

/**
 * Code Tabs in Quick Start Section
 */
function initCodeTabs() {
  const codeTabs = document.querySelectorAll('.code-tab');
  const codePanels = document.querySelectorAll('.code-panel');
  
  codeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      
      // Remove active class from all tabs and panels
      codeTabs.forEach(t => t.classList.remove('active'));
      codePanels.forEach(p => p.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding panel
      tab.classList.add('active');
      const targetPanel = document.getElementById(targetTab);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });
}

/**
 * Scroll Animations using Intersection Observer
 */
function initScrollAnimations() {
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  // Observe feature cards
  const featureCards = document.querySelectorAll('.feature-card');
  featureCards.forEach((card, index) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    card.style.transition = `opacity 0.5s ease ${index * 0.1}s, transform 0.5s ease ${index * 0.1}s`;
    observer.observe(card);
  });
  
  // Observe doc cards
  const docCards = document.querySelectorAll('.doc-card');
  docCards.forEach((card, index) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    card.style.transition = `opacity 0.5s ease ${index * 0.1}s, transform 0.5s ease ${index * 0.1}s`;
    observer.observe(card);
  });
  
  // Observe arch boxes
  const archBoxes = document.querySelectorAll('.arch-box');
  archBoxes.forEach((box, index) => {
    box.style.opacity = '0';
    box.style.transform = 'scale(0.9)';
    box.style.transition = `opacity 0.5s ease ${index * 0.15}s, transform 0.5s ease ${index * 0.15}s`;
    observer.observe(box);
  });
}

// Add CSS class for animation
const style = document.createElement('style');
style.textContent = `
  .animate-in {
    opacity: 1 !important;
    transform: translateY(0) scale(1) !important;
  }
`;
document.head.appendChild(style);

/**
 * Random Glitch Effect on Hover
 */
function initGlitchEffect() {
  const glitchElements = document.querySelectorAll('.glitch');
  
  glitchElements.forEach(el => {
    el.addEventListener('mouseenter', () => {
      el.style.animation = 'none';
      el.offsetHeight; // Trigger reflow
      el.style.animation = '';
    });
  });
}

/**
 * Smooth Scroll for Anchor Links
 */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      const offsetTop = target.offsetTop - 80; // Account for fixed nav
      window.scrollTo({
        top: offsetTop,
        behavior: 'smooth'
      });
    }
  });
});

/**
 * Navbar Background on Scroll
 */
let lastScroll = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;
  
  if (currentScroll > 100) {
    navbar.style.background = 'rgba(10, 10, 15, 0.98)';
    navbar.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.5)';
  } else {
    navbar.style.background = 'rgba(10, 10, 15, 0.9)';
    navbar.style.boxShadow = 'none';
  }
  
  lastScroll = currentScroll;
});

/**
 * Matrix Rain Effect (Optional - can be enabled)
 * Uncomment the following to enable matrix rain on the hero section
 */
/*
function createMatrixRain() {
  const canvas = document.createElement('canvas');
  canvas.id = 'matrix-rain';
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '-1';
  canvas.style.opacity = '0.1';
  
  const hero = document.querySelector('.hero');
  if (hero) {
    hero.style.position = 'relative';
    hero.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    canvas.width = hero.offsetWidth;
    canvas.height = hero.offsetHeight;
    
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    const fontSize = 14;
    const columns = canvas.width / fontSize;
    const drops = [];
    
    for (let i = 0; i < columns; i++) {
      drops[i] = 1;
    }
    
    function draw() {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = '#00f3ff';
      ctx.font = fontSize + 'px monospace';
      
      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }
    
    setInterval(draw, 35);
  }
}
// createMatrixRain();
*/

/**
 * Typewriter Effect for Terminal (Optional enhancement)
 */
function typewriterEffect() {
  const terminalLines = document.querySelectorAll('.terminal-line.output');
  
  terminalLines.forEach((line, index) => {
    const text = line.textContent;
    line.textContent = '';
    line.style.opacity = '1';
    
    let charIndex = 0;
    setTimeout(() => {
      const interval = setInterval(() => {
        if (charIndex < text.length) {
          line.textContent += text[charIndex];
          charIndex++;
        } else {
          clearInterval(interval);
        }
      }, 10);
    }, index * 500);
  });
}

// Uncomment to enable typewriter effect
// setTimeout(typewriterEffect, 1000);

/**
 * Console Easter Egg
 */
console.log('%c🔁 LOOPWORK', 'font-size: 24px; font-weight: bold; color: #00f3ff; text-shadow: 0 0 10px #00f3ff;');
console.log('%cAI Task Automation Framework', 'font-size: 14px; color: #a0a0b0;');
console.log('%chttps://github.com/nadimtuhin/loopwork', 'font-size: 12px; color: #ff00ff;');
