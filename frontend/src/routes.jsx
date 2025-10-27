import {
  Square3Stack3DIcon,
  WrenchScrewdriverIcon,
  ListBulletIcon,
  ServerStackIcon,
  RectangleStackIcon,
  UserIcon,
  UserGroupIcon
} from "@heroicons/react/24/solid";
import { Stacks, Maintenance, Logs, Users, Usergroups } from "@/pages/dashboard";
import { SignIn, SignUp } from "@/pages/auth";

const icon = {
  className: "w-5 h-5 text-inherit",
};

export const routes = [
  {
    layout: "dashboard",
    pages: [
      {
        icon: <Square3Stack3DIcon {...icon} />,
        name: "stacks",
        path: "/stacks",
        element: <Stacks />,
      },
      {
        icon: <WrenchScrewdriverIcon {...icon} />,
        name: "wartung",
        path: "/maintenance",
        element: <Maintenance />,
      },
      {
        icon: <ListBulletIcon {...icon} />,
        name: "logs",
        path: "/logs",
        element: <Logs />,
      },
      {
        icon: <UserIcon {...icon} />,
        name: "benutzer",
        path: "/users",
        element: <Users />,
      },
      {
        icon: <UserGroupIcon {...icon} />,
        name: "rechtegruppen",
        path: "/usergroups",
        element: <Usergroups />,
      },
    ],
  },
{
  title: "auth pages",
  layout: "auth",
  pages: [
    {
      icon: <ServerStackIcon {...icon} />,
      name: "sign in",
      path: "/sign-in",
      element: <SignIn />,
    },
    {
      icon: <RectangleStackIcon {...icon} />,
      name: "sign up",
      path: "/sign-up",
      element: <SignUp />,
    },
  ],
},
];

export default routes;
