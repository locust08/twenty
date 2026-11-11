import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { buildWorkspaceAuthContextFromRequest } from 'src/engine/core-modules/auth/utils/build-workspace-auth-context-from-request.util';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { SunyieldStatusService } from 'src/modules/sunyield/sunyield-status.service';

@Controller('rest/sunyield')
@UseGuards(
  JwtAuthGuard,
  AuthPrincipalGuard({
    userSession: {
      standard: true,
      impersonated: false,
      playground: false,
      workspaceAgnostic: false,
    },
    oauthClient: true,
    application: true,
    apiKey: false,
  }),
  CustomPermissionGuard,
)
export class SunyieldStatusController {
  constructor(private readonly sunyieldStatusService: SunyieldStatusService) {}

  @Post('status')
  @HttpCode(200)
  update(@Req() request: Request, @Body() body: unknown) {
    return this.sunyieldStatusService.update(
      buildWorkspaceAuthContextFromRequest(request),
      body,
    );
  }
}
