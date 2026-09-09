import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MOA (모아) | 마케팅 올인원 플랫폼",
    short_name: "MOA",
    description: "인플루언서 마케팅, 오프라인 행사, 공식 SNS 채널 올인원 운영 플랫폼",
    start_url: "/",
    display: "standalone",
    background_color: "#121316",
    theme_color: "#121316",
    orientation: "any",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
