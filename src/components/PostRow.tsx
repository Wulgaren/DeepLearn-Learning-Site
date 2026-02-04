import { Link } from 'react-router-dom';

const avatarClasses = {
  AI: 'h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 shrink-0',
  You:
    'h-10 w-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs text-zinc-400 shrink-0',
};

const bodyClampClasses = {
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  none: '',
} as const;

type PostRowBase = {
  label: string;
  meta?: string;
  body: string;
  lineClamp?: 2 | 3 | 'none';
  avatar?: 'AI' | 'You';
  actions?: React.ReactNode;
  extra?: React.ReactNode;
  bodyClassName?: string;
  actionClassName?: string;
  className?: string;
};

type PostRowAsDiv = PostRowBase & { as: 'div' };
type PostRowAsLink = PostRowBase & { as: 'link'; to: string };
type PostRowAsButton = PostRowBase & { as: 'button'; onClick?: () => void; disabled?: boolean };

export type PostRowProps = PostRowAsDiv | PostRowAsLink | PostRowAsButton;

export default function PostRow(props: PostRowProps) {
  const {
    label,
    meta,
    body,
    lineClamp = 'none',
    avatar = 'AI',
    actions,
    extra,
    bodyClassName = '',
    actionClassName = 'mt-2 flex items-center gap-4 text-xs text-zinc-500',
    className = '',
  } = props;

  const rowContent = (
    <>
      <div className={avatarClasses[avatar]}>{avatar}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-zinc-100">{label}</span>
          {meta != null && (
            <>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-500 text-xs">{meta}</span>
            </>
          )}
        </div>
        <p
          className={
            bodyClassName
              ? `m-0 ${bodyClassName}`.trim()
              : `m-0 mt-1 text-sm leading-relaxed text-zinc-200 ${bodyClampClasses[lineClamp]}`.trim()
          }
        >
          {body}
        </p>
        {extra}
        {actions != null && <div className={actionClassName}>{actions}</div>}
      </div>
    </>
  );

  const baseClasses = 'flex gap-3 px-1 py-4';

  if (props.as === 'link') {
    return (
      <Link
        to={props.to}
        className={`block no-underline text-inherit hover:bg-zinc-950/60 transition ${baseClasses} ${className}`.trim()}
      >
        {rowContent}
      </Link>
    );
  }

  if (props.as === 'button') {
    return (
      <button
        type="button"
        onClick={props.onClick}
        disabled={props.disabled}
        className={`w-full text-left hover:bg-zinc-950/60 transition border-b border-zinc-800/80 last:border-b-0 disabled:opacity-70 ${baseClasses} ${className}`.trim()}
      >
        {rowContent}
      </button>
    );
  }

  return (
    <div className={`${baseClasses} ${className}`.trim()}>
      {rowContent}
    </div>
  );
}
