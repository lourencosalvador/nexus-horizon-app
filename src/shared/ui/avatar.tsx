import Image from "next/image";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase();
}

export function Avatar({
  name,
  src,
  online = false,
  showOnline = true,
  size = "md",
  className,
}: {
  name?: string | null;
  src?: string;
  online?: boolean;
  showOnline?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const safeName = (name ?? "").trim() || "Member";
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  const sizeCls = useMemo(() => {
    if (size === "sm") return "h-9 w-9 rounded-xl";
    if (size === "lg") return "h-12 w-12 rounded-2xl";
    return "h-10 w-10 rounded-xl";
  }, [size]);

  const sizesAttr = size === "sm" ? "36px" : size === "lg" ? "48px" : "40px";

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden border border-zinc-200 bg-white",
          sizeCls
        )}
      >
        {showImage ? (
          <Image
            src={src as string}
            alt={safeName}
            fill
            sizes={sizesAttr}
            className="object-cover z-0"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-extrabold text-zinc-900">
            {initials(safeName)}
          </div>
        )}
      </div>

      {showOnline && online && (
        <span
          className="absolute -right-1 -bottom-0.5 h-3 w-3 rounded-full bg-green-600 ring-2 ring-white z-50"
          aria-label="Online"
        />
      )}
    </div>
  );
}


