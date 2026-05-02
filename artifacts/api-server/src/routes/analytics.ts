import { Router } from "express";
import { logger } from "../lib/logger";

const analyticsRouter = Router();

analyticsRouter.post("/analytics/events", (req, res) => {
  const { event, ...props } = req.body ?? {};
  if (!event || typeof event !== "string") {
    res.status(400).json({ error: "event name required" });
    return;
  }
  logger.info({ event, ...props }, "analytics_event");
  res.status(204).end();
});

export default analyticsRouter;
