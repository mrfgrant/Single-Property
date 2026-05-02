import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import analyticsRouter from "./analytics.js";
import domainAdminRouter from "./domainAdmin.js";
import onboardingRouter from "./onboarding.js";
import activationRouter from "./activation.js";
import agentsRouter from "./agents.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyticsRouter);
router.use(domainAdminRouter);
router.use(onboardingRouter);
router.use(activationRouter);
router.use(agentsRouter);

export default router;
