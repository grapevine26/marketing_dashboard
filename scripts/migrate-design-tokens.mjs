#!/usr/bin/env node
/**
 * hex 하드코딩 클래스 → 시맨틱 디자인 토큰 클래스 일괄 치환 (1회성 마이그레이션 도구).
 * 사용: node scripts/migrate-design-tokens.mjs [--dry]
 * 토큰 정의는 app/globals.css 의 @theme 참고.
 */
import fs from "fs";
import path from "path";

const ROOTS = ["app", "components"];
const DRY = process.argv.includes("--dry");

// 순서 중요: 긴 패턴 먼저
const SIMPLE = [
  ["bg-[#090A0C]", "bg-bg"],
  ["bg-[#121316]", "bg-bg"],
  ["bg-[#0D0E12]", "bg-sidebar"],
  ["bg-[#16171B]", "bg-sidebar"],
  ["bg-[#131418]", "bg-surface"],
  ["bg-[#191B20]", "bg-surface"],
  ["bg-[#181A20]", "bg-surface2"],
  ["bg-[#21232B]", "bg-surface2"],
  ["bg-[#22242A]", "bg-surface3"],
  ["border-[#22242A]", "border-border"],
  ["border-[#292B34]", "border-border"],
  ["border-[#181A20]", "border-surface2"],
  ["divide-[#22242A]", "divide-border"],
  // 보고서 화면의 slate 계열
  ["bg-slate-950", "bg-bg"],
  ["bg-slate-900", "bg-surface"],
  ["bg-slate-800/30", "bg-surface2"],
  ["bg-slate-800", "bg-surface3"],
  ["border-slate-800", "border-border"],
  ["divide-slate-800", "divide-border"],
  ["text-slate-300", "text-text-2"],
  ["text-slate-400", "text-text-sub"],
  ["text-slate-500", "text-text-muted"],
  ["text-slate-600", "text-text-faint"],
  // zinc 텍스트 단계
  ["text-zinc-100", "text-text"],
  ["text-zinc-200", "text-text"],
  ["text-zinc-300", "text-text-2"],
  ["text-zinc-400", "text-text-sub"],
  ["text-zinc-500", "text-text-muted"],
  ["text-zinc-600", "text-text-faint"],
  ["bg-zinc-800", "bg-surface3"],
  ["border-zinc-700", "border-border"],
  ["hover:border-zinc-700", "hover:border-text-faint"],
];

// 단색 배경 버튼 안의 text-white 는 유지, 그 외 text-white 는 본문 색 토큰으로
const SOLID_BG = /\bbg-(blue|indigo|sky|emerald|amber|rose|red|orange|purple|violet|zinc|slate|black|white)(-\d{3})?(\/\d+)?\b|bg-gradient/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

let filesChanged = 0;
let total = 0;
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    const before = fs.readFileSync(file, "utf-8");
    let after = before;
    for (const [from, to] of SIMPLE) after = after.split(from).join(to);

    // text-white / hover:text-white 처리 (줄 단위 휴리스틱)
    after = after
      .split("\n")
      .map((line) => {
        if (!/text-white/.test(line)) return line;
        if (SOLID_BG.test(line)) return line; // 버튼/배지 안의 흰 글자는 유지
        return line.replace(/hover:text-white/g, "hover:text-text").replace(/\btext-white\b/g, "text-text");
      })
      .join("\n");

    if (after !== before) {
      filesChanged++;
      const n = before.length - after.length;
      total += Math.abs(n);
      if (!DRY) fs.writeFileSync(file, after);
      console.log(`${DRY ? "[dry] " : ""}${file}`);
    }
  }
}
console.log(`\n${filesChanged} files ${DRY ? "would change" : "changed"}`);
