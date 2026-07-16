export default function Button({
  children, type = 'button', variant = 'primary', size = 'md',
  disabled = false, loading = false, onClick, className = '',
}) {
  const sizes    = { sm: 'btn-sm', md: 'btn-md', lg: 'btn-lg' };
  const variants = {
    primary:   'btn-primary',
    secondary: 'btn-secondary',
    danger:    'btn-danger',
    ghost:     'btn-ghost',
    success:   'btn-primary',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`btn ${variants[variant] || 'btn-primary'} ${sizes[size] || 'btn-md'} ${className}`}
    >
      {loading && (
        <span
          style={{
            width: 14, height: 14, border: '2px solid currentColor',
            borderTopColor: 'transparent', borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite',
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </button>
  );
}
