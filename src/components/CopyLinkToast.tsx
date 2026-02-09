import { memo } from 'react';

function CopyLinkToast({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="fixed bottom-6 left-1/2 -translate-x-1/2 z-10 bg-zinc-800 text-zinc-100 text-sm px-4 py-2 rounded-lg shadow-lg border border-zinc-700">
      Link copied!
    </p>
  );
}

export default memo(CopyLinkToast);
