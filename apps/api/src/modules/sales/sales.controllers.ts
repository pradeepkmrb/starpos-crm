import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { JwtAuthGuard } from "../memberships/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import { MetaApiExceptionFilter } from "../whatsapp/meta-api-exception.filter";
import "../../common/request-context";
import { CatalogueEnquiriesService } from "./catalogue-enquiries.service";
import { CatalogueEnquiryDto } from "./dto/catalogue-enquiry.dto";
import {
  BusinessProfileDto,
  CreatePaymentDto,
  CreateQuotationDto,
  SetTargetDto,
  UpdateQuotationDto,
} from "./dto/sales.dto";
import { QuotationsService } from "./quotations.service";
import { PaymentsService } from "./payments.service";
import { TargetsService } from "./targets.service";
import { renderQuotationPdf } from "./quotation-pdf";

/**
 * Where WhatsApp and customers fetch quote PDFs from. PUBLIC_API_URL wins;
 * otherwise the request's own origin, honouring the proxy's forwarded scheme.
 */
function publicBaseUrl(req: Request): string {
  if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL;
  const forwarded = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${forwarded || req.protocol}://${req.get("host")}`;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

@Controller("quotations")
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(MetaApiExceptionFilter)
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query("leadId") leadId?: string,
    @Query("status") status?: string,
  ) {
    const base = publicBaseUrl(req);
    const rows = await this.quotations.list(req.tenantContext!, { leadId, status });
    return rows.map((q) => ({ ...q, pdfUrl: this.quotations.pdfUrl(base, q.shareToken) }));
  }

  /** Declared before :id so "settings" isn't read as a quotation id. */
  @Get("settings")
  settings(@Req() req: Request) {
    return this.quotations.profile(req.tenantContext!.tenantId);
  }

  @Put("settings")
  @Roles("admin")
  saveSettings(@Req() req: Request, @Body() dto: BusinessProfileDto) {
    return this.quotations.saveProfile(req.tenantContext!.tenantId, dto);
  }

  @Get(":id")
  async get(@Req() req: Request, @Param("id") id: string) {
    const q = await this.quotations.get(req.tenantContext!, id);
    return { ...q, pdfUrl: this.quotations.pdfUrl(publicBaseUrl(req), q.shareToken) };
  }

  @Post()
  @Roles("agent")
  async create(@Req() req: Request, @Body() dto: CreateQuotationDto) {
    const q = await this.quotations.create(req.tenantContext!, dto);
    return { ...q, pdfUrl: this.quotations.pdfUrl(publicBaseUrl(req), q.shareToken) };
  }

  @Patch(":id")
  @Roles("agent")
  async update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateQuotationDto) {
    const q = await this.quotations.update(req.tenantContext!, id, dto);
    return { ...q, pdfUrl: this.quotations.pdfUrl(publicBaseUrl(req), q.shareToken) };
  }

  @Delete(":id")
  @Roles("agent")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.quotations.remove(req.tenantContext!, id);
  }

  /** Sends the PDF over WhatsApp, or explains why not and returns a share link. */
  @Post(":id/send")
  @Roles("agent")
  send(@Req() req: Request, @Param("id") id: string) {
    return this.quotations.send(req.tenantContext!, id, publicBaseUrl(req));
  }
}

/**
 * Deliberately unguarded, like the public catalogue: WhatsApp's servers and
 * the customer open this link. The token is 144 random bits, so a quote can
 * only be read by someone it was shared with.
 */
@Controller("public/quotations")
export class PublicQuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get(":token/pdf")
  async pdf(@Param("token") token: string, @Res() res: Response) {
    const q = await this.quotations.forPdf(token);
    const pdf = await renderQuotationPdf(q);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${q.number}.pdf"`);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.end(pdf);
  }
}

@Controller("payments")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(
    @Req() req: Request,
    @Query("leadId") leadId?: string,
    @Query("quotationId") quotationId?: string,
    @Query("collector") collector?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.payments.list(req.tenantContext!, { leadId, quotationId, collector, from, to });
  }

  @Post()
  @Roles("agent")
  create(@Req() req: Request, @Body() dto: CreatePaymentDto) {
    return this.payments.create(req.tenantContext!, dto);
  }

  @Delete(":id")
  @Roles("agent")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.payments.remove(req.tenantContext!, id);
  }
}

@Controller("targets")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TargetsController {
  constructor(private readonly targets: TargetsService) {}

  /** The month's team and per-rep targets with progress; defaults to the current month. */
  @Get()
  async board(@Req() req: Request, @Query("month") month?: string) {
    if (month && !MONTH_RE.test(month)) throw new BadRequestException("month must look like 2026-09");
    const ctx = req.tenantContext!;
    return this.targets.board(ctx, month ?? (await this.targets.currentMonth(ctx.tenantId)));
  }

  @Put()
  @Roles("admin")
  set(@Req() req: Request, @Body() dto: SetTargetDto) {
    return this.targets.set(req.tenantContext!, dto);
  }
}

/**
 * Unguarded, like the catalogue it sits behind: the "Request a quote" form on
 * /catalogue/<slug>. It can only create a lead, a draft quote and a note in
 * that one workspace, and is rate limited per shopper and per workspace.
 */
@Controller("public/catalogue")
export class PublicCatalogueEnquiriesController {
  constructor(private readonly enquiries: CatalogueEnquiriesService) {}

  @Post(":slug/enquiries")
  submit(@Param("slug") slug: string, @Body() dto: CatalogueEnquiryDto, @Req() req: Request) {
    // Railway's proxy puts the shopper's address first in X-Forwarded-For.
    const forwarded = req.headers["x-forwarded-for"];
    const clientKey = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || req.ip || "unknown";
    return this.enquiries.submit(slug, dto, clientKey);
  }
}
