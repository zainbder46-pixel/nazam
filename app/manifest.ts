import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "نظام — رتّب حياتك وعملك",
    short_name: "نظام",
    description: "مهامك، صفحاتك، عباداتك، ومصاريفك في مكان واحد",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#0f1113",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      { name: "صرفية جديدة", short_name: "صرفية", url: "/q" },
      { name: "مهمة جديدة", short_name: "مهمة", url: "/tasks" },
    ],
  };
}
