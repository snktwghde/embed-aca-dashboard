import "./globals.css";

export const metadata = {
  title: "Embed ACA — AP Operations",
  description: "Accounts Payable Operations Control Center",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
