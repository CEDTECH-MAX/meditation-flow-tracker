import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  value,
  onChange,
  readOnly = false,
  size = 20,
}: {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const icon = (
          <Star
            width={size}
            height={size}
            className={cn(filled ? "fill-gold text-gold" : "text-muted-foreground")}
          />
        );
        if (readOnly || !onChange)
          return (
            <span key={n} aria-hidden>
              {icon}
            </span>
          );
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => onChange(n)}
            className="transition hover:scale-110"
          >
            {icon}
          </button>
        );
      })}
      <span className="ml-1 text-xs text-muted-foreground">{value ? value.toFixed(1) : "—"}</span>
    </span>
  );
}
