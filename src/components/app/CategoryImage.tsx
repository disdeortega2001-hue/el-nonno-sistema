import viveres from "@/assets/cat-viveres.webp";
import charcuteria from "@/assets/cat-charcuteria.webp";
import congelados from "@/assets/cat-congelados.webp";
import envases from "@/assets/cat-envases.webp";
import panaderia from "@/assets/cat-panaderia.webp";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/db";

export const BUILTIN_CATEGORY_IMAGES: Record<string, string> = {
  viveres,
  charcuteria,
  congelados,
  envases,
  panaderia,
};

export function categoryImageSrc(cat: Pick<Category, "image_url" | "image_key"> | null | undefined): string | null {
  if (!cat) return null;
  if (cat.image_url) return cat.image_url;
  if (cat.image_key && BUILTIN_CATEGORY_IMAGES[cat.image_key]) return BUILTIN_CATEGORY_IMAGES[cat.image_key]!;
  return null;
}

export function CategoryImage({
  category,
  className,
}: {
  category: Pick<Category, "image_url" | "image_key" | "name"> | null | undefined;
  className?: string;
}) {
  const src = categoryImageSrc(category);
  if (!src)
    return (
      <div className={cn("flex items-center justify-center rounded-lg bg-muted font-display text-lg font-bold text-muted-foreground", className)}>
        {category?.name?.charAt(0) ?? "?"}
      </div>
    );
  return <img src={src} alt="" className={cn("object-contain", className)} loading="lazy" />;
}
