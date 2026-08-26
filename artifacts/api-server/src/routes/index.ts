import { Router, type IRouter } from "express";
import healthRouter from "./health";
import calendarRouter from "./calendar";
import appRouter from "./app";
import authRouter from "./auth";
import assistantRouter from "./assistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(assistantRouter);
router.use(calendarRouter);
router.use(appRouter);

export default router;
