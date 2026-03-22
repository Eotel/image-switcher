export const CHANNEL_NAME = "image-switcher";

export type ChannelMessage =
  | { type: "take"; imageUrl: string }
  | { type: "black" }
  | { type: "workspace-changed" };
