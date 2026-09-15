import { BadRequestException } from "@nestjs/common";
import { buildInteractive, buildTemplateComponents } from "./public-messages.service";
import { countPlaceholders } from "./public-workspace.service";
import { normalizeWhatsappNumber } from "../../common/phone";
import type { SendTemplateDto } from "./dto/send-template.dto";
import type { SendInteractiveDto } from "./dto/send-interactive.dto";

function templateDto(overrides: Partial<SendTemplateDto> = {}): SendTemplateDto {
  return { to: "+919876543210", templateName: "order_shipped", ...overrides } as SendTemplateDto;
}

function interactiveDto(overrides: Partial<SendInteractiveDto> = {}): SendInteractiveDto {
  return {
    to: "+919876543210",
    type: "button",
    bodyText: "Pick one",
    ...overrides,
  } as SendInteractiveDto;
}

describe("buildTemplateComponents", () => {
  it("returns nothing when the template takes no variables", () => {
    expect(buildTemplateComponents(templateDto())).toEqual([]);
  });

  it("maps bodyVariables to positional text parameters, in order", () => {
    const components = buildTemplateComponents(templateDto({ bodyVariables: ["Priya", "1425"] }));
    expect(components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "Priya" },
          { type: "text", text: "1425" },
        ],
      },
    ]);
  });

  it("builds a media header and puts it before the body", () => {
    const components = buildTemplateComponents(
      templateDto({
        headerMedia: { type: "image", link: "https://cdn.example.com/parcel.jpg" },
        bodyVariables: ["Priya"],
      }),
    );
    expect(components[0]).toEqual({
      type: "header",
      parameters: [{ type: "image", image: { link: "https://cdn.example.com/parcel.jpg" } }],
    });
    expect(components[1]).toMatchObject({ type: "body" });
  });

  it("carries filename on a document header only", () => {
    const [header] = buildTemplateComponents(
      templateDto({
        headerMedia: { type: "document", link: "https://cdn.example.com/i.pdf", filename: "invoice.pdf" },
      }),
    );
    expect(header).toEqual({
      type: "header",
      parameters: [
        { type: "document", document: { link: "https://cdn.example.com/i.pdf", filename: "invoice.pdf" } },
      ],
    });

    const [imageHeader] = buildTemplateComponents(
      templateDto({
        headerMedia: { type: "image", link: "https://cdn.example.com/i.jpg", filename: "ignored.jpg" },
      }),
    );
    expect(imageHeader).toEqual({
      type: "header",
      parameters: [{ type: "image", image: { link: "https://cdn.example.com/i.jpg" } }],
    });
  });

  it("prefers media over text for the header when both are given", () => {
    const components = buildTemplateComponents(
      templateDto({
        headerMedia: { type: "image", link: "https://cdn.example.com/a.jpg" },
        headerVariables: ["unused"],
      }),
    );
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ parameters: [{ type: "image" }] });
  });

  it("gives each URL button its own indexed component", () => {
    const components = buildTemplateComponents(
      templateDto({ buttonUrlVariables: ["track/1425", "track/1426"] }),
    );
    expect(components).toEqual([
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "track/1425" }] },
      { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: "track/1426" }] },
    ]);
  });
});

describe("buildInteractive", () => {
  it("wraps reply buttons in Meta's action shape", () => {
    const interactive = buildInteractive(
      interactiveDto({
        footerText: "Acme",
        buttons: [
          { id: "pickup", title: "Store pickup" },
          { id: "delivery", title: "Home delivery" },
        ],
      }),
    );
    expect(interactive).toEqual({
      type: "button",
      body: { text: "Pick one" },
      footer: { text: "Acme" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "pickup", title: "Store pickup" } },
          { type: "reply", reply: { id: "delivery", title: "Home delivery" } },
        ],
      },
    });
  });

  it("rejects a button message with no buttons", () => {
    expect(() => buildInteractive(interactiveDto({ buttons: [] }))).toThrow(BadRequestException);
  });

  it("rejects a list message with no sections", () => {
    expect(() => buildInteractive(interactiveDto({ type: "list" }))).toThrow(BadRequestException);
  });

  it("defaults the list's button label and drops empty optional fields", () => {
    const interactive = buildInteractive(
      interactiveDto({
        type: "list",
        headerText: "Menu",
        sections: [{ rows: [{ id: "r1", title: "Row one" }] }],
      }),
    ) as { header: unknown; action: { button: string; sections: { rows: unknown[] }[] } };

    expect(interactive.header).toEqual({ type: "text", text: "Menu" });
    expect(interactive.action.button).toBe("Choose");
    expect(interactive.action.sections[0]).toEqual({ rows: [{ id: "r1", title: "Row one" }] });
  });
});

describe("countPlaceholders", () => {
  it("counts by the highest index, not by occurrences", () => {
    expect(countPlaceholders("Hi {{1}}, order {{2}} shipped. Thanks {{1}}!")).toBe(2);
  });

  it("tolerates whitespace inside the braces", () => {
    expect(countPlaceholders("Hi {{ 1 }} and {{3}}")).toBe(3);
  });

  it("is zero for a body with no variables", () => {
    expect(countPlaceholders("Your order shipped.")).toBe(0);
  });
});

describe("normalizeWhatsappNumber", () => {
  it.each([
    ["+91 98765-43210", "919876543210"],
    ["+1 (555) 010.9999", "15550109999"],
    ["919876543210", "919876543210"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeWhatsappNumber(input)).toBe(expected);
  });

  it.each(["", "not-a-number", "0123456789", "12345"])("rejects %s", (input) => {
    expect(normalizeWhatsappNumber(input)).toBeNull();
  });
});
