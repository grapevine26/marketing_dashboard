import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

/** iOS 홈 화면에 추가했을 때 쓰는 아이콘. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#16171b",
          borderRadius: "40px",
          border: "2px solid #292b34",
          color: "#ececf1",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: "78px",
          fontWeight: 900,
          letterSpacing: "-3px",
        }}
      >
        RB
      </div>
    ),
    {
      ...size,
    }
  );
}
