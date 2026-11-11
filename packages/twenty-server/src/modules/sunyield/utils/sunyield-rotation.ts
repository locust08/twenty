import { doNotTranslate } from 'twenty-shared/i18n';
import { SUNYIELD_WORKSPACE_ID } from 'src/modules/sunyield/authorize-sunyield-status';

const SUNYIELD_ROTATION_STEP_ID = 'ce86d209-38c0-4f28-8f5c-a1ed5457b223';

export const isSunyieldDynamicRotation = ({
  workspaceId,
  stepId,
  objectName,
  strategy,
}: {
  workspaceId: string;
  stepId: string;
  objectName: unknown;
  strategy: unknown;
}) =>
  workspaceId === SUNYIELD_WORKSPACE_ID &&
  stepId === SUNYIELD_ROTATION_STEP_ID &&
  objectName === 'salesperson' &&
  strategy === 'ROUND_ROBIN';

type RotationCandidate = {
  id: string;
  active?: unknown;
  rotationOrder?: unknown;
};

export const orderSunyieldRotationCandidates = <
  TCandidate extends RotationCandidate,
>(
  records: readonly TCandidate[],
): TCandidate[] => {
  const orders = new Set<number>();
  const active = records.filter((record) => record.active === true);
  if (active.length === 0)
    throw new Error(
      doNotTranslate(
        'Sunyield rotation requires at least one active salesperson.',
      ),
    );
  const ordered = active.map((record) => {
    const order = record.rotationOrder;
    if (
      typeof order !== 'number' ||
      !Number.isSafeInteger(order) ||
      order <= 0 ||
      orders.has(order)
    )
      throw new Error(
        doNotTranslate(
          'Each active Sunyield salesperson requires a unique positive integer Rotation order.',
        ),
      );
    orders.add(order);
    return { record, order };
  });
  return ordered
    .sort((left, right) => left.order - right.order)
    .map((item) => item.record);
};
