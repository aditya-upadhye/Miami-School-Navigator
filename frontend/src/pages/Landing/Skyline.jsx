import { useI18n } from '../../i18n';

export default function Skyline() {
  const { t, lang } = useI18n();
  // Longer Spanish and Creole words are squeezed into the flag/sign they sit on instead of overflowing it.
  const fit = (w) => (lang === 'en' ? {} : { textLength: w, lengthAdjust: 'spacingAndGlyphs' });
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMinYMax slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', filter: 'var(--scene-filter)' }}
    >
      <circle cx="1300" cy="118" r="70" fill="#F6C343" opacity="0.85" />{' '}
      <g fill="#FFFFFF" opacity="0.9">
        <rect x="690" y="132" width="190" height="38" rx="19" />{' '}
        <rect x="736" y="108" width="92" height="46" rx="23" />{' '}
        <rect x="1010" y="236" width="150" height="30" rx="15" />{' '}
        <rect x="1046" y="218" width="70" height="36" rx="18" />
      </g>{' '}
      <path
        d="M560 588 V556 H584 V540 H606 V560 H626 V520 H650 V548 H672 V500 H690 V488 H698 V500 H716 V540 H740 V516 H770 V560 H800 V496 H826 V530 H850 V470 H858 V452 H866 V470 H880 V540 H910 V510 H940 V552 H970 V480 H1000 V530 H1030 V500 H1062 V560 H1090 V470 H1120 V520 H1150 V540 H1180 V490 H1210 V556 H1240 V520 H1270 V548 H1300 V500 H1330 V560 H1360 V530 H1400 V556 H1440 V588 Z"
        fill="#CFC6F0"
      />{' '}
      <rect x="0" y="584" width="1440" height="22" fill="#A99BDD" />{' '}
      <path d="M0 604 C 240 590, 520 600, 760 598 S 1200 590, 1440 600 V900 H0 Z" fill="#D2E7C9" />{' '}
      <path d="M0 780 C 220 752, 480 800, 760 786 S 1220 760, 1440 790 V900 H0 Z" fill="#C3DDB0" />{' '}
      <g>
        <rect x="726" y="552" width="52" height="28" fill="#F3F1FC" />{' '}
        <path d="M720 554 L752 536 L784 554 Z" fill="#6B54C9" />{' '}
        <rect x="733" y="560" width="6" height="16" fill="#CFC6F0" />{' '}
        <rect x="749" y="560" width="6" height="16" fill="#CFC6F0" />{' '}
        <rect x="765" y="560" width="6" height="16" fill="#CFC6F0" />{' '}
        <line x1="752" y1="536" x2="752" y2="512" stroke="#686486" strokeWidth="1.5" />{' '}
        <rect x="752" y="512" width="48" height="15" rx="2" fill="#6B54C9" />{' '}
        <text
          x="776"
          y="523"
          textAnchor="middle"
          fontFamily="Figtree, sans-serif"
          fontSize="10"
          fontWeight="700"
          fill="#FFFFFF"
        >
          {t('landing.sky.career')}
        </text>
      </g>{' '}
      <path
        d="M260 874 C 360 884, 470 852, 530 800 S 560 720, 590 690"
        fill="none"
        stroke="#D6D0EC"
        strokeWidth="34"
        strokeLinecap="round"
      />{' '}
      <path
        d="M590 690 C 620 660, 640 640, 690 610 C 720 592, 740 584, 752 578"
        fill="none"
        stroke="#D6D0EC"
        strokeWidth="18"
        strokeLinecap="round"
      />{' '}
      <path
        d="M260 874 C 360 884, 470 852, 530 800 S 560 720, 590 690"
        fill="none"
        stroke="#F7F5FC"
        strokeWidth="22"
        strokeLinecap="round"
      />{' '}
      <path
        d="M590 690 C 620 660, 640 640, 690 610 C 720 592, 740 584, 752 578"
        fill="none"
        stroke="#F7F5FC"
        strokeWidth="10"
        strokeLinecap="round"
      />{' '}
      <path
        d="M260 874 C 360 884, 470 852, 530 800 S 560 720, 590 690 C 620 660, 640 640, 690 610 C 720 592, 740 584, 752 578"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeDasharray="8 10"
      />{' '}
      <g fontFamily="Figtree, sans-serif" fontWeight="700" textAnchor="middle">
        <line x1="410" y1="842" x2="410" y2="798" stroke="#686486" strokeWidth="2.5" />{' '}
        <rect x="410" y="798" width="60" height="22" rx="3" fill="#F6C343" />{' '}
        <text x="440" y="813.5" fontSize="13" fill="#1B1830">
          {t('landing.sky.prek')}
        </text>{' '}
        <line x1="500" y1="792" x2="500" y2="756" stroke="#686486" strokeWidth="2.2" />{' '}
        <rect x="444" y="756" width="56" height="20" rx="3" fill="#F6C343" />{' '}
        <text x="472" y="770" fontSize="12" fill="#1B1830">
          {t('landing.sky.k5')}
        </text>{' '}
        <line x1="602" y1="732" x2="602" y2="698" stroke="#686486" strokeWidth="2" />{' '}
        <rect x="602" y="698" width="48" height="19" rx="3" fill="#6B54C9" />{' '}
        <text x="626" y="711.5" fontSize="11.5" fill="#FFFFFF">
          {t('landing.sky.g68')}
        </text>{' '}
        <line x1="606" y1="652" x2="606" y2="622" stroke="#686486" strokeWidth="1.8" />{' '}
        <rect x="556" y="622" width="50" height="18" rx="3" fill="#F6C343" />{' '}
        <text x="581" y="634.5" fontSize="11" fill="#1B1830">
          {t('landing.sky.g912')}
        </text>{' '}
        <line x1="700" y1="602" x2="700" y2="576" stroke="#686486" strokeWidth="1.6" />{' '}
        <rect x="650" y="576" width="50" height="16" rx="2" fill="#F6C343" />{' '}
        <text x="675" y="587.5" fontSize="10" fill="#1B1830" {...fit(44)}>
          {t('landing.sky.college')}
        </text>
      </g>{' '}
      <g>
        <rect x="110" y="700" width="300" height="168" fill="#F3F1FC" />{' '}
        <rect x="100" y="686" width="320" height="18" fill="#F6C343" />{' '}
        <path d="M196 686 L260 638 L324 686 Z" fill="#F6C343" />{' '}
        <circle cx="260" cy="668" r="12" fill="#FFFFFF" />{' '}
        <path d="M260 668 V660 M260 668 L266 671" stroke="#1B1830" strokeWidth="2" strokeLinecap="round" />{' '}
        <line x1="260" y1="638" x2="260" y2="592" stroke="#686486" strokeWidth="3" />{' '}
        <rect x="262" y="594" width="30" height="19" fill="#6B54C9" />{' '}
        <rect x="196" y="712" width="128" height="22" rx="4" fill="#1B1830" />{' '}
        <text
          x="260"
          y="728"
          textAnchor="middle"
          fontFamily="Figtree, sans-serif"
          fontSize="12"
          fontWeight="700"
          letterSpacing="3"
          fill="#FFFFFF"
        >
          {t('landing.sky.school')}
        </text>{' '}
        <g fill="#CFE6EA" stroke="#CFC6F0" strokeWidth="2">
          <rect x="128" y="722" width="28" height="34" rx="2" />{' '}
          <rect x="168" y="722" width="28" height="34" rx="2" />{' '}
          <rect x="324" y="722" width="28" height="34" rx="2" />{' '}
          <rect x="364" y="722" width="28" height="34" rx="2" />{' '}
          <rect x="128" y="780" width="28" height="34" rx="2" />{' '}
          <rect x="168" y="780" width="28" height="34" rx="2" />{' '}
          <rect x="324" y="780" width="28" height="34" rx="2" />{' '}
          <rect x="364" y="780" width="28" height="34" rx="2" />
        </g>{' '}
        <path d="M236 868 V818 a24 24 0 0 1 48 0 V868 Z" fill="#6B54C9" />{' '}
        <line x1="260" y1="804" x2="260" y2="868" stroke="#5440A8" strokeWidth="2" />{' '}
        <rect x="222" y="864" width="76" height="8" fill="#D6D0EC" />
      </g>{' '}
      <g fill="none" strokeLinecap="round">
        <path d="M64 874 C 70 820, 56 770, 78 718" stroke="#8A6A4E" strokeWidth="9" />{' '}
        <g stroke="#3F8C5A" strokeWidth="9">
          <path d="M78 718 C 58 700, 36 702, 20 720" /> <path d="M78 718 C 64 694, 44 684, 28 690" />{' '}
          <path d="M78 718 C 84 690, 104 680, 124 688" /> <path d="M78 718 C 100 704, 122 708, 136 726" />{' '}
          <path d="M78 718 C 78 700, 86 688, 96 678" />
        </g>{' '}
        <path d="M474 882 C 480 842, 468 802, 488 764" stroke="#8A6A4E" strokeWidth="7" />{' '}
        <g stroke="#3F8C5A" strokeWidth="7">
          <path d="M488 764 C 472 750, 454 752, 442 766" /> <path d="M488 764 C 476 744, 460 736, 448 742" />{' '}
          <path d="M488 764 C 494 742, 510 734, 526 740" /> <path d="M488 764 C 506 752, 524 756, 534 770" />
        </g>
      </g>{' '}
      <g fill="#8FC48A">
        <circle cx="118" cy="868" r="16" /> <circle cx="142" cy="872" r="12" />{' '}
        <circle cx="396" cy="868" r="16" /> <circle cx="372" cy="872" r="12" />
      </g>{' '}
      <g fill="#1B1830" stroke="#1B1830" strokeLinecap="round">
        <circle cx="330" cy="832" r="7" stroke="none" />{' '}
        <path
          d="M330 840 V862 M330 862 L324 878 M330 862 L336 878 M330 846 L340 854"
          fill="none"
          strokeWidth="4"
        />{' '}
        <circle cx="348" cy="848" r="5" stroke="none" />{' '}
        <path
          d="M348 854 V868 M348 868 L344 879 M348 868 L352 879 M348 858 L341 854"
          fill="none"
          strokeWidth="3.2"
        />
      </g>
    </svg>
  );
}
