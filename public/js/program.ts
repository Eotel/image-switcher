import { CHANNEL_NAME, type ChannelMessage } from "./channel.ts";

const img = document.getElementById("program-img") as HTMLImageElement;
const overlay = document.getElementById("overlay") as HTMLElement;
const channel = new BroadcastChannel(CHANNEL_NAME);

overlay.addEventListener("click", () => {
  document.documentElement.requestFullscreen().catch(() => {});
  overlay.classList.add("hidden");
});

channel.onmessage = (e: MessageEvent<ChannelMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case "take": {
      const imageUrl = msg.imageUrl;
      const loader = new Image();
      loader.onload = () => {
        img.src = imageUrl;
        img.classList.add("visible");
      };
      loader.src = imageUrl;
      break;
    }
    case "black":
      img.classList.remove("visible");
      break;
    case "workspace-changed":
      img.classList.remove("visible");
      img.removeAttribute("src");
      break;
  }
};
