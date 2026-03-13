/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{vue,ts,tsx,js}"],
  theme: {
    extend: {
      fontFamily: {
        ui: [
          "Sarasa UI SC",
          "Noto Sans SC",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
        display: ["Source Han Serif SC", "Noto Serif SC", "SimSun", "serif"],
      },
      colors: {
        // 日系 Galgame 基础配色
        ink: {
          DEFAULT: "#1a1016",
          soft: "#3d2e36",
          muted: "#6b5a63",
        },
        parchment: {
          DEFAULT: "#f5f0e8",
          warm: "#ede6d9",
          deep: "#ddd4c4",
        },
        sakura: {
          light: "#f8e8ee",
          DEFAULT: "#d4849a",
          deep: "#b05672",
        },
        wisteria: {
          light: "#ece0f0",
          DEFAULT: "#9b7eac",
          deep: "#6d4d82",
        },
        gold: {
          light: "#f5eddb",
          DEFAULT: "#c4a265",
          deep: "#8f6e2e",
        },
      },
      boxShadow: {
        glass: "0 4px 30px rgba(26, 16, 22, 0.12)",
        "glass-strong": "0 8px 40px rgba(26, 16, 22, 0.25)",
        inner: "inset 0 1px 3px rgba(26, 16, 22, 0.08)",
      },
      borderRadius: {
        frame: "2px",
      },
      backgroundImage: {
        grain:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out both",
        "fade-in-up": "fadeInUp 0.6s ease-out both",
        "title-glow": "titleGlow 3s ease-in-out infinite alternate",
        float: "float 6s ease-in-out infinite",
        "typing-blink": "typingBlink 0.8s steps(2) infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        titleGlow: {
          from: { textShadow: "0 0 20px rgba(212, 132, 154, 0.0)" },
          to: { textShadow: "0 0 20px rgba(212, 132, 154, 0.3)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        typingBlink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
