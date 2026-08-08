"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button, ErrorLine, TextArea } from "@/components/form";

interface Props {
  /** One URL per line — the shape the product form already stores. */
  value: string;
  onChange: (next: string) => void;
}

/**
 * Upload images, or paste URLs. Both, deliberately: an uploaded file is the
 * common case, but a catalogue whose photos already live on a CDN should not
 * have to re-upload them to be usable here.
 */
export function ImagePicker({ value, onChange }: Props) {
  const urls = value.split("\n").map((s) => s.trim()).filter(Boolean);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setUrls(next: string[]) {
    onChange(next.join("\n"));
  }

  async function upload(files: FileList) {
    setError(null);
    setBusy(true);
    const added: string[] = [];

    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "products");

      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        credentials: "include",
        body,
      }).catch(() => null);

      if (!res?.ok) {
        const detail = (await res?.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(detail?.error ?? `${file.name} yüklenemedi`);
        break;
      }
      const saved = (await res.json()) as { url: string };
      added.push(saved.url);
    }

    setBusy(false);
    if (added.length > 0) setUrls([...urls, ...added]);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Görsel yükle
        </Button>
        <span className="text-xs text-neutral-500">
          JPEG, PNG, WebP, AVIF, GIF · en fazla 5 MB
        </span>
      </div>

      <ErrorLine error={error ? new Error(error) : null} />

      {urls.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {urls.map((url, index) => (
            <li key={`${url}-${index}`} className="relative">
              {/* Same-origin upload URL; next/image would need a loader for no
                  benefit here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-20 w-20 rounded-md border border-neutral-200 object-cover dark:border-neutral-800"
              />
              <button
                type="button"
                title="Kaldır"
                aria-label="Görseli kaldır"
                onClick={() => setUrls(urls.filter((_, i) => i !== index))}
                className="absolute -right-2 -top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-white shadow-sm hover:bg-red-600 dark:bg-white dark:text-neutral-900 dark:hover:bg-red-500 dark:hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
              {index === 0 && (
                <span className="absolute bottom-0 left-0 rounded-br-md rounded-tr-md bg-neutral-900/80 px-1 text-[10px] text-white">
                  kapak
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <TextArea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://… (her satıra bir URL)"
        rows={3}
        className="font-mono text-xs"
      />
    </div>
  );
}
