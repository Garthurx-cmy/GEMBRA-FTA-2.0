import { useEffect, useState } from "react";
import { getOperationalDateKey } from "./inspectionUtils";

/** Refresh date-based memos at midnight and when returning to the app. Never reload. */
export function useOperationalDate(): string {
  const [today, setToday] = useState(() => getOperationalDateKey());
  useEffect(() => {
    const update = () => setToday(getOperationalDateKey());
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);
  return today;
}
