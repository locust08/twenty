import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

@Processor(MessageQueue.emailQueue)
export class SunyieldWorkerProbeJob {
  @Process(SunyieldWorkerProbeJob.name)
  async handle(): Promise<void> {
    // Completion proves the real worker is consuming jobs without touching CRM data.
  }
}
