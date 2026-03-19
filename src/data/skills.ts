export interface SkillGroup {
  category: string;
  items: string[];
}

export const skills: SkillGroup[] = [
  {
    category: "Content Production",
    items: ["CapCut", "Captions App", "iPhone Filming", "Gimbal Operation", "Scripting", "On-Camera Presenting"],
  },
  {
    category: "Platforms & Strategy",
    items: ["TikTok", "Instagram Reels", "YouTube Shorts", "Algorithm Research", "Hashtag Strategy", "SEO"],
  },
  {
    category: "Music & Audio",
    items: ["FL Studio", "SM7dB", "Audient iD4", "Original Soundtracks", "DistroKid"],
  },
  {
    category: "Development & Tools",
    items: ["TypeScript", "Astro", "Tailwind CSS", "Rust", "WebAssembly", "Vercel", "Cloudflare", "Git"],
  },
];
