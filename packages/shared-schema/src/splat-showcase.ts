import { z } from "zod";

/**
 * V68 (MASTER_SPEC Section 118): Gaussian-splat showcase library.
 *
 * One SplatShowcase is one 3D capture the platform can display. For the
 * management demo these are third-party examples embedded from superspl.at
 * (the public SuperSplat scene gallery run by PlayCanvas); later the
 * platform's own captures (antenna stations, plant rooms like the ESOC power
 * plant, the EAC ISS training rooms) are recorded with category
 * "stationCapture" or "training". The in-app splat viewer integration itself
 * is deliberately out of scope for V68: entries with an embedSrc render as
 * an iframe, entries with only a sceneUrl open in a new tab.
 */

/** Only superspl.at (and its subdomains) may be framed. */
export const SPLAT_EMBED_HOST_PATTERN = /^https:\/\/([a-z0-9-]+\.)*superspl\.at\//i;

const splatFrameUrl = z.string().min(1)
  .refine((value) => SPLAT_EMBED_HOST_PATTERN.test(value), "Only superspl.at viewer URLs can be embedded.");

export const SPLAT_SHOWCASE_CATEGORIES = ["showcase", "training", "stationCapture"] as const;
export type SplatShowcaseCategory = (typeof SPLAT_SHOWCASE_CATEGORIES)[number];

export const SPLAT_SHOWCASE_CATEGORY_LABELS: Record<SplatShowcaseCategory, string> = {
  showcase: "Showcase (what a splat is)",
  training: "Technician training",
  stationCapture: "Our station / room capture",
};

export const SplatShowcaseSchema = z.object({
  id: z.string().min(1),
  siteId: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(SPLAT_SHOWCASE_CATEGORIES),
  /** Public scene page (https://superspl.at/scene/<hash>); opens in a new tab. */
  sceneUrl: z.string().min(1).optional(),
  /** Frameable viewer URL: from the scene page's Embed dialog, or the scene page itself. */
  embedSrc: splatFrameUrl.optional(),
  /** Catalog code of the remote station this capture belongs to (remote-stations.ts codes only). */
  stationCode: z.string().min(1).optional(),
  /** Free-text target for room-level captures, e.g. "ESOC Power Plant" or "EAC ISS hall". */
  captureRef: z.string().min(1).optional(),
  description: z.string().optional(),
  addedBy: z.string().min(1),
  /** ISO timestamp. */
  addedAt: z.string().min(1),
  /** V69 (Section 119): last editor if the entry was edited after creation. */
  editedBy: z.string().min(1).optional(),
  /** ISO timestamp. */
  editedAt: z.string().min(1).optional(),
}).refine((entry) => !!entry.sceneUrl || !!entry.embedSrc, "Provide a scene URL or an embed code.");

export type SplatShowcase = z.infer<typeof SplatShowcaseSchema>;
