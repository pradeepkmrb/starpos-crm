import { IsObject } from "class-validator";

export class ConnectIntegrationDto {
  /**
   * The provider's fields, keyed as the catalog declares them. Validated
   * against that spec in integration-credentials.ts rather than here, since
   * which fields exist depends on the provider in the URL.
   */
  @IsObject()
  credentials!: Record<string, unknown>;
}
