import type { Metadata } from "next";
import SignupClient from "./SignupClient";

export const metadata: Metadata = {
  title: "가입 신청 | MOA",
};

/** 가입 화면. 사이드바 없는 전체 화면이다. */
export default function SignupPage() {
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col items-center justify-center py-8 px-3 sm:p-6 font-sans">
      <SignupClient />
    </div>
  );
}
