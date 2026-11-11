import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { buildWorkspaceAuthContextFromRequest } from 'src/engine/core-modules/auth/utils/build-workspace-auth-context-from-request.util';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { SunyieldManagementService } from 'src/modules/sunyield/management/sunyield-management.service';

@Controller('rest/sunyield/management')
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
export class SunyieldManagementController {
  constructor(private readonly service: SunyieldManagementService) {}

  @Get('visibility')
  visibility(@Req() request: Request) {
    return this.service.visibility(
      buildWorkspaceAuthContextFromRequest(request),
    );
  }

  @Get('access')
  access(@Req() request: Request, @Query() query: unknown) {
    return this.service.access(
      buildWorkspaceAuthContextFromRequest(request),
      query,
    );
  }

  @Post()
  @HttpCode(200)
  execute(@Req() request: Request, @Body() body: unknown) {
    return this.service.execute(
      buildWorkspaceAuthContextFromRequest(request),
      body,
    );
  }
}
