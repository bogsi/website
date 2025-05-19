import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold text-primary mb-4">Bogomil Roussev</h1>
      <p className="text-lg mb-6">Welcome to my personal site!</p>
      <div className="space-x-4">
        <Link href="/about" className="text-primary underline">About Me</Link>
        <Link href="/experience" className="text-primary underline">Experience</Link>
        <Link href="/projects" className="text-primary underline">Projects</Link>
        <Link href="/blog" className="text-primary underline">Blog</Link>
      </div>
    </main>
  )
}