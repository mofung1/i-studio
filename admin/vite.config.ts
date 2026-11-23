import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ViteDevServer } from "vite";

function redirectAdminRoot({ middlewares }: Pick<ViteDevServer, "middlewares">) {
  middlewares.use((req, res, next) => {
    const url = req.url ?? "";
    if (url === "/admin" || url.startsWith("/admin?")) {
      res.writeHead(307, { Location: `/admin/${url.slice("/admin".length)}` });
      res.end();
      return;
    }
    next();
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "ADMIN_");
  const proxy = {
    "/v1": { target: env.ADMIN_API_PROXY || "http://127.0.0.1:44000" },
  };
  return {
    base: "/admin/",
    plugins: [
      {
        name: "admin-root-redirect",
        configureServer: redirectAdminRoot,
        configurePreviewServer: redirectAdminRoot,
      },
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: { proxy },
    preview: { proxy },
  };
});
