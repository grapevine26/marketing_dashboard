import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

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
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "116px",
          fontWeight: 700,
        }}
      >
        S
      </div>
    ),
    {
      ...size,
    }
  );
}
