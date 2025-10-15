import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import ToastProvider from "./components/ToastProvider.jsx";
import MaintenanceProvider from "./context/MaintenanceContext.jsx";
import './index.css'; // Tailwind CSS

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <MaintenanceProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </MaintenanceProvider>
    </BrowserRouter>
  </React.StrictMode>
);
