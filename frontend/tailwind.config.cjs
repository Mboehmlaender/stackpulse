const withMT = require("@material-tailwind/react/utils/withMT");
const colors = require("tailwindcss/colors");

module.exports = withMT({
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        sky: colors.sky,
        green: colors.green,
        slate: colors.slate,
        orange: colors.orange, // falls du z. B. text-orange-300 brauchst
      },
    },
  },
  plugins: [],
});