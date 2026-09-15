import { Module } from "@nestjs/common";
import { PublicApiController } from "./public-api.controller";
import { PublicMessagesService } from "./public-messages.service";
import { PublicContactsService } from "./public-contacts.service";
import { PublicWorkspaceService } from "./public-workspace.service";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { MessagesModule } from "../messages/messages.module";
import { ContactsModule } from "../contacts/contacts.module";

@Module({
  imports: [WhatsappModule, MessagesModule, ContactsModule],
  controllers: [PublicApiController],
  providers: [PublicMessagesService, PublicContactsService, PublicWorkspaceService],
})
export class PublicApiModule {}
