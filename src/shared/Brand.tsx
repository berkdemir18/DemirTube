type BrandMarkProps = { className?: string; size?: number };

/** Marka işareti: özgün geometri korunur, yalnızca gradyan düz oksit renge çevrildi. */
export function BrandMark({ className, size = 36 }: BrandMarkProps) {
  return (
    <svg aria-hidden="true" className={className} height={size} viewBox="0 0 100 100" width={size}>
      <rect width="100" height="100" rx="24" fill="#D9542B" />
      <rect x="30" y="22" width="14" height="56" rx="7" fill="#F7F2EF" />
      <rect x="44" y="22" width="40" height="56" rx="20" fill="#F7F2EF" />
      <path d="M58 42v16l14-8z" fill="#D9542B" />
    </svg>
  );
}

export function BrandName() {
  return <span className="brand-name">Demir<span>Tube</span></span>;
}
