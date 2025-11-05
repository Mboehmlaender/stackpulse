import {
  Square3Stack3DIcon,
  WrenchScrewdriverIcon,
  ListBulletIcon,
  ServerStackIcon,
  RectangleStackIcon,
  ArrowLeftOnRectangleIcon,
  UserIcon,
  UserGroupIcon,
  KeyIcon
} from "@heroicons/react/24/solid";
import { Stacks, Maintenance, Logs, Users, Usergroups } from "@/pages/dashboard";
import { SignIn, SignUp, SignOut, ForgotPassword } from "@/pages/auth";
import PermissionGate from "@/components/PermissionGate.jsx";

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
        permission: null,
      },
      {
        icon: <WrenchScrewdriverIcon {...icon} />,
        name: "wartung",
        path: "/maintenance",
        element: (
          <PermissionGate permission="maintenance-access" requiredLevel="read">
            <Maintenance />
          </PermissionGate>
        ),
        permission: { key: "maintenance-access", requiredLevel: "read" },
      },
      {
        icon: <ListBulletIcon {...icon} />,
        name: "logs",
        path: "/logs",
        element: (
          <PermissionGate permission="logs-access" requiredLevel="full">
            <Logs />
          </PermissionGate>
        ),
        permission: { key: "logs-access", requiredLevel: "full" },
      },
      {
        icon: <UserIcon {...icon} />,
        name: "benutzer",
        path: "/users",
        element: (
          <PermissionGate permission="users-access" requiredLevel="read">
            <Users />
          </PermissionGate>
        ),
        permission: { key: "users-access", requiredLevel: "read" },
      },
      {
        icon: <UserGroupIcon {...icon} />,
        name: "rechtegruppen",
        path: "/usergroups",
        element: (
          <PermissionGate permission="user-groups-access" requiredLevel="read">
            <Usergroups />
          </PermissionGate>
        ),
        permission: { key: "user-groups-access", requiredLevel: "read" },
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
      icon: <KeyIcon {...icon} />,
      name: "passwort vergessen",
      path: "/forgot-password",
      element: <ForgotPassword />,
    },
    {
      icon: <ArrowLeftOnRectangleIcon {...icon} />,
      name: "log out",
      path: "/logout",
      element: <SignOut />,
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
