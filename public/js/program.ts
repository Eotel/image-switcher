import { CHANNEL_NAME, type ChannelMessage } from "./channel.ts";
import { preloadImage } from "./image-utils.ts";

const stage = document.getElementById("program-stage")!;
const imgA = document.getElementById("program-img-a") as HTMLImageElement;
const imgB = document.getElementById("program-img-b") as HTMLImageElement;
const overlay = document.getElementById("overlay") as HTMLElement;
const channel = new BroadcastChannel(CHANNEL_NAME);

let activeLayer: HTMLImageElement = imgA;
let transitionTimer: number | null = null;
let transitionGeneration = 0;

function finishTransition(): void {
  if (transitionTimer !== null) {
    clearTimeout(transitionTimer);
    transitionTimer = null;
  }
  stage.style.setProperty("--transition-duration", "0s");
  activeLayer = imgA.classList.contains("active") ? imgA : imgB;
}

function executeTransition(imageUrl: string, transition: ChannelMessage & { type: "take" }): void {
  if (transitionTimer !== null) finishTransition();

  const gen = ++transitionGeneration;
  const incoming = activeLayer === imgA ? imgB : imgA;
  const outgoing = activeLayer;

  void preloadImage(imageUrl).then((loaded) => {
    if (gen !== transitionGeneration) return;
    incoming.src = loaded.src;

    if (transition.transition === "cut") {
      stage.style.setProperty("--transition-duration", "0s");
      incoming.classList.add("active");
      outgoing.classList.remove("active");
      activeLayer = incoming;
    } else {
      const durationS = transition.durationMs / 1000;
      stage.style.setProperty("--transition-duration", `${durationS}s`);
      // Force reflow so transition-duration takes effect
      void incoming.offsetWidth;
      incoming.classList.add("active");
      outgoing.classList.remove("active");
      transitionTimer = window.setTimeout(() => {
        if (gen !== transitionGeneration) return;
        activeLayer = incoming;
        transitionTimer = null;
      }, transition.durationMs);
    }
  });
}

function executeBlack(msg: ChannelMessage & { type: "black" }): void {
  if (transitionTimer !== null) finishTransition();

  if (msg.transition === "cut") {
    stage.style.setProperty("--transition-duration", "0s");
    imgA.classList.remove("active");
    imgB.classList.remove("active");
  } else {
    const durationS = msg.durationMs / 1000;
    stage.style.setProperty("--transition-duration", `${durationS}s`);
    void imgA.offsetWidth;
    imgA.classList.remove("active");
    imgB.classList.remove("active");
  }
}

overlay.addEventListener("click", () => {
  document.documentElement.requestFullscreen().catch(() => {});
  overlay.classList.add("hidden");
});

channel.onmessage = (e: MessageEvent<ChannelMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case "take":
      executeTransition(msg.imageUrl, msg);
      break;
    case "black":
      executeBlack(msg);
      break;
    case "workspace-changed":
      if (transitionTimer !== null) finishTransition();
      stage.style.setProperty("--transition-duration", "0s");
      imgA.classList.remove("active");
      imgB.classList.remove("active");
      imgA.removeAttribute("src");
      imgB.removeAttribute("src");
      break;
  }
};
