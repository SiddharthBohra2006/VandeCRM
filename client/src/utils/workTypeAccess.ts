type WorkTypeKey = { key: string };
type RecipientAccess = { workTypeKeys?: string[] } | undefined;

export function getAvailableWorkTypes<T extends WorkTypeKey>(workTypes: T[], recipient: RecipientAccess): T[] {
  return recipient?.workTypeKeys
    ? workTypes.filter(type => recipient.workTypeKeys!.includes(type.key))
    : workTypes;
}
