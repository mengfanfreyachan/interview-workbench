export type SourceDraft = {
  title: string;
  platform: string;
  url: string;
  capturedAt: string;
};

export const emptySourceDraft = (): SourceDraft => ({
  title: "",
  platform: "",
  url: "",
  capturedAt: new Date().toISOString().slice(0, 10),
});
