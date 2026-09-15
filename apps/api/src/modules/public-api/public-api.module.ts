import { Module, forwardRef } from "@nestjs/common";
import { PublicApiController } from "./public-api.controller";
import { PublicMessagesService } from "./public-messages.service";
import { PublicContactsService } from "./public-contacts.service";
import { PublicWorkspaceService } from "./public-workspace.service";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { ChannelsModule } from "../channels/channels.module";
import { MessagesModule } from "../messages/messages.module";
import { ContactsModule } from "../contacts/contacts.module";

/**
 * forwardRef on ChannelsModule: it already forwardRefs WhatsappModule, which
 * this module also imports, so the cycle has to be broken on one side.
 */
@Module({
  imports: [WhatsappModule, forwardRef(() => ChannelsModule), MessagesModule, ContactsModule],
  controllers: [PublicApiController],
  providers: [PublicMessagesService, PublicContactsService, PublicWorkspaceService],
})
export class PublicApiModule {}
