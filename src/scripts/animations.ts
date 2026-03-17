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
  const heroTl = gsap.timeline({ delay: 0.2 });
  heroTl
    .to("[data-hero-heading]", {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: "power2.out",
    })
    .to(
      "[data-hero-subtitle]",
      { opacity: 1, y: 0, duration: 1, ease: "power2.out" },
      "-=0.8"
    )
    .to(
      "[data-hero-cta]",
      { opacity: 1, y: 0, duration: 1, ease: "power2.out" },
      "-=0.8"
    );

  // Generic section reveals — About, Projects, Contact
  ["#about", "#projects", "#contact"].forEach((sectionId) => {
    const section = document.querySelector(sectionId);
    if (!section) return;
    const reveals = section.querySelectorAll("[data-reveal]");
    if (!reveals.length) return;
    gsap.to(reveals, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: "power2.out",
      stagger: 0.1,
      scrollTrigger: { trigger: section, start: "top 85%" },
    });
  });

  // Experience — heading
  gsap.to("#experience [data-reveal]", {
    opacity: 1,
    y: 0,
    duration: 0.8,
    ease: "power2.out",
    scrollTrigger: { trigger: "#experience", start: "top 85%" },
  });

  // Experience — timeline line scaleY scrub
  gsap.to("[data-timeline-line]", {
    scaleY: 1,
    ease: "none",
    scrollTrigger: {
      trigger: "#experience",
      start: "top 85%",
      end: "bottom 50%",
      scrub: true,
    },
  });

  // Experience — entries stagger
  gsap.to("[data-timeline-entry]", {
    opacity: 1,
    y: 0,
    duration: 0.8,
    ease: "power2.out",
    stagger: 0.1,
    scrollTrigger: { trigger: "#experience", start: "top 85%" },
  });

  // Experience — dots pop in
  gsap.to("[data-timeline-dot]", {
    opacity: 1,
    scale: 1,
    duration: 0.4,
    ease: "back.out(2)",
    stagger: 0.1,
    scrollTrigger: { trigger: "#experience", start: "top 85%" },
  });

  // Skills — heading + category labels
  gsap.to("#skills [data-reveal]", {
    opacity: 1,
    y: 0,
    duration: 0.8,
    ease: "power2.out",
    stagger: 0.1,
    scrollTrigger: { trigger: "#skills", start: "top 85%" },
  });

  // Skills — chips fast stagger
  gsap.to("[data-skill-chip]", {
    opacity: 1,
    y: 0,
    duration: 0.5,
    ease: "power2.out",
    stagger: 0.05,
    scrollTrigger: { trigger: "#skills", start: "top 85%" },
  });
}
