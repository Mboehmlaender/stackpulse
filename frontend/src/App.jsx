import { Routes, Route, Navigate } from "react-router-dom";
import { Dashboard, Auth } from "@/layouts";
import Setup from "@/pages/setup/setup";

function App() {
  return (
    <Routes>
      <Route path="/dashboard/*" element={<Dashboard />} />
      <Route path="/auth/*" element={<Auth />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="*" element={<Navigate to="/dashboard/stacks" replace />} />
    </Routes>
  );
}

export default App;
