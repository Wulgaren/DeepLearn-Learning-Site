type ShareButtonProps = {
  threadId: string;
  copyLink: (id: string) => Promise<void>;
  /** Set when button is inside a Link to prevent navigation */
  stopPropagation?: boolean;
};

export default function ShareButton({ threadId, copyLink, stopPropagation }: ShareButtonProps) {
  function handleClick(e: React.MouseEvent) {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    void copyLink(threadId);
  }

  return (
    <button type="button" onClick={handleClick} className="hover:text-zinc-300">
      Share
    </button>
  );
}
