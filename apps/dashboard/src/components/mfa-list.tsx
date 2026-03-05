export function MFAListSkeleton() {
  return (
    <div className="flex justify-between items-center h-[36px]">
      <div className="h-4 w-[200px] animate-pulse rounded bg-muted" />
    </div>
  );
}

export async function MFAList() {
  return (
    <div className="text-sm text-[#606060]">
      MFA devices are managed in Zitadel.
    </div>
  );
}
