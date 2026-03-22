export const CHANNEL_NAME = "image-switcher";

export type TransitionType = "cut" | "auto";

export type ChannelMessage =
  | { type: "take"; imageUrl: string; transition: TransitionType; durationMs: number }
  | { type: "black"; transition: TransitionType; durationMs: number }
  | { type: "workspace-changed" };
