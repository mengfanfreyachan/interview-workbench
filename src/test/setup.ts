import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined") {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined,
  });

  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };

  if (!File.prototype.text) {
    Object.defineProperty(File.prototype, "text", {
      configurable: true,
      value() {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
          reader.addEventListener("error", () => reject(reader.error ?? new Error("测试文件读取失败。")));
          reader.readAsText(this);
        });
      },
    });
  }
}
