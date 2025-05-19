export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-white text-dark">{children}</body>
    </html>
  )
}