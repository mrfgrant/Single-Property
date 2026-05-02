import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import analyticsRouter from "./analytics.js";
import domainAdminRouter from "./domainAdmin.js";
import onboardingRouter from "./onboarding.js";
import activationRouter from "./activation.js";
import agentsRouter from "./agents.js";
import waitlistRouter from "./waitlist.js";
import marketCheckRouter from "./marketCheck.js";
import exampleListingsRouter from "./exampleListings.js";
import adminListingsRouter from "./adminListings.js";
import storageRouter from "./storage.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyticsRouter);
router.use(domainAdminRouter);
router.use(onboardingRouter);
router.use(activationRouter);
router.use(agentsRouter);
router.use(waitlistRouter);
router.use(marketCheckRouter);
router.use(exampleListingsRouter);
router.use(adminListingsRouter);
router.use(storageRouter);

export default router;
