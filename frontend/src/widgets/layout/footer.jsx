import PropTypes from "prop-types";
import { Typography } from "@material-tailwind/react";
import { HeartIcon } from "@heroicons/react/24/solid";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer>
      <div className="flex w-full flex-wrap items-center justify-center  md:justify-end">
        <Typography variant="small" className="mt-1 text-xs text-stormGrey-500 block antialiased font-sans">
          StackPulse:  &copy; {year} by Michael Böhmländer
        </Typography>
      </div>
    </footer>
  );
}

Footer.displayName = "/src/widgets/layout/footer.jsx";
export default Footer;
