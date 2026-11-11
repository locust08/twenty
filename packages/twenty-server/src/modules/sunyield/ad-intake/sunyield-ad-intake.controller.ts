import {
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Query,
  type RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { type Request } from 'express';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { SunyieldAdIntakeService } from './sunyield-ad-intake.service';

@Controller('webhooks/sunyield')
@UseGuards(PublicEndpointGuard, CustomPermissionGuard)
export class SunyieldAdIntakeController {
  constructor(private readonly service: SunyieldAdIntakeService) {}

  @Get('meta')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  verifyMeta(@Query() query: unknown): string {
    return this.service.verifyMeta(query);
  }

  @Post('meta')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async receiveMeta(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ): Promise<Record<string, never>> {
    await this.service.receiveMeta(request.rawBody, signature);
    return {};
  }

  @Post('google-ads')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async receiveGoogle(
    @Req() request: RawBodyRequest<Request>,
  ): Promise<Record<string, never>> {
    await this.service.receiveGoogle(request.rawBody);
    return {};
  }
}
