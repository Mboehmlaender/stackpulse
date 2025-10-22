import PropTypes from "prop-types";
import { Typography } from "@material-tailwind/react";
import { HeartIcon } from "@heroicons/react/24/solid";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer>
      <div className="flex w-full flex-wrap items-center justify-center  md:justify-between">
        <Typography variant="small" className="font-normal text-inherit">
          StackPulse:  &copy; {year} by Michael Böhmländer
        </Typography>
        <Typography variant="small" className="font-normal text-inherit">
          Tailwind Material Dashboard:  &copy; {year} made with{" "}
          <HeartIcon className="-mt-0.5 inline-block h-3.5 w-3.5 text-red-600" /> by Creative Tim
        </Typography>


      </div>
    </footer>
  );
}

Footer.displayName = "/src/widgets/layout/footer.jsx";
export default Footer;
