import { useCallback, useEffect, useState } from "react";
import { configureDeepSeekKey, getDeepSeekStatus, removeDeepSeekKey } from "./deepseek-client";

export type DeepSeekUiStatus = {
  status: "checking" | "configured" | "missing" | "unavailable";
  model: string;
  keySource: "session" | "environment" | "none";
};

type Params = {
  isDev: boolean;
  setNotice: (message: string) => void;
  setError: (message: string) => void;
};

export function useDeepSeekSession({ isDev, setNotice, setError }: Params) {
  const [status, setStatus] = useState<DeepSeekUiStatus>({
    status: isDev ? "checking" : "unavailable",
    model: "",
    keySource: "none",
  });
  const [showConfig, setShowConfig] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => {
    if (!isDev) return;
    const controller = new AbortController();
    void getDeepSeekStatus(controller.signal)
      .then((payload) => {
        setStatus({ status: payload.configured ? "configured" : "missing", model: payload.model, keySource: payload.keySource ?? "none" });
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setStatus({ status: "unavailable", model: "", keySource: "none" });
        }
      });
    return () => controller.abort();
  }, [isDev]);

  const toggleConfig = useCallback(() => {
    setShowConfig((visible) => !visible);
    setApiKey("");
  }, []);

  const cancelConfig = useCallback(() => {
    setShowConfig(false);
    setApiKey("");
  }, []);

  const configure = useCallback(async () => {
    const trimmedKey = apiKey.trim();
    if (!isDev) return setError("当前静态版本没有本机服务，无法安全接收 API key。");
    if (trimmedKey.length < 16 || trimmedKey.length > 256 || !/^[\x21-\x7e]+$/.test(trimmedKey)) {
      return setError("DeepSeek API key 格式无效，请检查是否完整且没有空格。");
    }
    setError("");
    setSavingKey(true);
    try {
      const payload = await configureDeepSeekKey(trimmedKey);
      setStatus({ status: payload.configured ? "configured" : "missing", model: payload.model, keySource: payload.keySource ?? "none" });
      setApiKey("");
      setShowConfig(false);
      setNotice("你的 DeepSeek API key 已保存到本机服务的本次会话；不会进入浏览器存储、工作台备份或项目文件，首次深度分析时由 DeepSeek 验证，服务重启后自动失效。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "DeepSeek API key 未能配置，请重试。");
    } finally {
      setSavingKey(false);
    }
  }, [apiKey, isDev, setError, setNotice]);

  const remove = useCallback(async () => {
    if (!isDev) return;
    setError("");
    setSavingKey(true);
    try {
      const payload = await removeDeepSeekKey();
      setStatus({ status: payload.configured ? "configured" : "missing", model: payload.model, keySource: payload.keySource ?? "none" });
      setApiKey("");
      setShowConfig(false);
      setNotice(payload.keySource === "environment"
        ? "已移除你本次填写的 Key，并恢复使用项目环境中的 DeepSeek 配置。"
        : "已移除你本次填写的 DeepSeek Key；配置新的 Key 后可继续证据审阅。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "本次会话 Key 未能移除，请重试。");
    } finally {
      setSavingKey(false);
    }
  }, [isDev, setError, setNotice]);

  return { status, showConfig, apiKey, savingKey, setApiKey, toggleConfig, cancelConfig, configure, remove };
}
