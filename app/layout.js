import './globals.css';

export const metadata = { title: 'Bingo Buzzer', description: 'Buzz in. Beat the room.' };
export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

const balls = [['B7', 6, 12, 0], ['I22', 84, 20, 1.5], ['N38', 12, 70, 3], ['G51', 90, 75, 4.5], ['O64', 50, 5, 2.2], ['B12', 70, 90, 0.8]];

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Bungee&family=Fredoka:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="balls" aria-hidden="true">
          {balls.map(([t, x, y, d]) => (
            <span key={t} style={{ left: x + '%', top: y + '%', animationDelay: d + 's' }}>{t}</span>
          ))}
        </div>
        <main>{children}</main>
      </body>
    </html>
  );
}
