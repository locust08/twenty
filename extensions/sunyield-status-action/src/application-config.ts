import { defineApplication } from 'twenty-sdk/define';
import { APPLICATION_IDENTIFIER } from './deployment-config';

export const application = defineApplication({
  universalIdentifier: APPLICATION_IDENTIFIER,
  displayName: 'Sunyield Status Action',
  description: 'Update the status of your assigned Sunyield leads.',
});
