// Arte del ícono para ImageResponse (apple-icon y PNG del manifest). Solo estilos inline.
export function AppIconArt({ size, rounded }: { size: number; rounded: boolean }) {
  const s = size / 512;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #3a9bff 0%, #0060df 100%)",
        borderRadius: rounded ? 115 * s : 0,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 512 512">
        <circle cx="256" cy="256" r="128" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="44" />
        <path
          d="M256 128a128 128 0 1 1-121.7 88.4"
          fill="none"
          stroke="#ffffff"
          strokeWidth="44"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
