export default function Select({ label, error, id, required, options = [], placeholder = 'Select…', className = '', ...props }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
          {label}
          {required && <span style={{ color: 'var(--teal)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <select
        id={id}
        {...props}
        className={`input-base ${error ? 'input-error' : ''}`}
        style={{ cursor: 'pointer' }}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value ?? opt} value={opt.value ?? opt}>
            {opt.label ?? opt}
          </option>
        ))}
      </select>
      {error && (
        <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 2 }}>{error}</p>
      )}
    </div>
  );
}
