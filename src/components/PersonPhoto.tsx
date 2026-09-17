import { useEffect, useState } from "react";
import { initials, photoLink } from "@/lib/photos";

/**
 * A person's photo with an initials fallback. Photos are private, so the link
 * is signed on demand.
 */
export function PersonPhoto({
  path,
  name,
  size = 40,
  className = "",
}: {
  path?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    photoLink(path).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  const style = { width: size, height: size } as const;

  if (src)
    return (
      <img
        src={src}
        alt={name ?? "Photo"}
        style={style}
        className={`shrink-0 rounded-2xl object-cover shadow-soft ${className}`}
      />
    );

  return (
    <span
      style={style}
      className={`grid shrink-0 place-items-center rounded-2xl bg-primary-soft font-display text-sm font-semibold text-secondary-foreground ${className}`}
    >
      {initials(name)}
    </span>
  );
}
