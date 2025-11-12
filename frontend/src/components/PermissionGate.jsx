import React from "react";
import PropTypes from "prop-types";
import { Typography, Card, CardBody } from "@material-tailwind/react";
import { useAuth } from "@/components/AuthProvider.jsx";

export function PermissionGate({
  permission,
  requiredLevel = "full",
  loadingFallback = null,
  children,
}) {
  const { initialized, loading, hasPermission } = useAuth();

  if (!permission) {
    return children;
  }

  if (!initialized || loading) {
    return (
      loadingFallback ?? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Typography variant="small" color="blue-gray">
            Berechtigungen werden geladen …
          </Typography>
        </div>
      )
    );
  }

  if (hasPermission(permission, requiredLevel)) {
    return children;
  }

  return (
    <div className="mt-12 flex items-center justify-center px-4">
      <Card className="max-w-xl border border-blue-gray-100 shadow-sm">
        <CardBody className="space-y-3 text-center">
          <Typography variant="h5" color="blue-gray">
            Kein Zugriff auf diesen Bereich
          </Typography>
          <Typography variant="small" className="text-blue-gray-500">
            Für diese Funktion wird die Berechtigung <code>{permission}</code> benötigt.
          </Typography>
        </CardBody>
      </Card>
    </div>
  );
}

PermissionGate.propTypes = {
  permission: PropTypes.string,
  requiredLevel: PropTypes.string,
  loadingFallback: PropTypes.node,
  children: PropTypes.node.isRequired,
};

export default PermissionGate;

