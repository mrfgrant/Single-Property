import { type Request, type Response, type NextFunction } from "express";

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    res.status(500).json({ error: "ADMIN_PASSWORD not configured" });
    return;
  }
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== password) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
