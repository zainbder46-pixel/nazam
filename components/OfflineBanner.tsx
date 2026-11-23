"use client";

import { CloudOff, RefreshCw, Check } from "lucide-react";
import { useOffline } from "@/lib/offline";

/** شريط صغير يوضح حالة الاتصال والمزامنة */
export function OfflineBanner() {
  const { online, pending, synced } = useOffline();
  if (online && !pending && !synced) return null;
  return (
    <div className="fixed top-[max(.5rem,env(safe-area-inset-top))] inset-x-0 z-[60] flex justify-center pointer-events-none">
      <div className="pointer-events-auto chip h-8 px-3.5 text-xs shadow-lg anim-pop bg-ink text-bg">
        {!online ? <><CloudOff size={13} /> بدون نت — كمّل عادي{pending ? ` · ${pending} بانتظار المزامنة` : ""}</>
          : pending ? <><RefreshCw size={13} className="animate-spin" /> يزامن {pending}...</>
          : <><Check size={13} /> تمت المزامنة ✓</>}
      </div>
    </div>
  );
}
