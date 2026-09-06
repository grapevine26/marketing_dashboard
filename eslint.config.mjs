import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", ".agents/**", "next-env.d.ts", "playwright-report/**", "test-results/**"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // 화면 컴포넌트에서 `"` 같은 문자를 텍스트로 자주 쓴다
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
