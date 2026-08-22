type BrandMarkProps = { className?: string; size?: number };

export function BrandMark({ className, size = 36 }: BrandMarkProps) {
  return (
    <svg aria-hidden="true" className={className} height={size} viewBox="0 0 100 100" width={size}>
      <defs>
        <linearGradient id="demirtube-mark-gradient" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#00c9d4" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill="url(#demirtube-mark-gradient)" />
      <rect x="30" y="22" width="14" height="56" rx="7" fill="#f7f8fc" />
      <rect x="44" y="22" width="40" height="56" rx="20" fill="#f7f8fc" />
      <path d="M58 42v16l14-8z" fill="url(#demirtube-mark-gradient)" />
    </svg>
  );
}

export function BrandName() {
  return <span className="brand-name">Demir<span>Tube</span></span>;
}
