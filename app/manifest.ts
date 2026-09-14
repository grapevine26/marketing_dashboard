import type { MetadataRoute } from "next";

/**
 * PWA 설치 정보.
 *
 * 아이콘은 파일로 두지 않고 app/icon.tsx, app/apple-icon.tsx,
 * app/icon-192.png/route.tsx, app/icon-512.png/route.tsx 에서 그린다.
 * 이름이 바뀔 때 고칠 곳이 코드 안에만 있어 빠뜨릴 여지가 적다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RB Global | 마케팅 올인원 플랫폼",
    short_name: "RB Global",
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
