import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { MAX_IMAGE_BYTES, imagePath } from "./media.constants";

/** Checks the file's own header, so a mislabelled upload can't be served as an image. */
function sniffImageType(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadImage(tenantId: string, userId: string, contentType: string, base64: string) {
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length === 0) throw new BadRequestException("The image is empty");
    if (bytes.length > MAX_IMAGE_BYTES) throw new BadRequestException("The image is too large (max 2 MB)");
    const actual = sniffImageType(bytes);
    if (!actual || actual !== contentType) {
      throw new BadRequestException("That file isn't a JPEG, PNG or WebP image");
    }

    const image = await this.prisma.storedImage.create({
      data: { tenantId, contentType, bytes, uploadedByUserId: userId },
      select: { id: true },
    });
    return { id: image.id, url: imagePath(image.id) };
  }

  async getImage(id: string) {
    const image = await this.prisma.storedImage.findUnique({
      where: { id },
      select: { contentType: true, bytes: true },
    });
    if (!image) throw new NotFoundException("Image not found");
    return image;
  }
}
