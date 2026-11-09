/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,js,jsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        primary: "#3b82f6",
        success: "#10b981",
        danger: "#ef4444",
        warning: "#f59e0b",
      },
      spacing: {
        safe: "env(safe-area-inset)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
