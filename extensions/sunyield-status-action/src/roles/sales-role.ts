import { defineRole } from 'twenty-sdk/define';

export const salesRole = defineRole({
  universalIdentifier: '5343ae6a-fae0-4be6-9d5a-471e65fddc53',
  label: 'Sunyield Sales',
  description:
    'View CRM records. Use Update Status for assigned leads. Admins manage assignment.',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  permissionFlagUniversalIdentifiers: [],
});
