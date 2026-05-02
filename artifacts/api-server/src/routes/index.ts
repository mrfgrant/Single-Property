import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import analyticsRouter from "./analytics.js";
import domainAdminRouter from "./domainAdmin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyticsRouter);
router.use(domainAdminRouter);

export default router;
