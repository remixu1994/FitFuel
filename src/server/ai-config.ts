import { ApiError } from "@/server/http";

function required(name: "MIMO_BASE_URL" | "MIMO_API_KEY" | "MIMO_MODEL") {
  const value = process.env[name]?.trim();
  if (!value) throw new ApiError(503, `AI 环境变量 ${name} 尚未配置`);
  return value;
}

export function getMimoConfig() {
  return {
    baseUrl: required("MIMO_BASE_URL").replace(/\/$/, ""),
    apiKey: required("MIMO_API_KEY"),
    model: required("MIMO_MODEL")
  };
}
