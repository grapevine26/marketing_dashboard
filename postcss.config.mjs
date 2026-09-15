// 익명 객체를 바로 export 하면 import/no-anonymous-default-export 에 걸린다.
// 이름을 붙여 두면 디버깅할 때 설정 출처도 알아보기 쉽다.
const postcssConfig = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default postcssConfig;
