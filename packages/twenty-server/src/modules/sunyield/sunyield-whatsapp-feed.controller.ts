import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import {
  Controller,
  Get,
  Header,
  Headers,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SunyieldWhatsappFeedService } from './sunyield-whatsapp-feed.service';
// This fixed feed authenticates a read-only integration secret instead of a user JWT.
@Controller('sunyield-integration')
@UseGuards(PublicEndpointGuard, CustomPermissionGuard)
export class SunyieldWhatsappFeedController {
  constructor(private readonly service: SunyieldWhatsappFeedService) {}
  @Get('lead-feed')
  @Header('Cache-Control', 'no-store')
  read(
    @Headers('x-sunyield-feed-key') authorization: string | undefined,
    @Query() query: unknown,
  ) {
    return this.service.read(authorization, query);
  }
}
