/** Hand-drawn illustration for the hero: a laptop showing the school map, with a few soft floating shapes. Decorative only. */
export default function HeroArt() {
  return (
    <svg aria-hidden="true" viewBox="0 0 520 380" style={{ width: '100%', height: 'auto', maxWidth: 560 }}>
      <defs>
        <linearGradient id="ha-base" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#F1ECFD" />
          <stop offset="1" stopColor="#DCD4F5" />
        </linearGradient>
        <linearGradient id="ha-ball" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#9ED8F5" />
          <stop offset="1" stopColor="#5BA8E6" />
        </linearGradient>
      </defs>
      {/* floating shapes */}
      <rect x="318" y="26" width="46" height="40" rx="14" fill="#F6B8C0" transform="rotate(-12 341 46)" />
      <rect x="388" y="50" width="34" height="30" rx="11" fill="#F8D27A" transform="rotate(10 405 65)" />
      <rect x="450" y="28" width="42" height="36" rx="13" fill="#CFC6F5" transform="rotate(8 471 46)" />
      <circle cx="300" cy="86" r="4" fill="#F6B8C0" />
      <circle cx="430" cy="110" r="3" fill="#8FD3BC" />
      <circle cx="260" cy="40" r="3" fill="#CFC6F5" />
      {/* shadow */}
      <ellipse cx="300" cy="300" rx="190" ry="20" fill="#CFC6F5" opacity="0.45" />
      {/* ball with a small tree */}
      <line x1="112" y1="112" x2="112" y2="150" stroke="#6FB58F" strokeWidth="4" strokeLinecap="round" />
      <circle cx="112" cy="100" r="17" fill="#7CCBA0" />
      <ellipse cx="112" cy="196" rx="40" ry="36" fill="url(#ha-ball)" />
      <ellipse cx="100" cy="184" rx="12" ry="8" fill="#FFFFFF" opacity="0.45" />
      {/* laptop */}
      <rect x="170" y="70" width="270" height="176" rx="16" fill="#FFFFFF" stroke="#D9D2F2" strokeWidth="2" />
      <rect x="182" y="82" width="246" height="152" rx="9" fill="#F6F3FF" />
      <circle cx="194" cy="93" r="3" fill="#F6B8C0" />
      <circle cx="205" cy="93" r="3" fill="#F8D27A" />
      <circle cx="216" cy="93" r="3" fill="#8FD3BC" />
      {/* map */}
      <rect x="190" y="104" width="160" height="122" rx="9" fill="#E3F3E8" />
      <path d="M190 190 C 230 170, 270 205, 350 178 V 226 H 190 Z" fill="#CFE6F7" />
      <path d="M200 112 L 262 160 L 340 126" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <path d="M232 106 V 224" fill="none" stroke="#FFFFFF" strokeWidth="4" />
      <path d="M205 150 C 250 140, 290 150, 345 140" fill="none" stroke="#7CA8F0" strokeWidth="3" strokeDasharray="5 5" strokeLinecap="round" />
      <circle cx="226" cy="132" r="9" fill="#6B54C9" />
      <text x="226" y="136" textAnchor="middle" fontFamily="Figtree, sans-serif" fontSize="11" fontWeight="700" fill="#FFFFFF">1</text>
      <circle cx="288" cy="170" r="9" fill="#6B54C9" />
      <text x="288" y="174" textAnchor="middle" fontFamily="Figtree, sans-serif" fontSize="11" fontWeight="700" fill="#FFFFFF">2</text>
      <circle cx="326" cy="132" r="9" fill="#6B54C9" />
      <text x="326" y="136" textAnchor="middle" fontFamily="Figtree, sans-serif" fontSize="11" fontWeight="700" fill="#FFFFFF">3</text>
      <circle cx="262" cy="150" r="7" fill="#E5484D" stroke="#FFFFFF" strokeWidth="2" />
      {/* side card */}
      <rect x="360" y="104" width="60" height="122" rx="9" fill="#E8E3FB" />
      <rect x="368" y="114" width="26" height="9" rx="4.5" fill="#F8D27A" />
      <rect x="368" y="132" width="44" height="6" rx="3" fill="#C9C0F0" />
      <rect x="368" y="146" width="36" height="6" rx="3" fill="#C9C0F0" />
      <rect x="368" y="168" width="44" height="22" rx="7" fill="#FFFFFF" />
      <rect x="368" y="196" width="44" height="22" rx="7" fill="#FFFFFF" />
      {/* base */}
      <path d="M140 246 H 470 L 458 266 Q 455 272 448 272 H 162 Q 155 272 152 266 Z" fill="url(#ha-base)" stroke="#D9D2F2" strokeWidth="2" />
      <rect x="276" y="246" width="58" height="6" rx="3" fill="#CFC6F0" />
      {/* papers */}
      <g transform="rotate(-10 400 310)">
        <rect x="350" y="276" width="110" height="66" rx="9" fill="#FFFFFF" stroke="#E4DEF6" />
        <rect x="362" y="288" width="50" height="8" rx="4" fill="#F8D27A" />
        <rect x="362" y="304" width="86" height="6" rx="3" fill="#E4DEF6" />
        <rect x="362" y="318" width="64" height="6" rx="3" fill="#E4DEF6" />
      </g>
      {/* plant */}
      <path d="M462 214 C 450 190, 452 168, 466 150 C 476 170, 476 194, 462 214 Z" fill="#7CCBA0" />
      <path d="M470 214 C 486 196, 496 178, 494 160 C 478 172, 470 192, 470 214 Z" fill="#5FB58A" />
      <path d="M442 244 H 498 L 492 276 Q 490 282 484 282 H 456 Q 450 282 448 276 Z" fill="#F4C25B" />
    </svg>
  );
}
