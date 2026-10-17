// Frosted-glass card used on the detail pages.
export default function Card({ as: Tag = 'section', style, children, ...rest }) {
  return (
    <Tag
      {...rest}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: 24,
        borderRadius: 22,
        background: 'var(--glass)',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
        border: '1px solid var(--edge)',
        boxShadow: 'var(--shadow)',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export const h2 = { margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 26, fontWeight: 700 };
