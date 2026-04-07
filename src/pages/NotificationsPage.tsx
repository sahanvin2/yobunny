import { Bell, Film, Users, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/mockData";
import { fetchNotifications, markAllNotificationsRead } from "@/lib/api";

type NotificationItem = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  isRead: boolean;
};

const iconByType: Record<string, typeof Bell> = {
  new_subscriber: Users,
  comment: MessageSquare,
  reply: MessageSquare,
  new_video: Film
};

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);

  const load = () => {
    fetchNotifications()
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  };

  useEffect(() => {
    load();
  }, []);

  const markAll = async () => {
    await markAllNotificationsRead();
    load();
  };

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
        <button onClick={markAll} className="px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-medium hover:bg-surface-hover transition-colors">
          Mark all read
        </button>
      </div>

      {items.length === 0 && <p className="text-sm text-muted-foreground">No notifications yet.</p>}

      <div className="space-y-1">
        {items.map((item) => {
          const Icon = iconByType[item.type] || Bell;
          return (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-4 rounded-xl transition-colors hover:bg-surface ${!item.isRead ? "bg-surface" : ""}`}
            >
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <Icon size={18} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${item.isRead ? "text-muted-foreground" : "text-foreground font-medium"}`}>{item.message}</p>
                <p className="text-xs text-text-tertiary mt-0.5">{formatRelativeTime(item.createdAt)}</p>
              </div>
              {!item.isRead && <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
