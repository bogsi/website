export default function ExperiencePage() {
  return (
    <section className="p-12 max-w-4xl mx-auto">
      <h2 className="text-4xl font-bold text-primary mb-6">Professional Experience</h2>
      <div className="space-y-8">
        <div>
          <h3 className="text-2xl font-semibold">Security Analyst · Freelance</h3>
          <p className="text-sm text-gray-500">2024 – Present</p>
          <p className="mt-2">Perform vulnerability assessments, manage cloud security policies, and build secure-by-design infrastructure on AWS.</p>
        </div>
        <div>
          <h3 className="text-2xl font-semibold">Financial Consultant</h3>
          <p className="text-sm text-gray-500">2021 – 2024</p>
          <p className="mt-2">Helped clients with financial literacy, investment planning, and long-term wealth strategies.</p>
        </div>
      </div>
    </section>
  )
}