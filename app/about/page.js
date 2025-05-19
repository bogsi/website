export default function AboutPage() {
  return (
    <section className="p-12 max-w-3xl mx-auto">
      <h2 className="text-4xl font-bold text-primary mb-6">About Me</h2>
      <p className="mb-4">I'm Bogomil Roussev, a dedicated Security Analyst and aspiring DevOps Engineer based in Bulgaria. With a background in financial consulting and a passion for secure and scalable infrastructure, I focus on bridging the gap between development and operations.</p>
      <p className="mb-4">Outside of work, I enjoy learning, journaling, and spending time with my wife and our dog.</p>
      <p className="mb-4">Connect with me:</p>
      <ul className="list-disc ml-6">
        <li><a href="https://www.linkedin.com/in/bogomilroussev/" target="_blank" className="text-primary underline">LinkedIn Profile</a></li>
        <li><a href="tel:+359878880112" className="text-primary underline">+359 878 880112</a></li>
      </ul>
    </section>
  )
}