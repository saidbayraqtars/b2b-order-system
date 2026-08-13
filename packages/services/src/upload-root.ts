import path from "node:path";

/**
 * Where uploaded files live.
 *
 * Its own module so that the storage code and the image-variant cache can both
 * ask without importing each other — they otherwise form a cycle, and a cycle
 * between two modules that are only related by a directory name is the kind of
 * thing that works until the day a bundler evaluates them in the other order.
 */
export function uploadRoot(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}
