import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

if (prefersReducedMotion) {
  gsap.set(".gsap-reveal, .gsap-timeline-line", {
    opacity: 1,
    y: 0,
    scale: 1,
    scaleY: 1,
    clearProps: "transform",
  });
} else {
  initAnimations();
}

function initAnimations() {
  // Hero — page load, not scroll
  const heroTl = gsap.timeline({ delay: 0.4 });
  heroTl
    .to("[data-hero-heading]", {
      opacity: 1,
      y: 0,
      duration: 1.2,
      ease: "power3.out",
    })
    .to(
      "[data-hero-subtitle]",
      { opacity: 1, y: 0, duration: 1.2, ease: "power3.out" },
      "-=0.7"
    )
    .to(
      "[data-hero-cta]",
      { opacity: 1, y: 0, duration: 1.2, ease: "power3.out" },
      "-=0.7"
    )
    .to(
      "[data-hero-video]",
      { opacity: 1, y: 0, duration: 1.2, ease: "power3.out" },
      "-=0.7"
    );

  // Generic section reveals — About, Projects, Contact
  ["#about", "#profile", "#projects", "#cta"].forEach((sectionId) => {
    const section = document.querySelector(sectionId);
    if (!section) return;
    const reveals = section.querySelectorAll("[data-reveal]");
    if (!reveals.length) return;
    gsap.to(reveals, {
      opacity: 1,
      y: 0,
      duration: 1.0,
      ease: "power3.out",
      stagger: 0.12,
      scrollTrigger: { trigger: section, start: "top 85%" },
    });
  });

  // Skills — heading + category labels
  gsap.to("#skills [data-reveal]", {
    opacity: 1,
    y: 0,
    duration: 1.0,
    ease: "power3.out",
    stagger: 0.12,
    scrollTrigger: { trigger: "#skills", start: "top 85%" },
  });

  // Skills — chips fast stagger
  gsap.to("[data-skill-chip]", {
    opacity: 1,
    y: 0,
    duration: 0.6,
    ease: "power3.out",
    stagger: 0.06,
    scrollTrigger: { trigger: "#skills", start: "top 85%" },
  });
}
