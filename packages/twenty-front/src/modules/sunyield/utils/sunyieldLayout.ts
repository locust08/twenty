export const getSunyieldNavigationObjects = (isAdmin: boolean): string[] =>
  isAdmin
    ? ['lead', 'task', 'salesperson', 'dashboard', 'workflow']
    : ['lead', 'task'];

export const getSunyieldFieldOrder = (
  objectName: string,
  surface: 'index' | 'details',
  isAdmin: boolean,
): string[] | undefined => {
  switch (objectName) {
    case 'lead':
      return surface === 'index'
        ? [
            'name',
            'status',
            'rawPhone',
            'area',
            'leadType',
            'source',
            'assignedSalesperson',
          ]
        : [
            'status',
            'rawPhone',
            'area',
            'postcode',
            'region',
            'electricityBillResponse',
            'electricityBillAmount',
            'leadType',
            'source',
            'assignedSalesperson',
          ];
    case 'task':
      return surface === 'index'
        ? [
            'title',
            'status',
            'dueAt',
            'taskTargets',
            ...(isAdmin ? ['assignee'] : []),
          ]
        : undefined;
    case 'salesperson':
      return [
        'name',
        'active',
        'rotationOrder',
        'workspaceMember',
        'whatsappNumber',
      ];
    default:
      return undefined;
  }
};

export const arrangeSunyieldFields = <TField>(
  fields: TField[],
  getName: (field: TField) => string,
  objectName: string,
  surface: 'index' | 'details',
  isAdmin: boolean,
): TField[] => {
  const order = getSunyieldFieldOrder(objectName, surface, isAdmin);
  if (!order) return fields;
  return fields
    .filter((field) => order.includes(getName(field)))
    .sort(
      (first, second) =>
        order.indexOf(getName(first)) - order.indexOf(getName(second)),
    );
};
