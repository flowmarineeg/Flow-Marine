import './globals.css';
import Providers from '@/components/Providers';

export const metadata = {
  title: 'Logistics SaaS',
  description: 'Logistics & Shipping Operations Platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
