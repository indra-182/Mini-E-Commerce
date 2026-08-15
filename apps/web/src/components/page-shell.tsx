export function PageShell({
  children,
  description,
  eyebrow,
  title,
}: Readonly<{
  children?: React.ReactNode;
  description: string;
  eyebrow?: string;
  title: string;
}>) {
  return (
    <div className="page-container">
      <header className="page-intro">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p className="lead">{description}</p>
      </header>
      {children}
    </div>
  );
}
