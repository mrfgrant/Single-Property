import { createRoot } from "react-dom/client";
import App from "./App";
import { applySeoFromCopy } from "./lib/seo";
import "./index.css";

applySeoFromCopy();

createRoot(document.getElementById("root")!).render(<App />);
