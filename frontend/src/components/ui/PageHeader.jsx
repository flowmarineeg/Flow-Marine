import Button from './Button';

export default function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
