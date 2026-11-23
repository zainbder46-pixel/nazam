import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// أيقونة الشاشة الرئيسية في الآيفون
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f766e", position: "relative" }}>
        <svg width="120" height="120" viewBox="0 0 64 64">
          <path d="M14 34l11 11 23-25" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ position: "absolute", top: 28, right: 30, width: 26, height: 26, borderRadius: 13, background: "#d6aa5a" }} />
      </div>
    ),
    size
  );
}
