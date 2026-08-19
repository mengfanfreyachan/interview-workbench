import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createAgentReachMiddleware } from "./agent-reach-bridge";
import { createDeepSeekInterviewMiddleware } from "./deepseek-interview-bridge";

const projectDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const workspaceEnv = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "");
  const localEnv = loadEnv(mode, projectDirectory, "");
  const apiKey = process.env.DEEPSEEK_API_KEY || localEnv.DEEPSEEK_API_KEY || workspaceEnv.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_INTERVIEW_MODEL
    || localEnv.DEEPSEEK_INTERVIEW_MODEL
    || workspaceEnv.DEEPSEEK_INTERVIEW_MODEL
    || process.env.DEEPSEEK_RESUME_MODEL
    || localEnv.DEEPSEEK_RESUME_MODEL
    || workspaceEnv.DEEPSEEK_RESUME_MODEL;

  return {
    plugins: [
      react(),
      {
        name: "local-workbench-bridges",
        apply: "serve",
        configureServer(server) {
          server.middlewares.use(createAgentReachMiddleware());
          server.middlewares.use(createDeepSeekInterviewMiddleware({ apiKey, model }));
        },
      },
    ],
    server: { port: 4173 },
    preview: { port: 4174 },
  };
});
