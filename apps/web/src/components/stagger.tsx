"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Form alanlarını sırayla getiren sarmalayıcı.
 *
 * Gecikme `index`ten hesaplanıyor, elle yazılmıyor: alan eklendiğinde ya da
 * yeri değiştiğinde gecikmelerin tek tek düzeltilmesi gerekmesin. 60 ms
 * bilerek küçük — form doldurmaya gelen biri gösteriyi değil kutuyu bekliyor.
 */
export function Stagger({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("animate-fade-up", className)}
      style={{ animationDelay: `${0.16 + index * 0.06}s` }}
    >
      {children}
    </div>
  );
}
