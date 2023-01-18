module.exports = {
  purge: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  mode: "jit",
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {
      screens: {
        xs: "480px",
      },
      colors: {
        transparent: "transparent",
        invisible: "rgba(1,1,1,0)",
        current: "currentColor",
        primary: "#fff",
        accent: "#ed2e3d",
        main: "#000",
        highlight: "#ed2e3d",
        dimmed: "#1f1f1f",
      },
      fontFamily: {
        header: ["Rajdhani", "sans-serif"],
        primary: ["Rajdhani", "sans-serif"],
      },
      fontSize: {
        xxs: "0.7rem",
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
};
