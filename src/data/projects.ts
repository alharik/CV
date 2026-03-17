export interface Project {
  title: string;
  description: string;
  url: string;
  tech: string[];
}

export const projects: Project[] = [
  {
    title: "302K+ Viral Reel — Magic Touch Electronics",
    description:
      "Retro gaming consoles product reel that reached 302,000+ organic views with 740 likes and 79 comments. Solo produced: concept to final edit.",
    url: "#",
    tech: ["CapCut", "iPhone", "Instagram Reels"],
  },
  {
    title: "Sonic Converter",
    description:
      "Privacy-first browser-based MP3 to WAV converter built with Rust and WebAssembly. All processing happens locally — zero server uploads.",
    url: "https://mp3towav.online",
    tech: ["Rust", "WebAssembly", "Web Audio API"],
  },
  {
    title: "SEVENTOR",
    description:
      "Luxury events and entertainment agency website. Bilingual Arabic/English with WhatsApp booking integration.",
    url: "https://seventor.com",
    tech: ["Web Design", "Bilingual", "WhatsApp API"],
  },
  {
    title: "This Portfolio",
    description:
      "The site you are looking at. Built with Astro, Tailwind v4, and GSAP. Sub-500KB total weight.",
    url: "#",
    tech: ["Astro", "Tailwind CSS", "GSAP", "TypeScript"],
  },
];
