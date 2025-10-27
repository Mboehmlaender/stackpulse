/**
=========================================================
* Material Tailwind Dashboard React - v2.1.0
=========================================================
* Product Page: https://www.creative-tim.com/product/material-tailwind-dashboard-react
* Copyright 2023 Creative Tim (https://www.creative-tim.com)
* Licensed under MIT (https://github.com/creativetimofficial/material-tailwind-dashboard-react/blob/main/LICENSE.md)
* Coded by Creative Tim
=========================================================
* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/
import React from "react";
import axios from "axios";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@material-tailwind/react";
import { MaterialTailwindControllerProvider } from "@/components";
import "./tailwind.css";
import ToastProvider from "@/components/ToastProvider.jsx";
import MaintenanceProvider from "@/components/MaintenanceProvider.jsx";
import PageProvider from "@/components/PageProvider.jsx";

axios.defaults.withCredentials = true;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <MaintenanceProvider>
        <ToastProvider>
          <PageProvider>
            <ThemeProvider>
              <MaterialTailwindControllerProvider>
                <App />
              </MaterialTailwindControllerProvider>
            </ThemeProvider>
          </PageProvider>
        </ToastProvider>
      </MaintenanceProvider>
    </BrowserRouter>
  </React.StrictMode>
);
