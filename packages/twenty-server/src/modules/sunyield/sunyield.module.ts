import { SunyieldWhatsappFeedService } from './sunyield-whatsapp-feed.service';
import { SunyieldWhatsappFeedController } from './sunyield-whatsapp-feed.controller';
import { SunyieldWhatsappController } from './sunyield-whatsapp.controller';
import { SunyieldWhatsappService } from './sunyield-whatsapp.service';
import { Module } from '@nestjs/common';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { SunyieldStatusController } from 'src/modules/sunyield/sunyield-status.controller';
import { SunyieldStatusService } from 'src/modules/sunyield/sunyield-status.service';
import { SunyieldManagementController } from 'src/modules/sunyield/management/sunyield-management.controller';
import { SunyieldManagementService } from 'src/modules/sunyield/management/sunyield-management.service';
import { SunyieldManagementStore } from 'src/modules/sunyield/management/sunyield-management.store';
import { SecureHttpClientModule } from 'src/engine/core-modules/secure-http-client/secure-http-client.module';
import { SunyieldAdIntakeController } from 'src/modules/sunyield/ad-intake/sunyield-ad-intake.controller';
import { SunyieldAdIntakeService } from 'src/modules/sunyield/ad-intake/sunyield-ad-intake.service';
import { SunyieldAdIntakeJob } from 'src/modules/sunyield/ad-intake/sunyield-ad-intake.job';
import { SunyieldAdIntakeStore } from 'src/modules/sunyield/ad-intake/sunyield-ad-intake.store';

@Module({
  imports: [TokenModule, WorkspaceCacheStorageModule, SecureHttpClientModule],
  controllers: [
    SunyieldAdIntakeController,
    SunyieldManagementController,
    SunyieldStatusController,
    SunyieldWhatsappController,
    SunyieldWhatsappFeedController,
  ],
  providers: [
    SunyieldAdIntakeService,
    SunyieldAdIntakeJob,
    SunyieldAdIntakeStore,
    SunyieldManagementService,
    SunyieldManagementStore,
    SunyieldStatusService,
    SunyieldWhatsappService,
    SunyieldWhatsappFeedService,
  ],
})
export class SunyieldModule {}
