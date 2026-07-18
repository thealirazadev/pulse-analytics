import type { Site } from "@/lib/db/schema";

export interface SiteDTO {
  id: string;
  domain: string;
  name: string;
  createdAt: string;
  verifiedAt: string | null;
}

/** Map a site row to its public API shape (public id, ISO timestamps). */
export function serializeSite(row: Site): SiteDTO {
  return {
    id: row.publicId,
    domain: row.domain,
    name: row.name,
    createdAt: new Date(row.createdAt).toISOString(),
    verifiedAt: row.verifiedAt ? new Date(row.verifiedAt).toISOString() : null,
  };
}
