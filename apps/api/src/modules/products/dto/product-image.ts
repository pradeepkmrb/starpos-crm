/** An http(s) link, or the path an upload to /media/images returned. */
export const PRODUCT_IMAGE_PATTERN = /^(https?:\/\/\S+|\/media\/images\/[a-z0-9]{20,40})$/;
export const PRODUCT_IMAGE_MESSAGE = "imageUrl must be an http(s) URL or an uploaded image";
