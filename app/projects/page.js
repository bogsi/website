export default function ProjectsPage() {
  return (
    <section className="p-12 max-w-5xl mx-auto">
      <h2 className="text-4xl font-bold text-primary mb-8">Personal Projects</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-6 border rounded-xl shadow-sm bg-white hover:shadow-md transition">
          <h3 className="text-2xl font-semibold mb-2">Infrastructure Landing Page</h3>
          <p>Stylish CV page deployed on AWS using Terraform in a modular way.</p>
        </div>
        <div className="p-6 border rounded-xl shadow-sm bg-white hover:shadow-md transition">
          <h3 className="text-2xl font-semibold mb-2">Kubernetes Home Lab</h3>
          <p>Built a personal cluster on a 1U rack server for DevOps learning and CI/CD experimentation.</p>
        </div>
      </div>
    </section>
  )
}