import './globals.css';

export const metadata = {
  title: 'ANVIL — bounties judged by the contract itself',
  description:
    'Sponsors post code bounties on GenLayer. Builders submit GitHub repos. The intelligent contract reads every repo, scores it against the sponsor criteria and pays the winner on chain.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
