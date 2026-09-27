import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Request, Response } from "express";
import { MediaService } from "./media.service";
import { UploadImageDto } from "./dto/upload-image.dto";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import "../../common/request-context";

@Controller("media")
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post("images")
  @UseGuards(JwtAuthGuard)
  upload(@Req() req: Request, @Body() dto: UploadImageDto) {
    const { tenantId, userId } = req.tenantContext!;
    return this.mediaService.uploadImage(tenantId, userId, dto.contentType, dto.data);
  }

  /**
   * Public, like a CDN link: the id is an unguessable cuid and images are
   * never edited in place (a new photo gets a new id), so they cache forever.
   */
  @Get("images/:id")
  async serve(@Param("id") id: string, @Res() res: Response) {
    const image = await this.mediaService.getImage(id);
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(image.bytes));
  }
}
