import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-warm-white">
      <div className="w-full max-w-md mx-4 p-8 border border-border rounded-lg">
        <div className="flex gap-3 items-center mb-4">
          <AlertCircle className="h-6 w-6 text-muted" />
          <h1 className="text-xl font-bold text-ink">404 — Page Not Found</h1>
        </div>
        <p className="text-sm text-muted font-light">
          The page you're looking for doesn't exist.{" "}
          <a href="/" className="text-gold hover:underline">Go home</a>
        </p>
      </div>
    </div>
  );
}
