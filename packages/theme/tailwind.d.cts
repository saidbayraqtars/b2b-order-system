/** Types for `tailwind.cjs` — see that file for why it is CommonJS. */

export interface ThemeExtension {
  colors: Record<string, string>;
  fontFamily: Record<"display" | "body" | "label" | "mono", string[]>;
  borderRadius: Record<string, string>;
  /** Web only. React Native has no box shadow of this shape. */
  boxShadow?: Record<string, string>;
  backgroundImage?: Record<string, string>;
  backgroundSize?: Record<string, string>;
}

export declare function themeExtension(options?: { web?: boolean }): ThemeExtension;
