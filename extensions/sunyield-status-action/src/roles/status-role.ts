import { defineApplicationRole } from 'twenty-sdk/define';
import {
  LEAD_OBJECT_UNIVERSAL_IDENTIFIER,
  PROTECTED_FIELD_UNIVERSAL_IDENTIFIERS,
  ROLE_IDENTIFIER,
} from '../deployment-config';

export const statusRole = defineApplicationRole({
  universalIdentifier: ROLE_IDENTIFIER,
  label: 'Sunyield status action service',
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canBeAssignedToUsers: false,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: LEAD_OBJECT_UNIVERSAL_IDENTIFIER
    ? [
        {
          objectUniversalIdentifier: LEAD_OBJECT_UNIVERSAL_IDENTIFIER,
          canReadObjectRecords: true,
          canUpdateObjectRecords: false,
          canSoftDeleteObjectRecords: false,
          canDestroyObjectRecords: false,
        },
      ]
    : [],
  fieldPermissions: [LEAD_OBJECT_UNIVERSAL_IDENTIFIER].flatMap(
    (objectUniversalIdentifier) =>
      objectUniversalIdentifier
        ? PROTECTED_FIELD_UNIVERSAL_IDENTIFIERS.map(
            (fieldUniversalIdentifier) => ({
              objectUniversalIdentifier,
              fieldUniversalIdentifier,
              canUpdateFieldValue: false,
            }),
          )
        : [],
  ),
  permissionFlagUniversalIdentifiers: [],
});
