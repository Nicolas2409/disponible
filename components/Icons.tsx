// Iconos inline al estilo SF Symbols (trazo redondeado, 24×24).
type P = React.SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const IconHome = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 10.6 12 3.8l8.5 6.8" />
    <path d="M5.8 9v10.2c0 .6.4 1 1 1H10v-5.4c0-.6.4-1 1-1h2c.6 0 1 .4 1 1v5.4h3.2c.6 0 1-.4 1-1V9" />
  </svg>
);

export const IconHomeFill = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden {...p}>
    <path
      fill="currentColor"
      d="M12.6 3.3a1 1 0 0 0-1.2 0L3.1 9.9a.9.9 0 0 0 1.1 1.4l.8-.6v8.5c0 1 .8 1.8 1.8 1.8H10v-5.3c0-.6.4-1 1-1h2c.6 0 1 .4 1 1V21h3.2c1 0 1.8-.8 1.8-1.8v-8.5l.8.6a.9.9 0 0 0 1.1-1.4z"
    />
  </svg>
);

export const IconChart = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 20V13M10 20V8M15 20v-5M20 20V5" />
  </svg>
);

export const IconGear = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
    <circle cx="12" cy="12" r="6.6" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base} strokeWidth={2.6} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconChevronLeft = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const IconChevronDown = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M5 9l7 7 7-7" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base} strokeWidth={3} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const IconMic = (p: P) => (
  <svg {...base} {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V4.8c0-.5.4-.8.8-.8h3.4c.4 0 .8.3.8.8v1.7M6.5 6.5l.8 12.3c.1.7.6 1.2 1.3 1.2h6.8c.7 0 1.2-.5 1.3-1.2l.8-12.3" />
  </svg>
);

export const IconCopy = (p: P) => (
  <svg {...base} {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 5.5v-.3c0-1.2-1-2.2-2.2-2.2H6.2C5 3 4 4 4 5.2v7.1c0 1.2 1 2.2 2.2 2.2h.3" />
  </svg>
);

export const IconDelete = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 5h10.5c.8 0 1.5.7 1.5 1.5v11c0 .8-.7 1.5-1.5 1.5H9l-6-7z" />
    <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
  </svg>
);

export const IconCard = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2.8" y="5.5" width="18.4" height="13" rx="2.6" />
    <path d="M2.8 10h18.4M6.5 15h3" />
  </svg>
);

export const IconRepeat = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19l-3-3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5l3 3" />
  </svg>
);

export const IconMail = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m3.8 7 8.2 6 8.2-6" />
  </svg>
);

export const IconBubble = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 4.5c4.7 0 8.5 3 8.5 6.8S16.7 18 12 18c-.9 0-1.8-.1-2.6-.3L5 19.8l1.2-3.4C4.6 15.1 3.5 13.3 3.5 11.3 3.5 7.5 7.3 4.5 12 4.5z" />
  </svg>
);

export const IconTray = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 13.5 6 5.8c.2-.7.9-1.3 1.7-1.3h8.6c.8 0 1.5.5 1.7 1.3l2.5 7.7" />
    <path d="M3.5 13.5V18c0 .8.7 1.5 1.5 1.5h14c.8 0 1.5-.7 1.5-1.5v-4.5h-5a3.5 3.5 0 0 1-7 0z" />
  </svg>
);
