export const SMARTLINK_URL = "https://stockingsfiddlesophisticated.com/drfzz5nfc?key=a65ddcb5be118c6be68e516713aea33b";

export function openSmartlinkAd() {
  if (typeof window === "undefined") return;
  window.open(SMARTLINK_URL, "_blank", "noopener,noreferrer");
}

// Ad cadence requested for short playback progression: 4th, 7th, 10th, ...
export function shouldGatePlaybackStep(step: number) {
  return step >= 4 && (step - 1) % 3 === 0;
}
