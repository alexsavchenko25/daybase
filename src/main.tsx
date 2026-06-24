import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Theme früh setzen (vor Render → kein Flash).
const savedTheme = localStorage.getItem("daybase.theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
