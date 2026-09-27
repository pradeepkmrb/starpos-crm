export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Phones resize before uploading, so anything bigger is a mistake, not a photo. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Stored image references look like this — anything else is rejected where a photo is saved. */
export const IMAGE_PATH_PATTERN = /^\/media\/images\/[a-z0-9]{20,40}$/;

export function imagePath(id: string) {
  return `/media/images/${id}`;
}
