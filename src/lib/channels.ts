export type CreatorChannel = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatarUrl?: string;
  bannerUrl?: string;
  createdAt: string;
};

function channelsStorageKey(userId: string) {
  return `yobunny.channels.${userId}`;
}

function selectedChannelStorageKey(userId: string) {
  return `yobunny.channels.selected.${userId}`;
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function buildPrimaryChannel(user: { id: string; displayName?: string; username?: string; avatarUrl?: string | null; bannerUrl?: string | null }) {
  return {
    id: `primary-${user.id}`,
    name: user.displayName || "My Channel",
    handle: user.username || "my_channel",
    bio: "",
    avatarUrl: user.avatarUrl || undefined,
    bannerUrl: user.bannerUrl || undefined,
    createdAt: new Date().toISOString()
  } as CreatorChannel;
}

export function loadChannels(userId: string, fallbackPrimary: CreatorChannel) {
  if (typeof window === "undefined") {
    return [fallbackPrimary];
  }

  const stored = safeJsonParse<CreatorChannel[]>(window.localStorage.getItem(channelsStorageKey(userId)), []);
  const withPrimary = stored.some((item) => item.id === fallbackPrimary.id)
    ? stored.map((item) => (item.id === fallbackPrimary.id ? { ...item, ...fallbackPrimary } : item))
    : [fallbackPrimary, ...stored];

  window.localStorage.setItem(channelsStorageKey(userId), JSON.stringify(withPrimary));
  return withPrimary;
}

export function saveChannels(userId: string, channels: CreatorChannel[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(channelsStorageKey(userId), JSON.stringify(channels));
}

export function getSelectedChannelId(userId: string, channels: CreatorChannel[]) {
  if (typeof window === "undefined") return channels[0]?.id || "";
  const selected = window.localStorage.getItem(selectedChannelStorageKey(userId));
  const exists = channels.some((channel) => channel.id === selected);
  return exists ? (selected as string) : (channels[0]?.id || "");
}

export function setSelectedChannelId(userId: string, channelId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(selectedChannelStorageKey(userId), channelId);
}
