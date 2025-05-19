import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-white text-dark font-sans">
        <header className="bg-white shadow-md px-8 py-4 flex justify-between items-center">
          <a href="/" className="text-2xl font-bold text-primary">Roussev.Dev</a>
          <nav className="space-x-6">
            <a href="/about" className="text-dark hover:text-primary">About</a>
            <a href="/experience" className="text-dark hover:text-primary">Experience</a>
            <a href="/projects" className="text-dark hover:text-primary">Projects</a>
            <a href="/blog" className="text-dark hover:text-primary">Blog</a>
          </nav>
        </header>
        <main className="min-h-screen">{children}</main>
        <footer className="bg-gray-100 text-center py-4 text-sm text-gray-600">
          © 2025 Bogomil Roussev · <a href="https://www.linkedin.com/in/bogomilroussev/" className="text-primary underline">LinkedIn</a> · <a href="tel:+359878880112" className="text-primary underline">+359878880112</a>
        </footer>
      </body>
    </html>
  )
}