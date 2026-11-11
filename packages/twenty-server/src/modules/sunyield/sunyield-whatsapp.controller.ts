import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { buildWorkspaceAuthContextFromRequest } from 'src/engine/core-modules/auth/utils/build-workspace-auth-context-from-request.util';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { SunyieldWhatsappService } from './sunyield-whatsapp.service';

@Controller('rest/sunyield/whatsapp')
@UseGuards(
  JwtAuthGuard,
  AuthPrincipalGuard({
    userSession: {
      standard: true,
      impersonated: false,
      playground: false,
      workspaceAgnostic: false,
    },
    oauthClient: false,
    application: false,
    apiKey: false,
  }),
  CustomPermissionGuard,
)
export class SunyieldWhatsappController {
  constructor(private readonly service: SunyieldWhatsappService) {}
  @Get('access')
  @Header('Cache-Control', 'no-store')
  access(@Req() request: Request) {
    return this.service.access(buildWorkspaceAuthContextFromRequest(request));
  }
  @Get('status')
  @Header('Cache-Control', 'no-store')
  status(@Req() request: Request) {
    return this.service.status(buildWorkspaceAuthContextFromRequest(request));
  }
  @Post('control')
  @Header('Cache-Control', 'no-store')
  control(
    @Req() request: Request,
    @Headers('origin') origin: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.control(
      buildWorkspaceAuthContextFromRequest(request),
      origin,
      body,
    );
  }
}
