// Aynı anlamsal katman web ile paylaşılıyor: `bg-surface`, `text-fg`,
// `bg-primary`… Değerler CSS değişkeninden geliyor, değişkenleri de tasarım
// paketi yazıyor (@repo/theme). Bu yüzden bu dosyada tek bir renk yok — vitrin
// ile telefonun aynı kimliği göstermesinin tek garantisi bu.
//
// `web: false`: gölge ve ızgara yardımcıları React Native'de karşılıksız.
const { themeExtension } = require("@repo/theme/tailwind");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: themeExtension(),
  },
  plugins: [],
};
