import { defineCommandMenuItem, numberOfSelectedRecords } from 'twenty-sdk/define';
import {
  COMMAND_IDENTIFIER,
  FRONT_IDENTIFIER,
  LEAD_OBJECT_UNIVERSAL_IDENTIFIER,
} from '../deployment-config';

export const statusCommand = defineCommandMenuItem({
  universalIdentifier: COMMAND_IDENTIFIER,
  label: 'Update Status',
  shortLabel: 'Update Status',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  conditionalAvailabilityExpression: numberOfSelectedRecords === 1,
  ...(LEAD_OBJECT_UNIVERSAL_IDENTIFIER
    ? {
        availabilityObjectUniversalIdentifier: LEAD_OBJECT_UNIVERSAL_IDENTIFIER,
      }
    : { conditionalAvailabilityExpression: false }),
  frontComponentUniversalIdentifier: FRONT_IDENTIFIER,
});
